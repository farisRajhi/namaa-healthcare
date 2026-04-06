/**
 * Outbound Campaign API Routes
 *
 * POST   /api/outbound/campaigns              — Create campaign
 * GET    /api/outbound/campaigns/org/:orgId    — List campaigns for org
 * GET    /api/outbound/campaigns/:id           — Get campaign details
 * PUT    /api/outbound/campaigns/:id           — Update draft campaign
 * POST   /api/outbound/campaigns/:id/start     — Start (activate) campaign
 * POST   /api/outbound/campaigns/:id/pause     — Pause active campaign
 * POST   /api/outbound/campaigns/:id/execute   — Trigger campaign execution
 * GET    /api/outbound/campaigns/:id/results   — Campaign analytics/results
 * GET    /api/outbound/campaigns/:id/targets   — List targets with status
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCampaignManager } from '../services/campaigns/campaignManager.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createCampaignSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  type: z.enum(['recall', 'preventive', 'follow_up', 'satisfaction', 'announcement', 'promotional', 'reminder']),
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
  channelSequence: z.array(z.enum(['voice', 'sms', 'whatsapp'])).min(1),
  scriptEn: z.string().optional(),
  scriptAr: z.string().optional(),
  maxCallsPerHour: z.number().min(1).max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

const targetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default async function outboundRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const getManager = () => getCampaignManager(app.prisma, app.twilio);

  // -----------------------------------------------------------------------
  // POST /campaigns — Create campaign
  // -----------------------------------------------------------------------
  app.post('/campaigns', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = createCampaignSchema.parse(request.body);

    const manager = getManager();
    const campaign = await manager.createCampaign({
      orgId,
      name: body.name,
      nameAr: body.nameAr,
      type: body.type,
      targetFilter: body.targetFilter,
      channelSequence: body.channelSequence,
      scriptEn: body.scriptEn,
      scriptAr: body.scriptAr,
      maxCallsPerHour: body.maxCallsPerHour,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    return campaign;
  });

  // -----------------------------------------------------------------------
  // GET /campaigns/org/:orgId — List campaigns
  // -----------------------------------------------------------------------
  app.get<{ Params: { orgId: string } }>(
    '/campaigns/org/:orgId',
    async (request, reply) => {
      try {
        const { orgId } = request.params;
        const query = listQuerySchema.parse(request.query);

        // Verify user belongs to this org
        if (request.user.orgId !== orgId) {
          return reply.code(403).send({ error: 'Unauthorized' });
        }

        const manager = getManager();
        return manager.listCampaigns(orgId, {
          status: query.status,
          page: query.page,
          limit: query.limit,
        });
      } catch (err) {
        request.log.error(err, 'Failed to list campaigns');
        return reply.code(500).send({ error: 'Failed to fetch campaigns', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /campaigns/:id — Get campaign details
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/campaigns/:id',
    async (request) => {
      const { id } = request.params;
      const manager = getManager();
      const campaign = await manager.getCampaign(id);

      if (!campaign) {
        return { error: 'Campaign not found' };
      }

      // Verify org
      if (campaign.orgId !== request.user.orgId) {
        return { error: 'Unauthorized' };
      }

      return campaign;
    },
  );

  // Helper: verify campaign belongs to user's org
  async function verifyCampaignOrg(id: string, orgId: string) {
    const campaign = await app.prisma.campaign.findUnique({ where: { campaignId: id } });
    return campaign && campaign.orgId === orgId;
  }

  // -----------------------------------------------------------------------
  // PUT /campaigns/:id — Update draft campaign
  // -----------------------------------------------------------------------
  app.put<{ Params: { id: string } }>(
    '/campaigns/:id',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const body = updateCampaignSchema.parse(request.body);

      const manager = getManager();

      try {
        const campaign = await manager.updateCampaign(id, {
          ...body,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
        return campaign;
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Update failed',
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /campaigns/:id/start — Start campaign
  // -----------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/start',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const manager = getManager();

      try {
        const result = await manager.startCampaign(id);
        return {
          success: true,
          campaign: result.campaign,
          targetsCreated: result.targetsCreated,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Start failed',
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /campaigns/:id/pause — Pause campaign
  // -----------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/pause',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const manager = getManager();

      try {
        const campaign = await manager.pauseCampaign(id);
        return { success: true, campaign };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Pause failed',
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /campaigns/:id/execute — Trigger campaign execution
  // -----------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    '/campaigns/:id/execute',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const manager = getManager();

      const result = await manager.executeCampaign(id);
      return result;
    },
  );

  // -----------------------------------------------------------------------
  // GET /campaigns/:id/results — Campaign analytics
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/campaigns/:id/results',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const manager = getManager();

      try {
        return await manager.getCampaignResults(id);
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : 'Not found',
        };
      }
    },
  );

  // -----------------------------------------------------------------------
  // GET /campaigns/:id/targets — List targets with status
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/campaigns/:id/targets',
    async (request, reply) => {
      const { id } = request.params;
      if (!await verifyCampaignOrg(id, request.user.orgId)) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }
      const query = targetsQuerySchema.parse(request.query);
      const manager = getManager();

      return manager.listTargets(id, {
        status: query.status,
        page: query.page,
        limit: query.limit,
      });
    },
  );
}
