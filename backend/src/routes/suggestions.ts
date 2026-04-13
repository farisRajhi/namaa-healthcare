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

  // -----------------------------------------------------------------------
  // GET /:orgId — List suggestions sorted by score
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const query = listQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const where: any = {
        orgId,
        status: query.status || 'pending',
        ...(query.type && { suggestionType: query.type }),
      };

      const [suggestions, total] = await Promise.all([
        app.prisma.serviceCycleSuggestion.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: { score: 'desc' },
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
        app.prisma.serviceCycleSuggestion.count({ where }),
      ]);

      // Flatten patient phone into the response
      const data = suggestions.map(s => ({
        ...s,
        patientName: `${s.patient.firstName} ${s.patient.lastName}`,
        phoneNumber: s.patient.contacts[0]?.contactValue || null,
        serviceName: s.service.name,
        serviceNameEn: s.service.nameEn,
        serviceCategory: s.service.category,
      }));

      return {
        data,
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
  // GET /:orgId/stats — Dashboard stats
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/stats',
    async (request) => {
      const { orgId } = request.params;
      if (request.user.orgId !== orgId) return { error: 'Unauthorized' };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalPending, reminders, offers, sentToday] = await Promise.all([
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
          where: { orgId, status: 'sent', sentAt: { gte: today } },
        }),
      ]);

      return { totalPending, reminders, offers, sentToday };
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
}
