import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { messages, getLang, msg } from '../lib/messages.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(2),
  name: z.string().optional(),
});

export default async function authRoutes(app: FastifyInstance) {
  // Rate-limit auth endpoints: max 10 attempts per minute per IP
  await app.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => request.ip,
    errorResponseBuilder: (_request: FastifyRequest, context: { after: string }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  // Register
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    // Check if email already exists
    const existing = await app.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      const lang = getLang(request.headers['accept-language']);
      return reply.code(409).send({ error: msg(messages.auth.emailTaken, lang) });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(body.password, 12);

    // Create org first
    const org = await app.prisma.org.create({
      data: {
        name: body.orgName,
        defaultTimezone: 'Asia/Riyadh',
      },
    });

    // Create user
    const user = await app.prisma.user.create({
      data: {
        orgId: org.orgId,
        email: body.email,
        password: hashedPassword,
        name: body.name || null,
      },
    });

    // Sign JWT
    const token = app.jwt.sign({
      userId: user.userId,
      orgId: user.orgId,
      email: user.email,
    });

    return {
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
      },
      org: {
        id: org.orgId,
        name: org.name,
      },
    };
  });

  // Login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // Find user by email
    const user = await app.prisma.user.findUnique({
      where: { email: body.email },
    });

    const lang = getLang(request.headers['accept-language']);

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: msg(messages.auth.invalidCredentials, lang) });
    }

    // Compare password
    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      return reply.code(401).send({ error: msg(messages.auth.invalidCredentials, lang) });
    }

    // Update last login
    await app.prisma.user.update({
      where: { userId: user.userId },
      data: { lastLogin: new Date() },
    });

    // Sign JWT
    const token = app.jwt.sign({
      userId: user.userId,
      orgId: user.orgId,
      email: user.email,
    });

    return { token };
  });

  // Get current user
  app.get('/me', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, orgId } = request.user;

    const user = await app.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      const lang = getLang(request.headers['accept-language']);
      return reply.code(404).send({ error: msg(messages.auth.userNotFound, lang) });
    }

    const org = await app.prisma.org.findUnique({
      where: { orgId: user.orgId },
    });

    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      nameAr: user.nameAr,
      org: org ? { id: org.orgId, name: org.name } : null,
    };
  });
}
