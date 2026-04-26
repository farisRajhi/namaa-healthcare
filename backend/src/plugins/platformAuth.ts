import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { messages, getLang, msg } from '../lib/messages.js';

export interface PlatformJwtPayload {
  platformAdminId: string;
  type: 'platform';
  iat?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    platformAdmin?: PlatformJwtPayload;
  }
  interface FastifyInstance {
    authenticatePlatform: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const platformAuthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticatePlatform', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const decoded = await request.jwtVerify<PlatformJwtPayload>();
      if (decoded.type !== 'platform' || !decoded.platformAdminId) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid platform token' });
      }

      const admin = await fastify.prisma.platformAdmin.findUnique({
        where: { platformAdminId: decoded.platformAdminId },
        select: { isActive: true, lastLogin: true },
      });
      if (!admin || !admin.isActive) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Platform admin inactive or not found' });
      }
      if (admin.lastLogin && decoded.iat) {
        const lastLoginSeconds = Math.floor(admin.lastLogin.getTime() / 1000);
        if (decoded.iat < lastLoginSeconds) {
          const lang = getLang(request.headers['accept-language']);
          return reply.code(401).send({ error: 'Unauthorized', message: msg(messages.platform.tokenInvalidated, lang) });
        }
      }

      request.platformAdmin = decoded;
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
};

export default fp(platformAuthPlugin, {
  name: 'platformAuth',
  dependencies: ['@fastify/jwt', 'prisma'],
});

export { platformAuthPlugin };
