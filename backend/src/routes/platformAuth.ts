import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function platformAuthRoutes(app: FastifyInstance) {
  // Aggressive rate limit — platform admin login is a high-value target.
  await app.register(rateLimit, {
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => request.ip,
    errorResponseBuilder: (_request: FastifyRequest, context: { after: string }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // POST /login — email + password
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    const admin = await app.prisma.platformAdmin.findUnique({
      where: { email: body.email },
    });

    if (!admin || !admin.isActive) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(body.password, admin.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = (app.jwt.sign as any)(
      { platformAdminId: admin.platformAdminId, type: 'platform' },
      { expiresIn: '3650d' },
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
      return reply.code(404).send({ error: 'Platform admin not found' });
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
