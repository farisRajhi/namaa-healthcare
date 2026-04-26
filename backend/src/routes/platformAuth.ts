import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { messages, getLang, msg } from '../lib/messages.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Constant-time placeholder hash so absent-user and wrong-password paths take
// the same time. Prevents user-enumeration via response-latency side channel.
const DUMMY_HASH = '$2b$12$invalidhashpaddingforfakecomparison.dummyvaluexxxxxxxxxx';

export default async function platformAuthRoutes(app: FastifyInstance) {
  // Register rate-limit plugin in this scope so per-route config is available.
  // No global max/timeWindow — applied only to /login below so an attacker
  // cannot exhaust the limit on /logout to lock the admin out of session
  // invalidation.
  await app.register(rateLimit, { global: false });

  const buildRateLimitError = (request: FastifyRequest, context: { after: string }) => {
    const lang = getLang(request.headers['accept-language']);
    const template = msg(messages.platform.rateLimitExceeded, lang);
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: template.replace('{seconds}', String(context.after)),
    };
  };

  // POST /login — email + password
  app.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => request.ip,
        errorResponseBuilder: buildRateLimitError,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);
    const lang = getLang(request.headers['accept-language']);
    const invalid = msg(messages.platform.invalidCredentials, lang);

    const admin = await app.prisma.platformAdmin.findUnique({
      where: { email: body.email },
    });

    // Always run a bcrypt compare to keep timing constant whether the user
    // exists or not — prevents email-enumeration via response latency.
    if (!admin || !admin.isActive) {
      await bcrypt.compare(body.password, DUMMY_HASH);
      return reply.code(401).send({ error: 'Unauthorized', message: invalid });
    }

    const valid = await bcrypt.compare(body.password, admin.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Unauthorized', message: invalid });
    }

    const token = (app.jwt.sign as any)(
      { platformAdminId: admin.platformAdminId, type: 'platform' },
      { expiresIn: '12h' },
    );

    await app.prisma.platformAdmin.update({
      where: { platformAdminId: admin.platformAdminId },
      data: { lastLogin: new Date() },
    });

    return {
      token,
      admin: {
        platformAdminId: admin.platformAdminId,
        email: admin.email,
        name: admin.name,
      },
    };
  });

  // GET /me — sanitized profile
  app.get('/me', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const platformAdminId = request.platformAdmin!.platformAdminId;

    const admin = await app.prisma.platformAdmin.findUnique({
      where: { platformAdminId },
      select: {
        platformAdminId: true,
        email: true,
        name: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!admin) {
      const lang = getLang(request.headers['accept-language']);
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.adminNotFound, lang) });
    }

    return admin;
  });

  // POST /logout — bumps lastLogin to invalidate existing tokens
  app.post('/logout', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest) => {
    await app.prisma.platformAdmin.update({
      where: { platformAdminId: request.platformAdmin!.platformAdminId },
      data: { lastLogin: new Date() },
    });
    return { success: true };
  });
}
