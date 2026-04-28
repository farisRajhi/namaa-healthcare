/**
 * Campaign Routes (org-scoped aliases)
 *
 * GET    /api/campaigns/:orgId           — List campaigns for org
 * POST   /api/campaigns/:orgId           — Create campaign
 * GET    /api/campaigns/:orgId/:id       — Get campaign details
 * PUT    /api/campaigns/:orgId/:id       — Update campaign
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCampaignManager } from '../services/campaigns/campaignManager.js';
import { requireManager } from '../middleware/rbac.js';

const createCampaignSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  type: z.enum(['recall', 'preventive', 'follow_up', 'satisfaction', 'announcement', 'promotional', 'reminder']),
  targetFilter: z.object({
    minAge: z.number().optional(),
    maxAge: z.number().optional(),
    sex: z.string().optional(),
    lastVisitDaysAgo: z.number().optional(),
    noAppointmentDays: z.number().optional(),
    previousServiceIds: z.array(z.string().uuid()).optional(),
    excludeWithUpcoming: z.boolean().optional(),
    patientIds: z.array(z.string().uuid()).optional(),
    // Knowledge Base targeting
    tags: z.array(z.string()).optional(),
    serviceInterests: z.array(z.string()).optional(),
    minEngagementScore: z.number().min(0).max(100).optional(),
    maxEngagementScore: z.number().min(0).max(100).optional(),
    channelPreference: z.string().optional(),
  }).optional().default({}),
  channelSequence: z.array(z.enum(['voice', 'sms', 'whatsapp'])).min(1).optional().default(['sms']),
  channel: z.string().optional(), // Convenience alias
  message: z.string().optional(),
  scriptEn: z.string().optional(),
  scriptAr: z.string().optional(),
  targetAudience: z.string().optional(),
  maxCallsPerHour: z.number().min(1).max(500).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  adImageId: z.string().uuid().nullable().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
});

export default async function campaignRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireActivated);
  // Campaign management is admin/manager only
  app.addHook('preHandler', requireManager);

  const getManager = () => getCampaignManager(app.prisma);

  // GET /api/campaigns/:orgId — List campaigns
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const query = listQuerySchema.parse(request.query);
    const manager = getManager();
    return manager.listCampaigns(orgId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  });

  // POST /api/campaigns/:orgId — Create campaign
  app.post<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = createCampaignSchema.parse(request.body);
    const manager = getManager();

    // Map convenience fields
    const channelSequence = body.channel
      ? [body.channel as 'sms' | 'whatsapp' | 'voice']
      : body.channelSequence;

    const campaign = await manager.createCampaign({
      orgId,
      name: body.name,
      nameAr: body.nameAr,
      type: body.type,
      targetFilter: body.targetFilter || {},
      channelSequence,
      scriptEn: body.scriptEn || body.message,
      scriptAr: body.scriptAr,
      maxCallsPerHour: body.maxCallsPerHour,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      adImageId: body.adImageId ?? undefined,
    });

    return campaign;
  });

  // GET /api/campaigns/:orgId/:id — Get campaign details
  app.get<{ Params: { orgId: string; id: string } }>('/:orgId/:id', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, id } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const manager = getManager();
    const campaign = await manager.getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found' });
    if (campaign.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    return campaign;
  });

  // PUT /api/campaigns/:orgId/:id — Update campaign
  app.put<{ Params: { orgId: string; id: string } }>('/:orgId/:id', async (request, reply) => {
    const { orgId: userOrgId } = request.user;
    const { orgId, id } = request.params;
    if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

    const body = updateCampaignSchema.parse(request.body);
    const manager = getManager();

    try {
      const campaign = await manager.updateCampaign(id, {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        adImageId: body.adImageId ?? undefined,
      });
      return campaign;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Update failed' };
    }
  });
}
