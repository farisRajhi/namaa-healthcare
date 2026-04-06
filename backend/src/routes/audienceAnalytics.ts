/**
 * Audience Analytics API Routes
 *
 * GET   /api/audience/:orgId/segments          — Segment counts
 * GET   /api/audience/:orgId/behavior-patterns  — Clinic-wide behavior distributions
 * POST  /api/audience/:orgId/preview            — Audience preview for a filter
 * GET   /api/audience/:orgId/presets             — Get targeting preset definitions
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AudienceAnalyticsService } from '../services/campaigns/audienceAnalytics.js';
import { TARGETING_PRESETS } from '../services/campaigns/targetingPresets.js';

const previewBodySchema = z.object({
  targetFilter: z.object({
    minAge: z.number().optional(),
    maxAge: z.number().optional(),
    sex: z.string().optional(),
    conditions: z.array(z.string()).optional(),
    lastVisitDaysAgo: z.number().optional(),
    noAppointmentDays: z.number().optional(),
    previousServiceIds: z.array(z.string().uuid()).optional(),
    excludeWithUpcoming: z.boolean().optional(),
    patientIds: z.array(z.string().uuid()).optional(),
    tags: z.array(z.string()).optional(),
    serviceInterests: z.array(z.string()).optional(),
    minEngagementScore: z.number().min(0).max(100).optional(),
    maxEngagementScore: z.number().min(0).max(100).optional(),
    minReturnLikelihood: z.number().min(0).max(100).optional(),
    maxReturnLikelihood: z.number().min(0).max(100).optional(),
    channelPreference: z.string().optional(),
  }),
  channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
});

export default async function audienceAnalyticsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('onRequest', app.authenticate);

  // -------------------------------------------------------------------------
  // GET /api/audience/:orgId/presets — Targeting preset definitions
  // -------------------------------------------------------------------------
  app.get('/:orgId/presets', async (request: FastifyRequest<{ Params: { orgId: string } }>, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    return { presets: TARGETING_PRESETS };
  });

  // -------------------------------------------------------------------------
  // GET /api/audience/:orgId/segments — Segment counts
  // -------------------------------------------------------------------------
  app.get('/:orgId/segments', async (request: FastifyRequest<{ Params: { orgId: string } }>, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const service = new AudienceAnalyticsService(app.prisma, app.twilio ?? null);
    const segments = await service.getSegmentOverview(orgId);
    return { segments };
  });

  // -------------------------------------------------------------------------
  // GET /api/audience/:orgId/behavior-patterns — Clinic-wide distributions
  // -------------------------------------------------------------------------
  app.get('/:orgId/behavior-patterns', async (request: FastifyRequest<{ Params: { orgId: string } }>, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const service = new AudienceAnalyticsService(app.prisma, app.twilio ?? null);
    const patterns = await service.getClinicBehaviorPatterns(orgId);
    return patterns;
  });

  // -------------------------------------------------------------------------
  // POST /api/audience/:orgId/preview — Audience size + breakdown
  // -------------------------------------------------------------------------
  app.post('/:orgId/preview', async (request: FastifyRequest<{ Params: { orgId: string } }>, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const parsed = previewBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { targetFilter, channel } = parsed.data;
    const service = new AudienceAnalyticsService(app.prisma, app.twilio ?? null);
    const preview = await service.previewAudience(orgId, targetFilter, channel);
    return preview;
  });
}
