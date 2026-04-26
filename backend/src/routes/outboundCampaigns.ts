/**
 * Outbound Campaign Routes (legacy URL pattern, kept for frontend compatibility).
 *
 * GET    /api/outbound/campaigns/org/:orgId       — List campaigns for org
 * POST   /api/outbound/campaigns                   — Create campaign (orgId from auth)
 * GET    /api/outbound/campaigns/:id               — Get campaign details
 * POST   /api/outbound/campaigns/:id/start         — Start campaign (resolve targets, set active)
 * POST   /api/outbound/campaigns/:id/pause         — Pause active campaign
 * POST   /api/outbound/campaigns/:id/complete      — Complete campaign
 * GET    /api/outbound/campaigns/:id/results       — Campaign analytics summary
 * GET    /api/outbound/campaigns/:id/targets       — Campaign target list
 *
 * Outbound delivery itself is handled separately via Baileys WhatsApp
 * (`/api/baileys-whatsapp/send`). These endpoints only manage the campaign
 * lifecycle and target resolution.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCampaignManager } from '../services/campaigns/campaignManager.js';
import { requireManager } from '../middleware/rbac.js';

const createSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  type: z.enum([
    'recall', 'preventive', 'follow_up', 'satisfaction',
    'announcement', 'promotional', 'reminder',
  ]),
  targetFilter: z.record(z.any()).optional().default({}),
  channelSequence: z.array(z.string()).optional().default(['whatsapp']),
  scriptEn: z.string().optional(),
  scriptAr: z.string().optional(),
  scriptVariants: z.any().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  adImageId: z.string().uuid().nullable().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
  search: z.string().optional(),
});

const targetsQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(50),
  status: z.string().optional(),
});

export default async function outboundCampaignsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  app.addHook('preHandler', app.requirePlan('professional'));
  app.addHook('preHandler', requireManager);

  const getManager = () => getCampaignManager(app.prisma);

  // GET /org/:orgId — List campaigns
  app.get<{ Params: { orgId: string } }>('/org/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const query = listQuerySchema.parse(request.query);
    const manager = getManager();
    const result = await manager.listCampaigns(orgId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return result;
  });

  // POST / — Create campaign
  app.post('/', async (request, reply) => {
    const { orgId } = request.user;
    const body = createSchema.parse(request.body);
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
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      adImageId: body.adImageId ?? undefined,
    });

    return reply.code(201).send(campaign);
  });

  // GET /:id — Single campaign details (org-scoped via auth)
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return campaign;
  });

  // POST /:id/start
  app.post<{ Params: { id: string } }>('/:id/start', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return manager.startCampaign(id);
  });

  // POST /:id/pause
  app.post<{ Params: { id: string } }>('/:id/pause', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return manager.pauseCampaign(id);
  });

  // POST /:id/complete
  app.post<{ Params: { id: string } }>('/:id/complete', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return manager.completeCampaign(id);
  });

  // GET /:id/results
  app.get<{ Params: { id: string } }>('/:id/results', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return manager.getCampaignResults(id);
  });

  // GET /:id/targets
  app.get<{ Params: { id: string } }>('/:id/targets', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const query = targetsQuerySchema.parse(request.query);
    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return manager.listTargets(id, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  });
}
