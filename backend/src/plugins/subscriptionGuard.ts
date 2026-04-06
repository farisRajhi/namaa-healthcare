import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Subscription Guard Middleware
 * Checks if the org has an active Moyasar subscription before allowing access.
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
