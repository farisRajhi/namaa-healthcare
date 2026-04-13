import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { messages, getLang, msg } from '../lib/messages.js';
import { aiCustomizationTemplate } from '../services/agentBuilder/templates.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  ),
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

  // Register — gated by REGISTRATION_TOKEN in production
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const regToken = process.env.REGISTRATION_TOKEN;
    if (regToken && request.headers['x-registration-token'] !== regToken) {
      return reply.code(403).send({ error: 'Registration is by invitation only' });
    }

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

    // Auto-deploy default AI customization flow for the new org
    try {
      await app.prisma.agentFlow.create({
        data: {
          orgId: org.orgId,
          name: aiCustomizationTemplate.name,
          nameAr: aiCustomizationTemplate.nameAr,
          description: aiCustomizationTemplate.description,
          descriptionAr: aiCustomizationTemplate.descriptionAr,
          nodes: aiCustomizationTemplate.nodes as any,
          edges: aiCustomizationTemplate.edges as any,
          variables: aiCustomizationTemplate.variables,
          settings: aiCustomizationTemplate.settings,
          isActive: true,
          isTemplate: false,
          templateCategory: aiCustomizationTemplate.templateCategory,
          publishedAt: new Date(),
        },
      });
    } catch (_) {
      // Non-critical: if template deploy fails, org still works with default prompts
    }

    // Create user
    const user = await app.prisma.user.create({
      data: {
        orgId: org.orgId,
        email: body.email,
        password: hashedPassword,
        name: body.name || null,
      },
    });

    // Sign JWT (no role at registration — user can be promoted later)
    const token = app.jwt.sign({
      userId: user.userId,
      orgId: user.orgId,
      email: user.email,
      role: 'viewer', // default role for new registrations
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

    // Find user by email (include role relation)
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

    // Look up the user's role name (if assigned)
    let roleName: string | undefined;
    if (user.roleId) {
      const roleRecord = await app.prisma.role.findUnique({
        where: { roleId: user.roleId },
        select: { name: true },
      });
      roleName = roleRecord?.name ?? undefined;
    }

    // Sign JWT first — before updating lastLogin to avoid iat < lastLogin race
    const token = app.jwt.sign({
      userId: user.userId,
      orgId: user.orgId,
      email: user.email,
      role: roleName ?? 'viewer',
    });

    // Update last login AFTER signing so new token's iat >= lastLogin (in seconds)
    await app.prisma.user.update({
      where: { userId: user.userId },
      data: { lastLogin: new Date() },
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

  // Logout — client should clear token; server-side invalidation via lastLogin check
  app.post('/logout', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Update lastLogin to invalidate any tokens issued before this moment
    // Client must clear its stored token
    await app.prisma.user.update({
      where: { userId: request.user.userId },
      data: { lastLogin: new Date() },
    });
    return { success: true };
  });

  // Change password — requires current password verification
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    ),
  });

  app.post('/change-password', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = changePasswordSchema.parse(request.body);
    const lang = getLang(request.headers['accept-language']);

    const user = await app.prisma.user.findUnique({
      where: { userId: request.user.userId },
    });

    if (!user) {
      return reply.code(404).send({ error: msg(messages.auth.userNotFound, lang) });
    }

    // Verify current password
    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    // Prevent reuse of same password
    const isSame = await bcrypt.compare(body.newPassword, user.password);
    if (isSame) {
      return reply.code(400).send({ error: 'New password must be different from current password' });
    }

    // Hash and update
    const hashedPassword = await bcrypt.hash(body.newPassword, 12);
    await app.prisma.user.update({
      where: { userId: user.userId },
      data: {
        password: hashedPassword,
        lastLogin: new Date(), // Invalidate existing tokens
      },
    });

    return { success: true, message: 'Password changed successfully' };
  });
}
