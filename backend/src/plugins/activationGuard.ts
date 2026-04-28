import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { messages, getLang, msg } from '../lib/messages.js';

/**
 * Activation Guard
 *
 * Replaces the (now hidden) subscription/plan guards. An org must be flipped
 * to is_activated = true by a Platform Admin before any feature route works.
 * Newly registered orgs default to false; existing orgs were backfilled to true.
 *
 * Decorates Fastify with `requireActivated`. Depends on `app.authenticate`
 * having run first so `request.user.orgId` is populated.
 */

const activationGuardPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'requireActivated',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const user = request.user;
      const lang = getLang(request.headers['accept-language']);

      if (!user?.orgId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const org = await fastify.prisma.org.findUnique({
          where: { orgId: user.orgId },
          select: { status: true, isActivated: true },
        });

        if (!org || org.status !== 'active') {
          return reply.code(403).send({
            error: 'Organization suspended',
            message: 'This organization has been suspended. Contact support.',
            code: 'ORG_SUSPENDED',
          });
        }

        if (!org.isActivated) {
          return reply.code(403).send({
            error: 'Org not activated',
            message: msg(messages.org.notActivated, lang),
            code: 'ORG_NOT_ACTIVATED',
          });
        }
      } catch (error) {
        fastify.log.error(`[activationGuard] ${error}`);
        return reply.code(500).send({ error: 'Failed to verify activation' });
      }
    },
  );
};

declare module 'fastify' {
  interface FastifyInstance {
    requireActivated: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

export default fp(activationGuardPlugin, {
  name: 'activationGuard',
  dependencies: ['prisma', 'auth'],
});

export { activationGuardPlugin };
