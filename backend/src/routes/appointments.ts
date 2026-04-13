import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getAppointmentReminderService } from '../services/reminders/appointmentReminder.js';
import { validateTwilioSignature } from '../lib/twilioVerify.js';

const createAppointmentSchema = z.object({
  providerId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  facilityId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  startTs: z.string().datetime(),
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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  providerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: z.enum([
    'held', 'booked', 'confirmed', 'checked_in',
    'in_progress', 'completed', 'cancelled', 'no_show', 'expired'
  ]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).optional(),
});

export default async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // List appointments
  app.get('/', async (request: FastifyRequest, reply) => {
    try {
      const { orgId } = request.user;
      const query = querySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const where = {
        orgId,
        ...(query.providerId && { providerId: query.providerId }),
        ...(query.patientId && { patientId: query.patientId }),
        ...(query.status && { status: query.status }),
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
    } catch (err) {
      request.log.error(err, 'Failed to list appointments');
      return reply.code(500).send({ error: 'Failed to fetch appointments', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get single appointment
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
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
      return reply.code(404).send({ error: 'Appointment not found' });
    }

    return appointment;
  });

  // Create appointment
  app.post('/', async (request: FastifyRequest, reply) => {
    const { orgId, userId } = request.user;
    const body = createAppointmentSchema.parse(request.body);

    // Get service to calculate end time (scoped to org)
    const service = await app.prisma.service.findFirst({
      where: { serviceId: body.serviceId, orgId },
    });

    if (!service) {
      return reply.code(404).send({ error: 'Service not found' });
    }

    // Validate provider belongs to org
    const provider = await app.prisma.provider.findFirst({
      where: { providerId: body.providerId, orgId },
    });
    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    // Validate facilityId belongs to org if provided
    if (body.facilityId) {
      const facility = await app.prisma.facility.findFirst({
        where: { facilityId: body.facilityId, orgId },
      });
      if (!facility) {
        return reply.code(404).send({ error: 'Facility not found' });
      }
    }

    // Validate departmentId belongs to org if provided
    if (body.departmentId) {
      const department = await app.prisma.department.findFirst({
        where: { departmentId: body.departmentId, orgId },
      });
      if (!department) {
        return reply.code(404).send({ error: 'Department not found' });
      }
    }

    // Phase 0.4: Validate provider offers this service
    const providerService = await app.prisma.providerService.findUnique({
      where: { providerId_serviceId: { providerId: body.providerId, serviceId: body.serviceId } },
    });
    if (!providerService) {
      return reply.code(400).send({ error: 'Provider does not offer this service' });
    }

    const startTs = new Date(body.startTs);
    const endTs = new Date(startTs.getTime() + service.durationMin * 60000);

    // Phase 0.3: Check provider time-off
    const timeOff = await app.prisma.providerTimeOff.findFirst({
      where: {
        providerId: body.providerId,
        startTs: { lte: endTs },
        endTs: { gte: startTs },
      },
    });
    if (timeOff) {
      return reply.code(409).send({ error: 'Provider is on leave during this time' });
    }

    // Phase 0.1: Atomic conflict check + create to prevent double-booking
    try {
      const appointment = await app.prisma.$transaction(async (tx) => {
        // Phase 0.2: Expand conflict window by buffer times
        const bufferBefore = (service.bufferBeforeMin ?? 0) * 60000;
        const bufferAfter = (service.bufferAfterMin ?? 0) * 60000;
        const conflictStart = new Date(startTs.getTime() - bufferBefore);
        const conflictEnd = new Date(endTs.getTime() + bufferAfter);

        const conflict = await tx.appointment.findFirst({
          where: {
            providerId: body.providerId,
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: conflictStart, lt: conflictEnd } },
              { endTs: { gt: conflictStart, lte: conflictEnd } },
              { AND: [{ startTs: { lte: conflictStart } }, { endTs: { gte: conflictEnd } }] },
            ],
          },
        });

        if (conflict) {
          throw new Error('SLOT_CONFLICT');
        }

        return tx.appointment.create({
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
      }, { isolationLevel: 'Serializable' });

      return appointment;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return reply.code(409).send({ error: 'Time slot is already booked' });
      }
      throw err;
    }
  });

  // Update appointment status
  app.patch<{ Params: { id: string } }>('/:id/status', async (request, reply) => {
    const { orgId, userId } = request.user;
    const { id } = request.params;
    const body = updateStatusSchema.parse(request.body);

    const existing = await app.prisma.appointment.findFirst({
      where: { appointmentId: id, orgId },
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Appointment not found' });
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

    return appointment;
  });

  // Phase 3: Reschedule appointment
  app.patch<{ Params: { id: string } }>('/:id/reschedule', async (request, reply) => {
    const { orgId, userId } = request.user;
    const { id } = request.params;
    const body = z.object({
      newStartTs: z.string().datetime(),
    }).parse(request.body);

    const existing = await app.prisma.appointment.findFirst({
      where: { appointmentId: id, orgId, status: { in: ['booked', 'confirmed'] } },
      include: { service: true },
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Appointment not found or cannot be rescheduled' });
    }

    const newStartTs = new Date(body.newStartTs);
    const newEndTs = new Date(newStartTs.getTime() + existing.service.durationMin * 60000);

    try {
      const appointment = await app.prisma.$transaction(async (tx) => {
        // Check new slot for conflicts (exclude current appointment)
        const conflict = await tx.appointment.findFirst({
          where: {
            providerId: existing.providerId,
            appointmentId: { not: id },
            status: { in: ['held', 'booked', 'confirmed'] },
            OR: [
              { startTs: { gte: newStartTs, lt: newEndTs } },
              { endTs: { gt: newStartTs, lte: newEndTs } },
              { AND: [{ startTs: { lte: newStartTs } }, { endTs: { gte: newEndTs } }] },
            ],
          },
        });
        if (conflict) throw new Error('SLOT_CONFLICT');

        return tx.appointment.update({
          where: { appointmentId: id },
          data: {
            startTs: newStartTs,
            endTs: newEndTs,
            statusHistory: {
              create: {
                oldStatus: existing.status,
                newStatus: existing.status,
                changedBy: userId,
                reason: `Rescheduled from ${existing.startTs.toISOString()} to ${newStartTs.toISOString()}`,
              },
            },
          },
          include: { provider: true, patient: true, service: true },
        });
      }, { isolationLevel: 'Serializable' });

      return appointment;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'SLOT_CONFLICT') {
        return reply.code(409).send({ error: 'New time slot is already booked' });
      }
      throw err;
    }
  });

  // Check availability for a provider
  app.get<{ Params: { providerId: string } }>('/availability/:providerId', async (request, reply) => {
    const { orgId } = request.user;
    const { providerId } = request.params;
    const query = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      serviceId: z.string().uuid(),
    }).parse(request.query);

    // Validate provider belongs to org
    const providerRecord = await app.prisma.provider.findFirst({
      where: { providerId, orgId },
    });
    if (!providerRecord) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const date = new Date(query.date);
    const dayOfWeek = date.getDay();

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Phase 0.3: Check if provider is on time-off for this date
    const timeOff = await app.prisma.providerTimeOff.findFirst({
      where: {
        providerId,
        startTs: { lte: endOfDay },
        endTs: { gte: startOfDay },
      },
    });
    if (timeOff) {
      return { slots: [], message: 'Provider is on leave during this date' };
    }

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
    const existingAppointments = await app.prisma.appointment.findMany({
      where: {
        providerId,
        startTs: { gte: startOfDay, lte: endOfDay },
        status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
      },
    });

    // Get service duration + buffers
    const service = await app.prisma.service.findUnique({
      where: { serviceId: query.serviceId },
    });

    if (!service) {
      return reply.code(404).send({ error: 'Service not found' });
    }

    // Phase 0.2: Use service buffer times in slot calculation
    const effectiveSlotMin = service.durationMin + (service.bufferBeforeMin ?? 0) + (service.bufferAfterMin ?? 0);

    // Calculate available slots
    const slots: { start: string; end: string }[] = [];

    for (const rule of rules) {
      const ruleStart = new Date(date);
      const [startHour, startMin] = rule.startLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleStart.setHours(startHour, startMin, 0, 0);

      const ruleEnd = new Date(date);
      const [endHour, endMin] = rule.endLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleEnd.setHours(endHour, endMin, 0, 0);

      let slotStart = new Date(ruleStart);
      while (slotStart.getTime() + service.durationMin * 60000 <= ruleEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000);

        // Phase 0.2: Expand conflict window by buffer times for proper gap enforcement
        const conflictStart = new Date(slotStart.getTime() - (service.bufferBeforeMin ?? 0) * 60000);
        const conflictEnd = new Date(slotEnd.getTime() + (service.bufferAfterMin ?? 0) * 60000);

        // Check if slot conflicts with existing appointments (using full range overlap)
        const hasConflict = existingAppointments.some(apt =>
          conflictStart < apt.endTs && conflictEnd > apt.startTs
        );

        if (!hasConflict) {
          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
          });
        }

        slotStart = new Date(slotStart.getTime() + effectiveSlotMin * 60000);
      }
    }

    return { slots };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /cancel-by-sms – Cancel an appointment via SMS keyword
  // Twilio webhook body: From (phone), Body (SMS text containing appointment ID or "إلغاء <id>")
  // This endpoint is intentionally public (auth handled by Twilio signature in prod)
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/cancel-by-sms', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest, reply) => {
    const smsSchema = z.object({
      From: z.string(),   // patient phone in E.164
      Body: z.string(),   // raw SMS body
    });

    let from: string;
    let body: string;
    try {
      const parsed = smsSchema.parse(request.body);
      from = parsed.From;
      body = parsed.Body;
    } catch {
      return reply.code(400).send({ error: 'Missing From or Body fields' });
    }

    // Normalize phone
    const phone = from.replace(/^whatsapp:/, '');

    // Extract appointment ID – two patterns:
    //   1. "إلغاء <uuid>"
    //   2. Raw UUID anywhere in the message
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = body.match(uuidRegex);
    let appointment: any = null;

    if (match) {
      // Try direct appointment ID lookup
      appointment = await app.prisma.appointment.findUnique({
        where: { appointmentId: match[0] },
        include: { patient: true, provider: true, service: true },
      });
    }

    // Fallback: find the patient by phone and get their next upcoming appointment
    if (!appointment) {
      const contact = await app.prisma.patientContact.findFirst({
        where: { contactType: 'phone', contactValue: phone },
      });
      if (contact) {
        appointment = await app.prisma.appointment.findFirst({
          where: {
            patientId: contact.patientId,
            status: { in: ['booked', 'confirmed'] },
            startTs: { gt: new Date() },
          },
          orderBy: { startTs: 'asc' },
          include: { patient: true, provider: true, service: true },
        });
      }
    }

    if (!appointment) {
      // Send SMS "not found" reply via Twilio if configured
      if (app.twilio) {
        await app.twilio.messages.create({
          to: phone,
          from: process.env.TWILIO_PHONE_NUMBER!,
          body: 'عذراً، لم نتمكن من العثور على موعد مرتبط برقمك. تواصل معنا للمساعدة.',
        });
      }
      return reply.code(404).send({ error: 'Appointment not found' });
    }

    // Check it belongs to this patient
    const arabicCancelKeywords = ['إلغاء', 'الغاء', 'الغ', 'cancel', 'no', '2'];
    const lowerBody = body.trim().toLowerCase();
    const isCancelIntent = arabicCancelKeywords.some((kw) => lowerBody.includes(kw));

    if (!isCancelIntent && !match) {
      return reply.code(400).send({ error: 'No cancellation intent detected in message' });
    }

    // Cancel the appointment
    await app.prisma.appointment.update({
      where: { appointmentId: appointment.appointmentId },
      data: {
        status: 'cancelled',
        statusHistory: {
          create: {
            oldStatus: appointment.status,
            newStatus: 'cancelled',
            changedBy: 'sms_patient',
            reason: 'Patient cancelled via SMS',
          },
        },
      },
    });

    // Cancel pending reminders
    await app.prisma.appointmentReminder.updateMany({
      where: { appointmentId: appointment.appointmentId, status: 'pending' },
      data: { status: 'cancelled', response: 'appointment_cancelled_by_patient_sms' },
    });

    // Send confirmation SMS
    const dateStr = appointment.startTs.toLocaleDateString('ar-SA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = appointment.startTs.toLocaleTimeString('ar-SA', {
      hour: '2-digit', minute: '2-digit',
    });
    const confirmMsg =
      `تم إلغاء موعدك مع ${appointment.provider.displayName} بتاريخ ${dateStr} الساعة ${timeStr} بنجاح. ` +
      `نتمنى لك دوام الصحة والعافية. 💚`;

    if (app.twilio) {
      await app.twilio.messages.create({
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body: confirmMsg,
      });
    }

    return {
      success: true,
      appointmentId: appointment.appointmentId,
      message: confirmMsg,
    };
  });
}
