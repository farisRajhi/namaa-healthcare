/**
 * Public Patient Self-Booking Routes
 *
 * No authentication required – patients access via shareable clinic link.
 *
 * GET  /api/book/:slug              – Get clinic info by slug
 * GET  /api/book/:slug/services     – List bookable services
 * GET  /api/book/:slug/providers    – List providers for a service
 * GET  /api/book/:slug/slots        – Get available time slots
 * POST /api/book/:slug              – Create a booking (guest or registered patient)
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const slotsQuerySchema = z.object({
  providerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid(),
});

const guestBookingSchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startTs: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(9),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export default async function publicBookingRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /:slug – Clinic info
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const { slug } = request.params;

    const facility = await app.prisma.facility.findUnique({
      where: { clinicSlug: slug },
      select: {
        facilityId: true,
        name: true,
        city: true,
        addressLine1: true,
        timezone: true,
        clinicSlug: true,
      },
    });

    if (!facility) {
      return reply.code(404).send({ error: 'Clinic not found' });
    }

    return { data: facility };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /:slug/services
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { slug: string } }>('/:slug/services', async (request, reply) => {
    const { slug } = request.params;

    const facility = await app.prisma.facility.findUnique({
      where: { clinicSlug: slug },
      select: { orgId: true },
    });

    if (!facility) {
      return reply.code(404).send({ error: 'Clinic not found' });
    }

    const services = await app.prisma.service.findMany({
      where: { orgId: facility.orgId, active: true },
      select: { serviceId: true, name: true, durationMin: true },
      orderBy: { name: 'asc' },
    });

    return { data: services };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /:slug/providers?serviceId=...
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { slug: string } }>('/:slug/providers', async (request, reply) => {
    const { slug } = request.params;
    const query = z.object({ serviceId: z.string().uuid().optional() }).parse(request.query);

    const facility = await app.prisma.facility.findUnique({
      where: { clinicSlug: slug },
      select: { facilityId: true, orgId: true },
    });

    if (!facility) {
      return reply.code(404).send({ error: 'Clinic not found' });
    }

    const providers = await app.prisma.provider.findMany({
      where: {
        facilityId: facility.facilityId,
        active: true,
        ...(query.serviceId && {
          services: { some: { serviceId: query.serviceId } },
        }),
      },
      select: {
        providerId: true,
        displayName: true,
        credentials: true,
        department: { select: { name: true } },
        services: {
          select: { service: { select: { serviceId: true, name: true, durationMin: true } } },
        },
      },
    });

    return { data: providers };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /:slug/slots?providerId=...&date=...&serviceId=...
  // ─────────────────────────────────────────────────────────────────────────
  app.get<{ Params: { slug: string } }>('/:slug/slots', async (request, reply) => {
    const { slug } = request.params;

    const facility = await app.prisma.facility.findUnique({
      where: { clinicSlug: slug },
      select: { facilityId: true },
    });

    if (!facility) {
      return reply.code(404).send({ error: 'Clinic not found' });
    }

    let query: z.infer<typeof slotsQuerySchema>;
    try {
      query = slotsQuerySchema.parse(request.query);
    } catch (e) {
      return reply.code(400).send({ error: 'Missing required query params: providerId, date, serviceId' });
    }

    const date = new Date(query.date);
    const dayOfWeek = date.getDay();

    const rules = await app.prisma.providerAvailabilityRule.findMany({
      where: {
        providerId: query.providerId,
        dayOfWeek,
        validFrom: { lte: date },
        OR: [{ validTo: null }, { validTo: { gte: date } }],
      },
    });

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await app.prisma.appointment.findMany({
      where: {
        providerId: query.providerId,
        startTs: { gte: startOfDay, lte: endOfDay },
        status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
      },
    });

    const service = await app.prisma.service.findUnique({ where: { serviceId: query.serviceId } });
    if (!service) return reply.code(404).send({ error: 'Service not found' });

    const slots: { start: string; end: string }[] = [];

    for (const rule of rules) {
      const ruleStart = new Date(date);
      const [sh, sm] = rule.startLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleStart.setHours(sh, sm, 0, 0);

      const ruleEnd = new Date(date);
      const [eh, em] = rule.endLocal.toISOString().slice(11, 16).split(':').map(Number);
      ruleEnd.setHours(eh, em, 0, 0);

      let slotStart = new Date(ruleStart);
      while (slotStart.getTime() + service.durationMin * 60000 <= ruleEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000);
        const hasConflict = existing.some((a) => slotStart < a.endTs && slotEnd > a.startTs);
        if (!hasConflict && slotStart > new Date()) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
        }
        slotStart = new Date(slotStart.getTime() + rule.slotIntervalMin * 60000);
      }
    }

    return { slots };
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /:slug – Guest booking
  // ─────────────────────────────────────────────────────────────────────────
  app.post<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const { slug } = request.params;

    const facility = await app.prisma.facility.findUnique({
      where: { clinicSlug: slug },
      select: { facilityId: true, orgId: true },
    });

    if (!facility) {
      return reply.code(404).send({ error: 'Clinic not found' });
    }

    let body: z.infer<typeof guestBookingSchema>;
    try {
      body = guestBookingSchema.parse(request.body);
    } catch (e: any) {
      return reply.code(400).send({ error: 'Invalid booking data', details: e.errors });
    }

    // Find or create patient by phone
    let patient = await (async () => {
      const contact = await app.prisma.patientContact.findFirst({
        where: { contactType: 'phone', contactValue: body.phone, patient: { orgId: facility.orgId } },
        include: { patient: true },
      });
      return contact?.patient ?? null;
    })();

    if (!patient) {
      patient = await app.prisma.patient.create({
        data: {
          orgId: facility.orgId,
          firstName: body.firstName,
          lastName: body.lastName,
          contacts: {
            create: { contactType: 'phone', contactValue: body.phone, isPrimary: true },
          },
        },
      });
    }

    const service = await app.prisma.service.findUnique({ where: { serviceId: body.serviceId } });
    if (!service) return reply.code(404).send({ error: 'Service not found' });

    const startTs = new Date(body.startTs);
    const endTs = new Date(startTs.getTime() + service.durationMin * 60000);

    const appointment = await app.prisma.appointment.create({
      data: {
        orgId: facility.orgId,
        facilityId: facility.facilityId,
        providerId: body.providerId,
        patientId: patient.patientId,
        serviceId: body.serviceId,
        startTs,
        endTs,
        status: 'booked',
        bookedVia: 'web',
        reason: body.reason,
        notes: body.notes,
        statusHistory: {
          create: {
            newStatus: 'booked',
            changedBy: 'patient_self_booking',
          },
        },
      },
      include: { provider: true, service: true },
    });

    // Send confirmation SMS
    if (app.twilio) {
      const dateStr = startTs.toLocaleDateString('ar-SA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const timeStr = startTs.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      try {
        await app.twilio.messages.create({
          to: body.phone,
          from: process.env.TWILIO_PHONE_NUMBER!,
          body:
            `تم تأكيد موعدك مع ${appointment.provider.displayName} ` +
            `بتاريخ ${dateStr} الساعة ${timeStr}. ` +
            `للإلغاء أرسل "إلغاء ${appointment.appointmentId}"`,
        });
      } catch (err: any) {
        app.log.warn(`Booking SMS failed: ${err?.message}`);
      }
    }

    return {
      success: true,
      appointment: {
        appointmentId: appointment.appointmentId,
        startTs: appointment.startTs,
        endTs: appointment.endTs,
        provider: appointment.provider.displayName,
        service: appointment.service.name,
      },
    };
  });
}
