/**
 * Service Cycle Suggestions API Routes
 *
 * GET    /api/suggestions/:orgId          — List pending suggestions (ranked by score)
 * GET    /api/suggestions/:orgId/stats    — Dashboard stats
 * POST   /api/suggestions/:orgId/generate — Trigger suggestion generation
 * PATCH  /api/suggestions/:id/send        — Send suggestion via WhatsApp
 * PATCH  /api/suggestions/:id/dismiss     — Dismiss a suggestion
 * PATCH  /api/suggestions/:id/message     — Edit suggested message before sending
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getServiceCyclePredictor } from '../services/patient/serviceCyclePredictor.js';
import { getExternalRecallRows } from '../services/patient/externalRecallQuery.js';

const RECALL_STATUSES = ['contacted', 'booked', 'not_interested', 'unreachable'] as const;
type RecallStatus = typeof RECALL_STATUSES[number];

const statusUpdateSchema = z.object({
  status: z.enum(RECALL_STATUSES),
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
  type: z.enum(['reminder', 'offer']).optional(),
});

const updateMessageSchema = z.object({
  messageAr: z.string().optional(),
  messageEn: z.string().optional(),
});

const sendSchema = z.object({
  messageAr: z.string().optional(),
  messageEn: z.string().optional(),
  channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default async function suggestionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  app.addHook('preHandler', app.requirePlan('professional'));

  // -----------------------------------------------------------------------
  // GET /:orgId — Unified recall list (native + external, ranked by overdueDays)
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const query = listQuerySchema.parse(request.query);
      const statusFilter = query.status || 'pending';
      const includeExternal = statusFilter === 'pending';

      const nativeWhere: any = {
        orgId,
        status: statusFilter,
        ...(query.type && { suggestionType: query.type }),
      };

      const [nativeSuggestions, externalRows] = await Promise.all([
        app.prisma.serviceCycleSuggestion.findMany({
          where: nativeWhere,
          orderBy: [{ overdueDays: 'desc' }, { score: 'desc' }],
          include: {
            patient: {
              select: {
                patientId: true,
                firstName: true,
                lastName: true,
                contacts: {
                  where: { contactType: 'phone', isPrimary: true },
                  select: { contactValue: true },
                  take: 1,
                },
              },
            },
            service: {
              select: {
                serviceId: true,
                name: true,
                nameEn: true,
                category: true,
                repeatCycleDays: true,
              },
            },
          },
        }),
        includeExternal ? getExternalRecallRows(app.prisma, orgId) : Promise.resolve([]),
      ]);

      // Batch-fetch PatientInsight for reliability signals
      const patientIds = [...new Set(nativeSuggestions.map(s => s.patientId))];
      const insights = patientIds.length
        ? await app.prisma.patientInsight.findMany({
            where: { patientId: { in: patientIds } },
            select: {
              patientId: true,
              completedAppointments: true,
              completionRate: true,
              noShowCount: true,
            },
          })
        : [];
      const insightMap = new Map(insights.map(i => [i.patientId, i]));

      const nativeRows = nativeSuggestions.map(s => {
        const insight = insightMap.get(s.patientId);
        return {
          source: 'native' as const,
          id: s.suggestionId,
          suggestionId: s.suggestionId,
          patientId: s.patientId,
          serviceId: s.serviceId,
          patientName: `${s.patient.firstName} ${s.patient.lastName}`.trim(),
          phoneNumber: s.patient.contacts[0]?.contactValue || null,
          serviceName: s.service.name,
          serviceNameEn: s.service.nameEn,
          serviceCategory: s.service.category,
          lastCompletedAt: s.lastCompletedAt,
          dueAt: s.dueAt,
          overdueDays: s.overdueDays,
          score: s.score,
          suggestionType: s.suggestionType,
          messageAr: s.messageAr,
          messageEn: s.messageEn,
          status: s.status,
          sentAt: s.sentAt,
          sentBy: s.sentBy,
          reliability: {
            totalVisits: insight?.completedAppointments ?? 0,
            completionRate: insight?.completionRate ?? null,
            noShowCount: insight?.noShowCount ?? 0,
          },
        };
      });

      const externalAsUnified = externalRows.map(r => ({
        source: 'external' as const,
        id: r.id,
        externalPatientId: r.id,
        patientName: r.patientName,
        phoneNumber: r.phone,
        serviceName: r.serviceName,
        serviceNameEn: r.serviceNameEn,
        serviceCategory: null,
        lastCompletedAt: r.lastCompletedAt,
        dueAt: r.dueAt,
        overdueDays: r.overdueDays,
        score: r.score,
        status: r.status,
        reliability: r.reliability,
      }));

      const allRows = [...nativeRows, ...externalAsUnified];
      allRows.sort((a, b) => {
        if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
        return b.score - a.score;
      });

      const skip = (query.page - 1) * query.limit;
      const paged = allRows.slice(skip, skip + query.limit);

      return {
        data: paged,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: allRows.length,
          totalPages: Math.ceil(allRows.length / query.limit),
        },
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /:orgId/stats — Dashboard stats (native + external combined)
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/stats',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [nativePending, reminders, offers, sentToday, externalRows] = await Promise.all([
        app.prisma.serviceCycleSuggestion.count({
          where: { orgId, status: 'pending' },
        }),
        app.prisma.serviceCycleSuggestion.count({
          where: { orgId, status: 'pending', suggestionType: 'reminder' },
        }),
        app.prisma.serviceCycleSuggestion.count({
          where: { orgId, status: 'pending', suggestionType: 'offer' },
        }),
        app.prisma.serviceCycleSuggestion.count({
          where: {
            orgId,
            OR: [
              { status: 'sent', sentAt: { gte: today } },
              { status: 'contacted', sentAt: { gte: today } },
            ],
          },
        }),
        getExternalRecallRows(app.prisma, orgId),
      ]);

      const externalPending = externalRows.length;

      return {
        totalPending: nativePending + externalPending,
        nativePending,
        externalPending,
        reminders,
        offers,
        sentToday,
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /:orgId/generate — Trigger suggestion generation
  // -----------------------------------------------------------------------
  app.post<{ Params: { orgId: string } }>(
    '/:orgId/generate',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const predictor = getServiceCyclePredictor(app.prisma);
      const result = await predictor.generateSuggestions(orgId);

      return { success: true, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /:id/send — Send suggestion via WhatsApp
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id/send',
    async (request, reply) => {
      const { id } = request.params;
      const body = sendSchema.parse(request.body);

      const suggestion = await app.prisma.serviceCycleSuggestion.findUnique({
        where: { suggestionId: id },
        include: {
          patient: {
            select: {
              patientId: true,
              firstName: true,
              contacts: {
                where: { contactType: 'phone', isPrimary: true },
                select: { contactValue: true },
                take: 1,
              },
            },
          },
        },
      });

      if (!suggestion || suggestion.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Suggestion not found' });
      }

      if (suggestion.status !== 'pending') {
        return reply.code(400).send({ error: `Cannot send suggestion in ${suggestion.status} status` });
      }

      const phone = suggestion.patient.contacts[0]?.contactValue;
      if (!phone) {
        return reply.code(400).send({ error: 'Patient has no phone number' });
      }

      // Use custom message if provided, otherwise use the pre-generated one
      const messageAr = body.messageAr || suggestion.messageAr;
      const messageEn = body.messageEn || suggestion.messageEn;

      // Log the send via SMS log
      try {
        await app.prisma.smsLog.create({
          data: {
            orgId: suggestion.orgId,
            patientId: suggestion.patientId,
            phone,
            channel: body.channel,
            body: messageAr || messageEn || '',
            status: 'sent',
            triggeredBy: 'suggestion',
          },
        });
      } catch {
        // smsLog creation is best-effort
      }

      // Update suggestion status
      const updated = await app.prisma.serviceCycleSuggestion.update({
        where: { suggestionId: id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          sentBy: request.user.userId,
          ...(body.messageAr && { messageAr: body.messageAr }),
          ...(body.messageEn && { messageEn: body.messageEn }),
        },
      });

      return { success: true, suggestion: updated };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /:id/dismiss — Dismiss a suggestion
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id/dismiss',
    async (request, reply) => {
      const { id } = request.params;

      const suggestion = await app.prisma.serviceCycleSuggestion.findUnique({
        where: { suggestionId: id },
      });

      if (!suggestion || suggestion.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Suggestion not found' });
      }

      const updated = await app.prisma.serviceCycleSuggestion.update({
        where: { suggestionId: id },
        data: { status: 'dismissed' },
      });

      return { success: true, suggestion: updated };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /:id/message — Edit the suggested message
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id/message',
    async (request, reply) => {
      const { id } = request.params;
      const body = updateMessageSchema.parse(request.body);

      const suggestion = await app.prisma.serviceCycleSuggestion.findUnique({
        where: { suggestionId: id },
      });

      if (!suggestion || suggestion.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Suggestion not found' });
      }

      if (suggestion.status !== 'pending') {
        return reply.code(400).send({ error: 'Can only edit pending suggestions' });
      }

      const updated = await app.prisma.serviceCycleSuggestion.update({
        where: { suggestionId: id },
        data: {
          ...(body.messageAr !== undefined && { messageAr: body.messageAr }),
          ...(body.messageEn !== undefined && { messageEn: body.messageEn }),
        },
      });

      return { success: true, suggestion: updated };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /:id/status — Owner marks recall status on a native suggestion
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    '/:id/status',
    async (request, reply) => {
      const { id } = request.params;
      const body = statusUpdateSchema.parse(request.body);

      const suggestion = await app.prisma.serviceCycleSuggestion.findUnique({
        where: { suggestionId: id },
      });

      if (!suggestion || suggestion.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'Suggestion not found' });
      }

      const data: { status: RecallStatus; sentAt?: Date; sentBy?: string } = {
        status: body.status,
      };
      if (body.status === 'contacted') {
        data.sentAt = new Date();
        data.sentBy = request.user.userId;
      }

      const updated = await app.prisma.serviceCycleSuggestion.update({
        where: { suggestionId: id },
        data,
      });

      return { success: true, suggestion: updated };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /external/:externalId/status — Owner marks recall status on an external patient
  // -----------------------------------------------------------------------
  app.patch<{ Params: { externalId: string } }>(
    '/external/:externalId/status',
    async (request, reply) => {
      const { externalId } = request.params;
      const body = statusUpdateSchema.parse(request.body);

      const external = await app.prisma.externalPatient.findUnique({
        where: { externalPatientId: externalId },
        select: { externalPatientId: true, orgId: true },
      });

      if (!external || external.orgId !== request.user.orgId) {
        return reply.code(404).send({ error: 'External patient not found' });
      }

      const updated = await app.prisma.externalPatient.update({
        where: { externalPatientId: externalId },
        data: {
          recallStatus: body.status,
          recallStatusAt: new Date(),
          recallStatusBy: request.user.userId,
        },
      });

      return { success: true, externalPatient: updated };
    },
  );
}
