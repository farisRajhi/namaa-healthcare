import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Subscription Guard Middleware
 *
 * Allows access if the org has:
 *   (a) an active paid subscription (status 'active', endDate in future), OR
 *   (b) an active 14-day trial (org.trialEndsAt > now).
 *
 * Decorates Fastify with `requireSubscription`.
 * Attaches `{ plan, isTrialing, endDate, trialEndsAt }` to `request.subscription`
 * so downstream handlers (and the plan guard) can inspect tier without re-querying.
 */

interface SubscriptionRequestState {
  plan: string;
  isTrialing: boolean;
  endDate: Date | null;
  trialEndsAt: Date | null;
}

const subscriptionGuardPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'requireSubscription',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const user = request.user;

      if (!user?.orgId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        // Short-circuit on org suspension (belt-and-suspenders with auth plugin).
        const org = await fastify.prisma.org.findUnique({
          where: { orgId: user.orgId },
          select: { status: true, trialEndsAt: true },
        });
        if (!org || org.status !== 'active') {
          return reply.code(403).send({
            error: 'Organization suspended',
            message: 'This organization has been suspended. Contact support.',
            code: 'ORG_SUSPENDED',
          });
        }

        const now = new Date();
        const trialEndsAt: Date | null = org.trialEndsAt ?? null;
        const isTrialing = !!trialEndsAt && trialEndsAt.getTime() > now.getTime();

        // Accept 'active' and 'past_due' so orgs in dunning grace keep access.
        // Consistent with auth.ts hasPaidActive and dunning.ts retry flow.
        // `endDate >= now` still blocks fully-expired subs.
        const subscription = await fastify.prisma.tawafudSubscription.findFirst({
          where: {
            orgId: user.orgId,
            status: { in: ['active', 'past_due'] },
            endDate: { gte: now },
          },
        });

        if (!subscription && !isTrialing) {
          return reply.code(402).send({
            error: 'Subscription Required',
            message: 'An active Tawafud subscription is required to access this feature.',
            code: 'SUBSCRIPTION_REQUIRED',
            upgradeUrl: `${process.env.FRONTEND_URL}/billing?tab=plans`,
          });
        }

        const state: SubscriptionRequestState = {
          // Trial is treated as "professional" for tier checks (see planGuard).
          plan: subscription?.plan ?? 'professional',
          isTrialing,
          endDate: subscription?.endDate ?? null,
          trialEndsAt,
        };

        (request as any).subscription = state;
      } catch (error) {
        fastify.log.error(`[subscriptionGuard] ${error}`);
        return reply.code(500).send({ error: 'Failed to verify subscription' });
      }
    },
  );
};

declare module 'fastify' {
  interface FastifyInstance {
    requireSubscription: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
  interface FastifyRequest {
    subscription?: SubscriptionRequestState;
  }
}

export default fp(subscriptionGuardPlugin, {
  name: 'subscriptionGuard',
  dependencies: ['prisma', 'auth'],
});

export { subscriptionGuardPlugin };
