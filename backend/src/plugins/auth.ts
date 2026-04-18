import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      orgId: string;
      email: string;
      role?: string;
      type?: 'platform' | 'patient';
      platformAdminId?: string;
      patientId?: string;
      imp?: boolean;
      iat?: number;
    };
    user: {
      userId: string;
      orgId: string;
      email: string;
      role?: string;
      type?: 'platform' | 'patient';
      platformAdminId?: string;
      patientId?: string;
      imp?: boolean;
      iat?: number;
    };
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();

      // Reject non-staff token types (platform admin or patient portal tokens must not pass staff auth)
      if (request.user.type) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token type for this endpoint' });
      }

      // Verify user is still active AND org is active (suspend-at-auth-time)
      const dbUser = await fastify.prisma.user.findUnique({
        where: { userId: request.user.userId },
        select: {
          isActive: true,
          lastLogin: true,
          org: { select: { status: true } },
        },
      });
      if (!dbUser || !dbUser.isActive) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'User account is inactive or not found' });
      }
      if (dbUser.org.status !== 'active') {
        return reply.code(403).send({
          error: 'Organization suspended',
          message: 'This organization has been suspended. Contact support.',
          code: 'ORG_SUSPENDED',
        });
      }
      if (dbUser.lastLogin && request.user.iat) {
        const lastLoginSeconds = Math.floor(dbUser.lastLogin.getTime() / 1000);
        if (request.user.iat < lastLoginSeconds) {
          return reply.code(401).send({ error: 'Token has been invalidated' });
        }
      }
    } catch (err) {
      if (reply.sent) return;
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
