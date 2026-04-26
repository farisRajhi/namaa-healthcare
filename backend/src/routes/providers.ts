import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PLAN_PROVIDER_LIMIT, isPlanKey } from '../services/billing/plans.js';
import { getLang, messages } from '../lib/messages.js';

const createProviderSchema = z.object({
  displayName: z.string().min(1),
  departmentId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  credentials: z.string().optional(),
  active: z.boolean().default(true),
});

/**
 * Returns the provider cap for the org's current plan. Reads
 * `request.subscription` populated by requireSubscription; falls back to
 * the starter cap (defensive — shouldn't fire once the hook is wired).
 */
function providerLimitFor(request: FastifyRequest): number {
  const plan = (request as any).subscription?.plan;
  if (plan && isPlanKey(plan)) return PLAN_PROVIDER_LIMIT[plan];
  return PLAN_PROVIDER_LIMIT.starter;
}

function overLimitReply(currentPlan: string, limit: number, request: FastifyRequest) {
  const lang = getLang(request.headers['accept-language']);
  return {
    status: 402,
    body: {
      error: 'Plan upgrade required',
      message: messages.plan.limitReachedProviders[lang],
      code: 'PLAN_LIMIT_REACHED',
      kind: 'providers' as const,
      currentPlan,
      limit,
      upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
    },
  };
}

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startLocal: z.string(), // "09:00"
  endLocal: z.string(),   // "17:00"
  slotIntervalMin: z.number().default(15),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export default async function providersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  // Populates request.subscription with { plan, isTrialing, endDate }.
  // Read-only routes (GET) use it only to check active subscription; POST/PUT
  // additionally use the plan for provider-count limits.
  app.addHook('preHandler', app.requireSubscription);

  // List providers
  app.get('/', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const query = z.object({
      active: z.coerce.boolean().optional(),
      departmentId: z.string().uuid().optional(),
    }).parse(request.query);

    const providers = await app.prisma.provider.findMany({
      where: {
        orgId,
        ...(query.active !== undefined && { active: query.active }),
        ...(query.departmentId && { departmentId: query.departmentId }),
      },
      include: {
        department: true,
        facility: true,
        services: {
          include: { service: true },
        },
      },
      orderBy: { displayName: 'asc' },
    });

    return { data: providers };
  });

  // Get single provider
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;

    const provider = await app.prisma.provider.findFirst({
      where: { providerId: id, orgId },
      include: {
        department: true,
        facility: true,
        services: {
          include: { service: true },
        },
        availabilityRules: {
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });

    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    return provider;
  });

  // Create provider
  app.post('/', async (request: FastifyRequest, reply) => {
    const { orgId } = request.user;
    const body = createProviderSchema.parse(request.body);

    // Plan-based cap on active providers. Inactive providers do not count.
    if (body.active) {
      const limit = providerLimitFor(request);
      if (Number.isFinite(limit)) {
        const activeCount = await app.prisma.provider.count({
          where: { orgId, active: true },
        });
        if (activeCount >= limit) {
          const plan = (request as any).subscription?.plan ?? 'starter';
          const { status, body: errBody } = overLimitReply(plan, limit, request);
          return reply.code(status).send(errBody);
        }
      }
    }

    const provider = await app.prisma.provider.create({
      data: {
        orgId,
        displayName: body.displayName,
        departmentId: body.departmentId,
        facilityId: body.facilityId,
        credentials: body.credentials,
        active: body.active,
      },
      include: {
        department: true,
        facility: true,
      },
    });

    return provider;
  });

  // Update provider
  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = createProviderSchema.partial().parse(request.body);

    // Re-check provider cap if reactivating a previously-inactive provider.
    if (body.active === true) {
      const existing = await app.prisma.provider.findFirst({
        where: { providerId: id, orgId },
        select: { active: true },
      });
      if (existing && !existing.active) {
        const limit = providerLimitFor(request);
        if (Number.isFinite(limit)) {
          const activeCount = await app.prisma.provider.count({
            where: { orgId, active: true },
          });
          if (activeCount >= limit) {
            const plan = (request as any).subscription?.plan ?? 'starter';
            const { status, body: errBody } = overLimitReply(plan, limit, request);
            return reply.code(status).send(errBody);
          }
        }
      }
    }

    const result = await app.prisma.provider.updateMany({
      where: { providerId: id, orgId },
      data: body,
    });

    if (result.count === 0) {
      return { error: 'Provider not found' };
    }

    return { success: true };
  });

  // Add availability rule
  app.post<{ Params: { id: string } }>('/:id/availability', async (request, reply) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = availabilityRuleSchema.parse(request.body);

    // Verify provider belongs to org
    const provider = await app.prisma.provider.findFirst({
      where: { providerId: id, orgId },
    });

    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    const rule = await app.prisma.providerAvailabilityRule.create({
      data: {
        providerId: id,
        dayOfWeek: body.dayOfWeek,
        startLocal: new Date(`1970-01-01T${body.startLocal}:00.000Z`),
        endLocal: new Date(`1970-01-01T${body.endLocal}:00.000Z`),
        slotIntervalMin: body.slotIntervalMin,
        validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
        validTo: body.validTo ? new Date(body.validTo) : null,
      },
    });

    return rule;
  });

  // Delete availability rule
  app.delete<{ Params: { id: string; ruleId: string } }>('/:id/availability/:ruleId', async (request, reply) => {
    const { orgId } = request.user;
    const { id, ruleId } = request.params;

    const provider = await app.prisma.provider.findFirst({
      where: { providerId: id, orgId },
    });

    if (!provider) {
      return reply.code(404).send({ error: 'Provider not found' });
    }

    await app.prisma.providerAvailabilityRule.deleteMany({
      where: { ruleId, providerId: id },
    });

    return { success: true };
  });

  // Assign service to provider
  app.post<{ Params: { id: string } }>('/:id/services', async (request) => {
    const { orgId } = request.user;
    const { id } = request.params;
    const body = z.object({ serviceId: z.string().uuid() }).parse(request.body);

    // Verify provider belongs to org
    const provider = await app.prisma.provider.findFirst({
      where: { providerId: id, orgId },
    });

    if (!provider) {
      return { error: 'Provider not found' };
    }

    // Verify service belongs to org
    const service = await app.prisma.service.findFirst({
      where: { serviceId: body.serviceId, orgId },
    });

    if (!service) {
      return { error: 'Service not found' };
    }

    const link = await app.prisma.providerService.create({
      data: {
        providerId: id,
        serviceId: body.serviceId,
      },
    });

    return link;
  });

  // Remove service from provider
  app.delete<{ Params: { id: string; serviceId: string } }>('/:id/services/:serviceId', async (request) => {
    const { orgId } = request.user;
    const { id, serviceId } = request.params;

    // Verify provider belongs to org
    const provider = await app.prisma.provider.findFirst({
      where: { providerId: id, orgId },
    });

    if (!provider) {
      return { error: 'Provider not found' };
    }

    await app.prisma.providerService.delete({
      where: {
        providerId_serviceId: {
          providerId: id,
          serviceId,
        },
      },
    });

    return { success: true };
  });
}
