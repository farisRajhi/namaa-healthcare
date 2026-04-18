import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Subscription Guard Middleware
 * Checks if the org has an active Tawafud subscription before allowing access.
 * Decorates fastify with `requireSubscription` hook.
 */
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
          select: { status: true },
        });
        if (!org || org.status !== 'active') {
          return reply.code(403).send({
            error: 'Organization suspended',
            message: 'This organization has been suspended. Contact support.',
            code: 'ORG_SUSPENDED',
          });
        }

        const subscription = await fastify.prisma.tawafudSubscription.findFirst({
          where: {
            orgId: user.orgId,
            status: 'active',
            endDate: { gte: new Date() },
          },
        });

        if (!subscription) {
          return reply.code(402).send({
            error: 'Subscription Required',
            message: 'An active Tawafud subscription is required to access this feature.',
            code: 'SUBSCRIPTION_REQUIRED',
            upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
          });
        }

        // Attach subscription info to request for downstream use
        (request as any).subscription = subscription;
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
}

export default fp(subscriptionGuardPlugin, {
  name: 'subscriptionGuard',
  dependencies: ['prisma', 'auth'],
});

export { subscriptionGuardPlugin };
