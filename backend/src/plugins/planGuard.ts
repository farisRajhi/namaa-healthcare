import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Plan-Tier Guard Middleware
 *
 * Factory that returns a preHandler requiring the org's current plan to be at
 * least the supplied tier. Trial access maps to `professional` (i.e. a trialing
 * org can use everything a Professional subscriber can, but not Enterprise-only
 * features like multi-branch).
 *
 * Usage:
 *   app.post('/', { preHandler: [app.authenticate, app.requireSubscription, app.requirePlan('professional')] }, handler)
 *
 * Requires `app.requireSubscription` to have run first so `request.subscription`
 * is populated. If missing, this guard will query it as a fallback.
 *
 * The mirror matrix on the frontend is frontend/src/config/planFeatures.ts.
 */

export type PlanTier = 'starter' | 'professional' | 'enterprise';

const PLAN_RANK: Record<PlanTier, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
};

function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === 'string' && ['starter', 'professional', 'enterprise'].includes(v);
}

const planGuardPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'requirePlan',
    function (required: PlanTier) {
      return async function (request: FastifyRequest, reply: FastifyReply) {
        const user = request.user;
        if (!user?.orgId) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        let current = (request as any).subscription as
          | { plan: string; isTrialing: boolean }
          | undefined;

        // Fallback if requireSubscription wasn't chained in front of this guard.
        if (!current) {
          const now = new Date();
          const org = await fastify.prisma.org.findUnique({
            where: { orgId: user.orgId },
            select: { trialEndsAt: true },
          });
          const trialEndsAt: Date | null = org?.trialEndsAt ?? null;
          const isTrialing = !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
          const sub = await fastify.prisma.tawafudSubscription.findFirst({
            where: {
              orgId: user.orgId,
              status: { in: ['active', 'past_due'] },
              endDate: { gte: now },
            },
          });
          if (!sub && !isTrialing) {
            return reply.code(402).send({
              error: 'Subscription Required',
              message: 'An active Tawafud subscription is required.',
              code: 'SUBSCRIPTION_REQUIRED',
              upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
            });
          }
          current = { plan: sub?.plan ?? 'professional', isTrialing };
        }

        const currentPlan = isPlanTier(current.plan) ? current.plan : 'starter';
        if (PLAN_RANK[currentPlan] < PLAN_RANK[required]) {
          return reply.code(402).send({
            error: 'Plan upgrade required',
            message: `This feature requires the ${required} plan or higher.`,
            code: 'PLAN_UPGRADE_REQUIRED',
            requiredPlan: required,
            currentPlan,
            upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
          });
        }
      };
    },
  );
};

declare module 'fastify' {
  interface FastifyInstance {
    requirePlan: (
      required: PlanTier,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(planGuardPlugin, {
  name: 'planGuard',
  dependencies: ['prisma', 'auth', 'subscriptionGuard'],
});

export { planGuardPlugin };
