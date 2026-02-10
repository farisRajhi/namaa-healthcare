/**
 * Appointment Reminder API Routes
 *
 * GET    /api/reminders/:orgId           — List upcoming reminders
 * POST   /api/reminders/configure        — Set reminder schedule per org
 * POST   /api/reminders/process          — Trigger reminder processing (cron)
 * GET    /api/reminders/stats/:orgId     — Reminder effectiveness stats
 * POST   /api/reminders/create/:apptId   — Create reminders for an appointment
 * POST   /api/reminders/reply            — Handle patient reply (webhook)
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getAppointmentReminderService } from '../services/reminders/appointmentReminder.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const configureSchema = z.object({
  orgId: z.string().uuid(),
  intervals: z.array(
    z.object({
      hoursBefore: z.number().min(0.5).max(168), // 30min to 7 days
      channel: z.enum(['sms', 'whatsapp', 'voice']),
    }),
  ).min(1),
  enableSurvey: z.boolean().default(true),
  surveyDelayHours: z.number().min(0.5).max(72).default(2),
});

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
  status: z.string().optional(),
});

const statsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const replySchema = z.object({
  From: z.string(), // Phone number
  Body: z.string(), // Message body
  channel: z.enum(['sms', 'whatsapp']).default('sms'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default async function remindersRoutes(app: FastifyInstance) {
  const getService = () =>
    getAppointmentReminderService(app.prisma, app.twilio);

  // -----------------------------------------------------------------------
  // GET /:orgId — List upcoming reminders
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const { orgId } = request.params;
      const query = listQuerySchema.parse(request.query);

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const skip = (query.page - 1) * query.limit;

      // Get upcoming appointments for the org to find their reminders
      const orgAppointments = await app.prisma.appointment.findMany({
        where: {
          orgId,
          startTs: { gt: new Date() },
          status: { in: ['booked', 'confirmed'] },
        },
        select: { appointmentId: true },
      });

      const appointmentIds = orgAppointments.map((a) => a.appointmentId);

      if (appointmentIds.length === 0) {
        return {
          data: [],
          pagination: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }

      const where: any = {
        appointmentId: { in: appointmentIds },
        ...(query.status && { status: query.status }),
      };

      const [reminders, total] = await Promise.all([
        app.prisma.appointmentReminder.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { scheduledFor: 'asc' },
        }),
        app.prisma.appointmentReminder.count({ where }),
      ]);

      // Enrich with appointment info
      const enriched = await Promise.all(
        reminders.map(async (r) => {
          const appointment = await app.prisma.appointment.findUnique({
            where: { appointmentId: r.appointmentId },
            include: {
              facility: { select: { name: true } },
            },
          });

          let patient = null;
          let provider = null;
          if (appointment?.patientId) {
            patient = await app.prisma.patient.findUnique({
              where: { patientId: appointment.patientId },
              select: { firstName: true, lastName: true },
            });
          }
          if (appointment) {
            provider = await app.prisma.provider.findUnique({
              where: { providerId: appointment.providerId },
              select: { displayName: true },
            });
          }

          return {
            ...r,
            appointment: appointment
              ? {
                  appointmentId: appointment.appointmentId,
                  startTs: appointment.startTs,
                  status: appointment.status,
                  facilityName: appointment.facility?.name,
                }
              : null,
            patient: patient
              ? { name: `${patient.firstName} ${patient.lastName}` }
              : null,
            provider: provider ? { name: provider.displayName } : null,
          };
        }),
      );

      return {
        data: enriched,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /:orgId/configure — Set reminder schedule (org-scoped alias)
  // -----------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>(
    '/:orgId/configure',
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const body = configureSchema.parse({ ...(request.body as object), orgId });
      const service = getService();
      service.setOrgSchedule(orgId, {
        intervals: body.intervals,
        enableSurvey: body.enableSurvey,
        surveyDelayHours: body.surveyDelayHours,
      });

      return {
        success: true,
        schedule: service.getSchedule(orgId),
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /:orgId/stats — Reminder stats (org-scoped alias)
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/stats',
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const query = statsQuerySchema.parse(request.query);
      const service = getService();
      const stats = await service.getStats(
        orgId,
        query.from ? new Date(query.from) : undefined,
        query.to ? new Date(query.to) : undefined,
      );
      const highRiskPatients = await service.getHighRiskPatients(orgId);

      return {
        ...stats,
        highRiskPatientsCount: highRiskPatients.length,
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /configure — Set reminder schedule per org
  // -----------------------------------------------------------------------
  app.post(
    '/configure',
    {
      preHandler: [app.authenticate],
    },
    async (request: FastifyRequest) => {
      const body = configureSchema.parse(request.body);

      if (request.user.orgId !== body.orgId) {
        return { error: 'Unauthorized' };
      }

      const service = getService();
      service.setOrgSchedule(body.orgId, {
        intervals: body.intervals,
        enableSurvey: body.enableSurvey,
        surveyDelayHours: body.surveyDelayHours,
      });

      return {
        success: true,
        schedule: service.getSchedule(body.orgId),
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /process — Trigger reminder processing (cron endpoint)
  // -----------------------------------------------------------------------
  app.post(
    '/process',
    {
      preHandler: [app.authenticate],
    },
    async () => {
      const service = getService();
      const result = await service.processDueReminders();

      return {
        success: true,
        ...result,
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /stats/:orgId — Reminder effectiveness stats
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/stats/:orgId',
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const { orgId } = request.params;
      const query = statsQuerySchema.parse(request.query);

      if (request.user.orgId !== orgId) {
        return { error: 'Unauthorized' };
      }

      const service = getService();
      const stats = await service.getStats(
        orgId,
        query.from ? new Date(query.from) : undefined,
        query.to ? new Date(query.to) : undefined,
      );

      // Also get no-show risk summary
      const highRiskPatients = await service.getHighRiskPatients(orgId);

      return {
        ...stats,
        highRiskPatientsCount: highRiskPatients.length,
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /create/:apptId — Create reminders for an appointment
  // -----------------------------------------------------------------------
  app.post<{ Params: { apptId: string } }>(
    '/create/:apptId',
    {
      preHandler: [app.authenticate],
    },
    async (request) => {
      const { apptId } = request.params;

      const service = getService();
      const count = await service.createRemindersForAppointment(apptId);

      return { success: true, remindersCreated: count };
    },
  );

  // -----------------------------------------------------------------------
  // POST /reply — Handle incoming patient reply (Twilio webhook)
  // This is designed for Twilio SMS/WhatsApp incoming message webhooks.
  // It can be public (secured by Twilio signature) or authenticated.
  // -----------------------------------------------------------------------
  app.post('/reply', async (request: FastifyRequest) => {
    const body = replySchema.parse(request.body);

    const service = getService();
    const result = await service.handlePatientReply(
      body.From,
      body.Body,
      body.channel,
    );

    // Return TwiML-friendly response (for Twilio webhook)
    if (result.action === 'confirm') {
      return {
        action: 'confirm',
        appointmentId: result.appointmentId,
        message: 'تم تأكيد موعدكم. شكراً لكم! ✅',
      };
    } else if (result.action === 'cancel') {
      return {
        action: 'cancel',
        appointmentId: result.appointmentId,
        message: 'تم إلغاء موعدكم. هل تود حجز موعد جديد؟',
      };
    } else if (result.action === 'reschedule') {
      return {
        action: 'reschedule',
        appointmentId: result.appointmentId,
        message: 'سنتواصل معكم لتحديد موعد جديد. شكراً!',
      };
    }

    return {
      action: 'unknown',
      message: 'عذراً، لم نفهم ردكم. أرسل 1 للتأكيد، 2 للإلغاء، 3 للتغيير.',
    };
  });
}
