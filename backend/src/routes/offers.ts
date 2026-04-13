/**
 * Offer Routes (WhatsApp Marketing Offers)
 *
 * POST   /api/offers/:orgId                    — Create offer
 * GET    /api/offers/:orgId                     — List offers
 * GET    /api/offers/:orgId/presets             — List targeting presets
 * POST   /api/offers/:orgId/preview-audience    — Preview audience count
 * GET    /api/offers/:orgId/:offerId            — Get offer details
 * PUT    /api/offers/:orgId/:offerId            — Update offer
 * POST   /api/offers/:orgId/:offerId/activate   — Activate offer
 * POST   /api/offers/:orgId/:offerId/pause      — Pause offer
 * POST   /api/offers/:orgId/:offerId/expire     — Force expire offer
 * GET    /api/offers/:orgId/:offerId/analytics  — Offer analytics
 * GET    /api/offers/:orgId/:offerId/redemptions — List redemptions
 * POST   /api/offers/validate-promo             — Validate promo code (public)
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { OfferManager } from '../services/offers/offerManager.js';

const targetFilterSchema = z.object({
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
  channelPreference: z.string().optional(),
}).optional().default({});

const createOfferSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  offerType: z.enum(['percentage_discount', 'fixed_discount', 'free_addon', 'bundle', 'loyalty_reward']),
  discountValue: z.number().optional(),
  discountUnit: z.enum(['percent', 'sar']).optional(),
  promoCode: z.string().optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
  providerIds: z.array(z.string().uuid()).optional(),
  facilityIds: z.array(z.string().uuid()).optional(),
  validFrom: z.string().transform((s) => new Date(s)),
  validUntil: z.string().transform((s) => new Date(s)),
  maxRedemptions: z.number().optional(),
  perPatientLimit: z.number().min(1).optional(),
  targetPreset: z.string().optional(),
  targetFilter: targetFilterSchema,
  messageAr: z.string().optional(),
  messageEn: z.string().optional(),
});

const updateOfferSchema = createOfferSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
  status: z.string().optional(),
  type: z.string().optional(),
});

export default async function offerRoutes(app: FastifyInstance) {
  const getManager = () => new OfferManager(app.prisma, app.twilio);

  // ── Public endpoint (no auth) ──────────────────────────────
  app.post('/validate-promo', async (request) => {
    const body = z.object({
      promoCode: z.string().min(1),
      patientId: z.string().uuid().optional(),
    }).parse(request.body);

    const manager = getManager();
    return manager.validatePromoCode(body.promoCode, body.patientId);
  });

  // ── Protected endpoints ────────────────────────────────────
  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', app.authenticate);

    // GET /api/offers/:orgId — List offers
    protectedApp.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
      try {
        const { orgId: userOrgId } = request.user;
        const { orgId } = request.params;
        if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

        const query = listQuerySchema.parse(request.query);
        const manager = getManager();
        return manager.listOffers(orgId, {
          status: query.status,
          type: query.type,
          page: query.page,
          limit: query.limit,
        });
      } catch (err) {
        request.log.error(err, 'Failed to list offers');
        return reply.code(500).send({ error: 'Failed to fetch offers', message: err instanceof Error ? err.message : 'Unknown error' });
      }
    });

    // GET /api/offers/:orgId/presets — List targeting presets
    protectedApp.get<{ Params: { orgId: string } }>('/:orgId/presets', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      return manager.getPresets();
    });

    // POST /api/offers/:orgId/preview-audience — Preview audience size
    protectedApp.post<{ Params: { orgId: string } }>('/:orgId/preview-audience', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const body = z.object({ targetFilter: targetFilterSchema }).parse(request.body);
      const manager = getManager();
      return manager.previewAudience(orgId, body.targetFilter);
    });

    // POST /api/offers/:orgId — Create offer
    protectedApp.post<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const body = createOfferSchema.parse(request.body);
      const manager = getManager();
      return manager.createOffer({ ...body, orgId });
    });

    // GET /api/offers/:orgId/:offerId — Get offer details
    protectedApp.get<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      const offer = await manager.getOffer(offerId);
      if (!offer || offer.orgId !== orgId) return { error: 'Not found' };
      return offer;
    });

    // PUT /api/offers/:orgId/:offerId — Update offer
    protectedApp.put<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const body = updateOfferSchema.parse(request.body);
      const manager = getManager();
      return manager.updateOffer(offerId, body);
    });

    // POST /api/offers/:orgId/:offerId/activate — Activate offer
    protectedApp.post<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId/activate', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      return manager.activateOffer(offerId);
    });

    // POST /api/offers/:orgId/:offerId/pause — Pause offer
    protectedApp.post<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId/pause', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      return manager.pauseOffer(offerId);
    });

    // POST /api/offers/:orgId/:offerId/expire — Force expire
    protectedApp.post<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId/expire', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      return manager.expireOffer(offerId);
    });

    // GET /api/offers/:orgId/:offerId/analytics — Offer analytics
    protectedApp.get<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId/analytics', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const manager = getManager();
      return manager.getOfferAnalytics(offerId);
    });

    // GET /api/offers/:orgId/:offerId/redemptions — List redemptions
    protectedApp.get<{ Params: { orgId: string; offerId: string } }>('/:orgId/:offerId/redemptions', async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId, offerId } = request.params;
      if (userOrgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });

      const query = z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(50),
      }).parse(request.query);

      const skip = (query.page - 1) * query.limit;

      const [redemptions, total] = await Promise.all([
        app.prisma.offerRedemption.findMany({
          where: { offerId },
          skip,
          take: query.limit,
          orderBy: { redeemedAt: 'desc' },
        }),
        app.prisma.offerRedemption.count({ where: { offerId } }),
      ]);

      return {
        data: redemptions,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      };
    });
  });
}
