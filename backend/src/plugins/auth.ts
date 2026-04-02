import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      orgId: string;
      email: string;
      role?: string;
    };
    user: {
      userId: string;
      orgId: string;
      email: string;
      role?: string;
    };
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();

      // Verify user is still active in the database
      const dbUser = await fastify.prisma.user.findUnique({
        where: { userId: request.user.userId },
        select: { isActive: true },
      });
      if (!dbUser || !dbUser.isActive) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'User account is inactive or not found' });
      }
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  fastify.decorate('requireRole', function (...allowedRoles: string[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      if (!request.user.role || !allowedRoles.includes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
      }
    };
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...allowedRoles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['@fastify/jwt'],
});

export { authPlugin };
