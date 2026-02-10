import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { RxManager } from '../services/prescription/rxManager.js';

// ─────────────────────────────────────────────────────────
// Prescription API Routes
// ─────────────────────────────────────────────────────────

const createSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  medicationName: z.string().min(1),
  medicationNameAr: z.string().optional(),
  dosage: z.string().min(1),
  frequency: z.enum(['once_daily', 'twice_daily', 'three_daily', 'as_needed']),
  refillsTotal: z.number().int().min(0).default(0),
  startDate: z.string(), // ISO date
  endDate: z.string().optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  dosage: z.string().optional(),
  frequency: z.enum(['once_daily', 'twice_daily', 'three_daily', 'as_needed']).optional(),
  refillsRemaining: z.number().int().min(0).optional(),
  endDate: z.string().optional(),
  pharmacyName: z.string().optional(),
  pharmacyPhone: z.string().optional(),
  notes: z.string().optional(),
});

const refillSchema = z.object({
  requestedVia: z.enum(['voice', 'whatsapp', 'web', 'sms']),
  conversationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const querySchema = z.object({
  status: z.enum(['active', 'completed', 'cancelled', 'expired']).optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

const reminderSchema = z.object({
  prescriptionId: z.string().uuid(),
  channel: z.enum(['sms', 'whatsapp']),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
});

export default async function prescriptionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const rx = new RxManager(app.prisma);

  // ──── POST /api/prescriptions — Create prescription ────
  app.post('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createSchema.parse(request.body);

    const result = await rx.create({ ...body, orgId });

    return {
      data: result.prescription,
      interactions: result.interactions,
      ...(result.interactions.length > 0 && {
        warning: `⚠ ${result.interactions.length} potential drug interaction(s) detected`,
      }),
    };
  });

  // ──── GET /api/prescriptions/patient/:patientId — List patient prescriptions ────
  app.get<{ Params: { patientId: string } }>('/patient/:patientId', async (request) => {
    const { orgId } = request.user;
    const { patientId } = request.params;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      orgId,
      patientId,
      ...(query.status && { status: query.status }),
    };

    const [prescriptions, total] = await Promise.all([
      app.prisma.prescription.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          refills: { orderBy: { requestedAt: 'desc' as const }, take: 1 },
          reminders: { where: { isActive: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.prescription.count({ where }),
    ]);

    return {
      data: prescriptions,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ──── POST /api/prescriptions/:id/refill — Request refill ────
  app.post<{ Params: { id: string } }>('/:id/refill', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = refillSchema.parse(request.body);

    const result = await rx.requestRefill(id, orgId, body);

    if (!result.success) {
      return { error: result.message, errorAr: result.messageAr, refillId: result.refillId };
    }

    return {
      data: { refillId: result.refillId },
      message: result.message,
      messageAr: result.messageAr,
    };
  });

  // ──── GET /api/prescriptions/:id/status — Check refill status ────
  app.get<{ Params: { id: string } }>('/:id/status', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const result = await rx.getRefillStatus(id, orgId);

    if (!result) {
      return { error: 'Prescription not found' };
    }

    return { data: result };
  });

  // ──── PATCH /api/prescriptions/:id — Update prescription ────
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = updateSchema.parse(request.body);

    const updated = await rx.update(id, orgId, body);

    if (!updated) {
      return { error: 'Prescription not found' };
    }

    return { data: updated };
  });

  // ──── GET /api/prescriptions/:id — Get single prescription ────
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const prescription = await rx.getById(id, orgId);

    if (!prescription) {
      return { error: 'Prescription not found' };
    }

    return { data: prescription };
  });

  // ──── POST /api/prescriptions/:id/refill/:refillId/process — Process refill (admin) ────
  app.post<{ Params: { id: string; refillId: string } }>('/:id/refill/:refillId/process', async (request) => {
    const { userId } = request.user;
    const { refillId } = request.params;
    const body = z.object({
      action: z.enum(['approved', 'dispensed', 'denied']),
      notes: z.string().optional(),
    }).parse(request.body);

    const result = await rx.processRefill(refillId, body.action, userId, body.notes);

    if (!result) {
      return { error: 'Refill not found' };
    }

    return { data: result };
  });

  // ──── Drug interaction check ────
  app.get<{ Params: { patientId: string } }>('/patient/:patientId/interactions', async (request) => {
    const { orgId } = request.user;
    const { patientId } = request.params;
    const query = z.object({ medication: z.string() }).parse(request.query);

    const flags = await rx.checkInteractions(patientId, orgId, query.medication);

    return { data: flags };
  });

  // ──── Medication reminders ────
  app.post('/reminders', async (request: FastifyRequest) => {
    const body = reminderSchema.parse(request.body);

    // Verify prescription exists
    const prescription = await app.prisma.prescription.findUnique({
      where: { prescriptionId: body.prescriptionId },
      select: { patientId: true },
    });

    if (!prescription) {
      return { error: 'Prescription not found' };
    }

    const reminder = await rx.createReminder({
      patientId: prescription.patientId,
      ...body,
    });

    return { data: reminder };
  });

  app.get<{ Params: { patientId: string } }>('/patient/:patientId/reminders', async (request) => {
    const { patientId } = request.params;
    const reminders = await rx.listReminders(patientId);
    return { data: reminders };
  });

  app.patch<{ Params: { reminderId: string } }>('/reminders/:reminderId', async (request) => {
    const { reminderId } = request.params;
    const body = z.object({ isActive: z.boolean() }).parse(request.body);

    const reminder = await rx.toggleReminder(reminderId, body.isActive);
    return { data: reminder };
  });
}
