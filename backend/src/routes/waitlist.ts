import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────────

const addToWaitlistSchema = z.object({
  patientId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  preferredDate: z.string().optional(), // ISO date string
  preferredTime: z.enum(['morning', 'afternoon', 'evening']).optional(),
});

const notifySchema = z.object({
  waitlistId: z.string().uuid(),
  message: z.string().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
  serviceId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────────

export default async function waitlistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ─── Add to waitlist (org-scoped: POST /:orgId) ────────────────────────

  /**
   * POST /api/waitlist/:orgId
   * Add a patient to the appointment waitlist (org-scoped alias)
   */
  app.post<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = addToWaitlistSchema.parse(request.body);

    const patient = await app.prisma.patient.findFirst({
      where: { patientId: body.patientId, orgId },
    });
    if (!patient) return { error: 'Patient not found in this organisation' };

    const existing = await app.prisma.waitlist.findFirst({
      where: {
        orgId, patientId: body.patientId, status: 'waiting',
        ...(body.serviceId && { serviceId: body.serviceId }),
        ...(body.providerId && { providerId: body.providerId }),
      },
    });
    if (existing) return { error: 'Patient is already on the waitlist for this service/provider', existingId: existing.waitlistId };

    const entry = await app.prisma.waitlist.create({
      data: {
        orgId, patientId: body.patientId, serviceId: body.serviceId ?? null,
        providerId: body.providerId ?? null, facilityId: body.facilityId ?? null,
        priority: body.priority, preferredDate: body.preferredDate ? new Date(body.preferredDate) : null,
        preferredTime: body.preferredTime ?? null, status: 'waiting',
      },
    });

    return { success: true, data: entry };
  });

  // ─── Notify waitlisted patient (org-scoped: POST /:orgId/:id/notify) ──

  /**
   * POST /api/waitlist/:orgId/:id/notify
   */
  app.post<{ Params: { orgId: string; id: string } }>('/:orgId/:id/notify', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, id } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = z.object({ message: z.string().optional() }).parse(request.body);

    const entry = await app.prisma.waitlist.findFirst({
      where: { waitlistId: id, orgId },
    });
    if (!entry) return { error: 'Waitlist entry not found' };
    if (entry.status !== 'waiting') return { error: `Cannot notify — current status is "${entry.status}"` };

    const contacts = await app.prisma.patientContact.findMany({
      where: { patientId: entry.patientId, contactType: 'phone' },
      select: { contactValue: true, isPrimary: true },
      orderBy: { isPrimary: 'desc' },
    });

    const phone = contacts[0]?.contactValue ?? null;

    const updated = await app.prisma.waitlist.update({
      where: { waitlistId: id },
      data: { status: 'notified', notifiedAt: new Date() },
    });

    return {
      success: true,
      data: updated,
      notification: {
        phone,
        message: body.message ?? 'A slot has opened up! Please call us or book online to secure your appointment.',
        messageAr: 'تتوفر فتحة في المواعيد! يرجى الاتصال بنا أو الحجز عبر الإنترنت لتأكيد موعدك.',
      },
    };
  });

  // ─── Waitlist stats (org-scoped: GET /:orgId/stats) ───────────────────

  /**
   * GET /api/waitlist/:orgId/stats
   */
  app.get<{ Params: { orgId: string } }>('/:orgId/stats', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const [waiting, notified, booked, expired] = await Promise.all([
      app.prisma.waitlist.count({ where: { orgId, status: 'waiting' } }),
      app.prisma.waitlist.count({ where: { orgId, status: 'notified' } }),
      app.prisma.waitlist.count({ where: { orgId, status: 'booked' } }),
      app.prisma.waitlist.count({ where: { orgId, status: 'expired' } }),
    ]);

    return { total: waiting + notified + booked + expired, waiting, notified, booked, expired };
  });

  // ─── Add to waitlist ──────────────────────────────────────────────────────

  /**
   * POST /api/waitlist/add
   * Add a patient to the appointment waitlist
   */
  app.post('/add', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = addToWaitlistSchema.parse(request.body);

    // Verify the patient exists and belongs to this org
    const patient = await app.prisma.patient.findFirst({
      where: { patientId: body.patientId, orgId },
    });
    if (!patient) {
      return { error: 'Patient not found in this organisation' };
    }

    // Check for duplicate active waitlist entry
    const existing = await app.prisma.waitlist.findFirst({
      where: {
        orgId,
        patientId: body.patientId,
        status: 'waiting',
        ...(body.serviceId && { serviceId: body.serviceId }),
        ...(body.providerId && { providerId: body.providerId }),
      },
    });
    if (existing) {
      return {
        error: 'Patient is already on the waitlist for this service/provider',
        existingId: existing.waitlistId,
      };
    }

    const entry = await app.prisma.waitlist.create({
      data: {
        orgId,
        patientId: body.patientId,
        serviceId: body.serviceId ?? null,
        providerId: body.providerId ?? null,
        facilityId: body.facilityId ?? null,
        priority: body.priority,
        preferredDate: body.preferredDate ? new Date(body.preferredDate) : null,
        preferredTime: body.preferredTime ?? null,
        status: 'waiting',
      },
    });

    return { success: true, data: entry };
  });

  // ─── List waitlist entries ────────────────────────────────────────────────

  /**
   * GET /api/waitlist/:orgId
   * List waitlist entries for the org, ordered by priority (desc) then creation time
   */
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId: paramOrgId } = request.params;

    // Ensure user can only access their own org
    if (userOrgId !== paramOrgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where: Record<string, unknown> = { orgId: paramOrgId };
    if (query.status) where.status = query.status;
    if (query.serviceId) where.serviceId = query.serviceId;
    if (query.providerId) where.providerId = query.providerId;

    const [entries, total] = await Promise.all([
      app.prisma.waitlist.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
      app.prisma.waitlist.count({ where }),
    ]);

    // Enrich with patient name
    const patientIds = [...new Set(entries.map((e) => e.patientId))];
    const patients = await app.prisma.patient.findMany({
      where: { patientId: { in: patientIds } },
      select: { patientId: true, firstName: true, lastName: true },
    });
    const patientMap = new Map(patients.map((p) => [p.patientId, p]));

    const data = entries.map((entry) => {
      const patient = patientMap.get(entry.patientId);
      return {
        ...entry,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
      };
    });

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // ─── Notify patient of opening ────────────────────────────────────────────

  /**
   * POST /api/waitlist/notify
   * Notify a waitlisted patient that a slot has opened
   */
  app.post('/notify', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = notifySchema.parse(request.body);

    const entry = await app.prisma.waitlist.findFirst({
      where: { waitlistId: body.waitlistId, orgId },
    });
    if (!entry) {
      return { error: 'Waitlist entry not found' };
    }
    if (entry.status !== 'waiting') {
      return { error: `Cannot notify — current status is "${entry.status}"` };
    }

    // Get patient contact info for notification
    const contacts = await app.prisma.patientContact.findMany({
      where: { patientId: entry.patientId, contactType: 'phone' },
      select: { contactValue: true, isPrimary: true },
      orderBy: { isPrimary: 'desc' },
    });

    const phone = contacts[0]?.contactValue ?? null;

    // Update status to notified
    const updated = await app.prisma.waitlist.update({
      where: { waitlistId: body.waitlistId },
      data: {
        status: 'notified',
        notifiedAt: new Date(),
      },
    });

    // NOTE: In a full implementation this would trigger an SMS/WhatsApp via Twilio.
    // For now we return the phone so the caller can trigger messaging separately.

    return {
      success: true,
      data: updated,
      notification: {
        phone,
        message:
          body.message ??
          'A slot has opened up! Please call us or book online to secure your appointment.',
        messageAr:
          'تتوفر فتحة في المواعيد! يرجى الاتصال بنا أو الحجز عبر الإنترنت لتأكيد موعدك.',
      },
    };
  });

  // ─── Mark as booked ───────────────────────────────────────────────────────

  /**
   * PATCH /api/waitlist/:id/book
   * Mark a waitlist entry as booked (after the patient books their appointment)
   */
  app.patch<{ Params: { id: string } }>('/:id/book', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const entry = await app.prisma.waitlist.findFirst({
      where: { waitlistId: id, orgId },
    });
    if (!entry) {
      return { error: 'Waitlist entry not found' };
    }

    const updated = await app.prisma.waitlist.update({
      where: { waitlistId: id },
      data: { status: 'booked' },
    });

    return { success: true, data: updated };
  });

  // ─── Remove from waitlist ─────────────────────────────────────────────────

  /**
   * DELETE /api/waitlist/:id
   * Remove a patient from the waitlist
   */
  app.delete<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const entry = await app.prisma.waitlist.findFirst({
      where: { waitlistId: id, orgId },
    });
    if (!entry) {
      return { error: 'Waitlist entry not found' };
    }

    await app.prisma.waitlist.delete({
      where: { waitlistId: id },
    });

    return { success: true };
  });

  // ─── Waitlist stats ───────────────────────────────────────────────────────

  /**
   * GET /api/waitlist/stats/:orgId
   * Quick stats for the waitlist dashboard
   */
  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId: paramOrgId } = request.params;

    if (userOrgId !== paramOrgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const [waiting, notified, booked, expired] = await Promise.all([
      app.prisma.waitlist.count({ where: { orgId: paramOrgId, status: 'waiting' } }),
      app.prisma.waitlist.count({ where: { orgId: paramOrgId, status: 'notified' } }),
      app.prisma.waitlist.count({ where: { orgId: paramOrgId, status: 'booked' } }),
      app.prisma.waitlist.count({ where: { orgId: paramOrgId, status: 'expired' } }),
    ]);

    return {
      total: waiting + notified + booked + expired,
      waiting,
      notified,
      booked,
      expired,
    };
  });
}
