import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getWaitlistAutoFill } from '../services/pipelines/waitlistAutoFill.js';

const createAppointmentSchema = z.object({
  providerId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  facilityId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  startTs: z.string(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'held', 'booked', 'confirmed', 'checked_in',
    'in_progress', 'completed', 'cancelled', 'no_show', 'expired'
  ]),
  reason: z.string().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  providerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export default async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List appointments
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = querySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const where = {
      orgId,
      ...(query.providerId && { providerId: query.providerId }),
      ...(query.patientId && { patientId: query.patientId }),
      ...(query.status && { status: query.status as any }),
      ...(query.from && { startTs: { gte: new Date(query.from) } }),
      ...(query.to && { startTs: { lte: new Date(query.to) } }),
    };

    const [appointments, total] = await Promise.all([
      app.prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          provider: true,
          patient: true,
          service: true,
          facility: true,
        },
        orderBy: { startTs: 'asc' },
      }),
      app.prisma.appointment.count({ where }),
    ]);

    return {
      data: appointments,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  // Get single appointment
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const appointment = await app.prisma.appointment.findFirst({
      where: { appointmentId: id, orgId },
      include: {
        provider: true,
        patient: true,
        service: true,
        facility: true,
        department: true,
        statusHistory: {
          orderBy: { changedAt: 'desc' },
        },
      },
    });

    if (!appointment) {
      return { error: 'Appointment not found' };
    }

    return appointment;
  });

  // Create appointment
  app.post('/', async (request: FastifyRequest) => {
    const { orgId, userId } = request.user;
    const body = createAppointmentSchema.parse(request.body);

    // Get service to calculate end time
    const service = await app.prisma.service.findUnique({
      where: { serviceId: body.serviceId },
    });

    if (!service) {
      return { error: 'Service not found' };
    }

    const startTs = new Date(body.startTs);
    const endTs = new Date(startTs.getTime() + service.durationMin * 60000);

    const appointment = await app.prisma.appointment.create({
      data: {
        orgId,
        providerId: body.providerId,
        patientId: body.patientId,
        serviceId: body.serviceId,
        facilityId: body.facilityId,
        departmentId: body.departmentId,
        startTs,
        endTs,
        status: 'booked',
        reason: body.reason,
        notes: body.notes,
        statusHistory: {
          create: {
            newStatus: 'booked',
            changedBy: userId,
          },
        },
      },
      include: {
        provider: true,
        patient: true,
        service: true,
      },
    });

    return appointment;
  });

  // Update appointment status
  app.patch<{ Params: { id: string } }>('/:id/status', async (request) => {
    const { orgId, userId } = request.user;
    const { id } = request.params;
    const body = updateStatusSchema.parse(request.body);

    const existing = await app.prisma.appointment.findFirst({
      where: { appointmentId: id, orgId },
    });

    if (!existing) {
      return { error: 'Appointment not found' };
    }

    const appointment = await app.prisma.appointment.update({
      where: { appointmentId: id },
      data: {
        status: body.status,
        statusHistory: {
          create: {
            oldStatus: existing.status,
            newStatus: body.status,
            changedBy: userId,
            reason: body.reason,
          },
        },
      },
      include: {
        provider: true,
        patient: true,
        service: true,
      },
    });

    // Trigger waitlist auto-fill when appointment is cancelled
    if (body.status === 'cancelled') {
      try {
        const waitlistAutoFill = getWaitlistAutoFill(app.prisma, app.twilio ?? null);
        // Fire-and-forget — don't block the response
        waitlistAutoFill.onAppointmentCancelled(id).catch((err) => {
          app.log.error(`Waitlist auto-fill error for appointment ${id}: ${err?.message}`);
        });
      } catch (err: any) {
        app.log.error(`Failed to trigger waitlist auto-fill: ${err?.message}`);
      }
    }

    return appointment;
  });

  // Check availability for a provider
  app.get<{ Params: { providerId: string } }>('/availability/:providerId', async (request) => {
    const { orgId } = request.user;
    const { providerId } = request.params;
    const query = z.object({
      date: z.string(),
      serviceId: z.string().uuid(),
    }).parse(request.query);

    const date = new Date(query.date);
    const dayOfWeek = date.getDay();

    // Get provider's availability rules for this day
    const rules = await app.prisma.providerAvailabilityRule.findMany({
      where: {
        providerId,
        dayOfWeek,
        validFrom: { lte: date },
        OR: [
          { validTo: null },
          { validTo: { gte: date } },
        ],
      },
    });

    // Get existing appointments for this day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await app.prisma.appointment.findMany({
      where: {
        providerId,
        startTs: { gte: startOfDay, lte: endOfDay },
        status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
      },
    });

    // Get service duration
    const service = await app.prisma.service.findUnique({
      where: { serviceId: query.serviceId },
    });

    if (!service) {
      return { error: 'Service not found' };
    }

    // Calculate available slots
    const slots: { start: string; end: string }[] = [];

    for (const rule of rules) {
      // Generate slots based on rule
      // This is a simplified version - you'd want more complex logic here
      const ruleStart = new Date(date);
      const [startHour, startMin] = rule.startLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleStart.setHours(startHour, startMin, 0, 0);

      const ruleEnd = new Date(date);
      const [endHour, endMin] = rule.endLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleEnd.setHours(endHour, endMin, 0, 0);

      let slotStart = new Date(ruleStart);
      while (slotStart.getTime() + service.durationMin * 60000 <= ruleEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000);

        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.some(apt =>
          slotStart < apt.endTs && slotEnd > apt.startTs
        );

        if (!hasConflict) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }

        slotStart = new Date(slotStart.getTime() + rule.slotIntervalMin * 60000);
      }
    }

    return { slots };
  });
}
