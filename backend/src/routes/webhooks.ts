import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Webhook API key verification
const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKey = request.headers['x-api-key'];
  const expectedKey = process.env.WEBHOOK_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return reply.code(401).send({ error: 'Invalid API key' });
  }
};

// Schema for n8n to check availability
const checkAvailabilitySchema = z.object({
  orgId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  date: z.string(),
});

// Schema for n8n to create booking
const createBookingSchema = z.object({
  orgId: z.string().uuid(),
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startTs: z.string(),
  patientPhone: z.string(),
  patientName: z.string(),
  channel: z.enum(['whatsapp', 'telegram', 'web']).default('whatsapp'),
  reason: z.string().optional(),
});

// Schema for n8n to get patient info
const getPatientSchema = z.object({
  orgId: z.string().uuid(),
  phone: z.string(),
});

export default async function webhooksRoutes(app: FastifyInstance) {
  // All webhook routes require API key
  app.addHook('preHandler', verifyApiKey);

  // n8n calls this to check available slots
  app.post('/availability', async (request: FastifyRequest) => {
    const body = checkAvailabilitySchema.parse(request.body);
    const date = new Date(body.date);
    const dayOfWeek = date.getDay();

    // Find providers for this service
    const providersQuery = body.providerId
      ? { providerId: body.providerId }
      : {
          services: {
            some: { serviceId: body.serviceId },
          },
          active: true,
          orgId: body.orgId,
        };

    const providers = await app.prisma.provider.findMany({
      where: providersQuery,
      include: {
        availabilityRules: {
          where: { dayOfWeek },
        },
      },
    });

    const service = await app.prisma.service.findUnique({
      where: { serviceId: body.serviceId },
    });

    if (!service) {
      return { error: 'Service not found', slots: [] };
    }

    const allSlots: Array<{
      providerId: string;
      providerName: string;
      start: string;
      end: string;
    }> = [];

    for (const provider of providers) {
      // Get existing appointments
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await app.prisma.appointment.findMany({
        where: {
          providerId: provider.providerId,
          startTs: { gte: startOfDay, lte: endOfDay },
          status: { in: ['held', 'booked', 'confirmed', 'checked_in', 'in_progress'] },
        },
      });

      for (const rule of provider.availabilityRules) {
        const ruleStart = new Date(date);
        const [startHour, startMin] = rule.startLocal.toISOString().slice(11, 16).split(':').map(Number);
        ruleStart.setHours(startHour, startMin, 0, 0);

        const ruleEnd = new Date(date);
        const [endHour, endMin] = rule.endLocal.toISOString().slice(11, 16).split(':').map(Number);
        ruleEnd.setHours(endHour, endMin, 0, 0);

        let slotStart = new Date(ruleStart);
        while (slotStart.getTime() + service.durationMin * 60000 <= ruleEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000);

          const hasConflict = existingAppointments.some(
            (apt) => slotStart < apt.endTs && slotEnd > apt.startTs
          );

          if (!hasConflict && slotStart > new Date()) {
            allSlots.push({
              providerId: provider.providerId,
              providerName: provider.displayName,
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
            });
          }

          slotStart = new Date(slotStart.getTime() + rule.slotIntervalMin * 60000);
        }
      }
    }

    return { slots: allSlots };
  });

  // n8n calls this to create a booking
  app.post('/book', async (request: FastifyRequest) => {
    const body = createBookingSchema.parse(request.body);

    // Find or create messaging user
    let messagingUser = await app.prisma.messagingUser.findFirst({
      where: {
        orgId: body.orgId,
        channel: body.channel,
        phoneE164: body.patientPhone,
      },
    });

    if (!messagingUser) {
      messagingUser = await app.prisma.messagingUser.create({
        data: {
          orgId: body.orgId,
          channel: body.channel,
          externalUserId: body.patientPhone,
          phoneE164: body.patientPhone,
          displayName: body.patientName,
        },
      });
    }

    // Find or create patient
    let patient = await app.prisma.patient.findFirst({
      where: {
        orgId: body.orgId,
        contacts: {
          some: {
            contactType: 'phone',
            contactValue: body.patientPhone,
          },
        },
      },
    });

    if (!patient) {
      const nameParts = body.patientName.split(' ');
      patient = await app.prisma.patient.create({
        data: {
          orgId: body.orgId,
          firstName: nameParts[0] || 'Unknown',
          lastName: nameParts.slice(1).join(' ') || 'Unknown',
          contacts: {
            create: {
              contactType: 'phone',
              contactValue: body.patientPhone,
              isPrimary: true,
            },
          },
        },
      });

      // Link messaging user to patient
      await app.prisma.messagingUserPatientLink.create({
        data: {
          messagingUserId: messagingUser.messagingUserId,
          patientId: patient.patientId,
          relationship: 'self',
          isDefault: true,
        },
      });
    }

    // Get service for duration
    const service = await app.prisma.service.findUnique({
      where: { serviceId: body.serviceId },
    });

    if (!service) {
      return { error: 'Service not found', success: false };
    }

    const startTs = new Date(body.startTs);
    const endTs = new Date(startTs.getTime() + service.durationMin * 60000);

    // Create appointment
    const appointment = await app.prisma.appointment.create({
      data: {
        orgId: body.orgId,
        providerId: body.providerId,
        patientId: patient.patientId,
        serviceId: body.serviceId,
        startTs,
        endTs,
        status: 'booked',
        bookedVia: body.channel,
        bookedByMessagingUserId: messagingUser.messagingUserId,
        reason: body.reason,
        statusHistory: {
          create: {
            newStatus: 'booked',
            changedBy: 'n8n-agent',
          },
        },
      },
      include: {
        provider: true,
        service: true,
        patient: true,
      },
    });

    return {
      success: true,
      appointment: {
        id: appointment.appointmentId,
        providerName: appointment.provider.displayName,
        serviceName: appointment.service.name,
        startTime: appointment.startTs,
        endTime: appointment.endTs,
      },
    };
  });

  // n8n calls this to get patient by phone
  app.post('/patient', async (request: FastifyRequest) => {
    const body = getPatientSchema.parse(request.body);

    const patient = await app.prisma.patient.findFirst({
      where: {
        orgId: body.orgId,
        contacts: {
          some: {
            contactType: 'phone',
            contactValue: body.phone,
          },
        },
      },
      include: {
        contacts: true,
        appointments: {
          orderBy: { startTs: 'desc' },
          take: 5,
          include: {
            provider: true,
            service: true,
          },
        },
      },
    });

    if (!patient) {
      return { found: false, patient: null };
    }

    return {
      found: true,
      patient: {
        id: patient.patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        recentAppointments: patient.appointments,
      },
    };
  });

  // n8n calls this to get services list
  app.get<{ Params: { orgId: string } }>('/services/:orgId', async (request) => {
    const { orgId } = request.params;

    const services = await app.prisma.service.findMany({
      where: { orgId, active: true },
      select: {
        serviceId: true,
        name: true,
        durationMin: true,
      },
    });

    return { services };
  });

  // n8n calls this to get providers for a service
  app.get<{ Params: { orgId: string; serviceId: string } }>(
    '/providers/:orgId/:serviceId',
    async (request) => {
      const { orgId, serviceId } = request.params;

      const providers = await app.prisma.provider.findMany({
        where: {
          orgId,
          active: true,
          services: {
            some: { serviceId },
          },
        },
        select: {
          providerId: true,
          displayName: true,
          credentials: true,
        },
      });

      return { providers };
    }
  );
}
