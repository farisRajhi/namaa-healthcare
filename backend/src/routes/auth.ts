import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  orgName: z.string().min(2),
});

export default async function authRoutes(app: FastifyInstance) {
  // Login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // For now, find the first org to use (placeholder until proper user auth is implemented)
    // In production, you'd look up the user by email and verify password
    const org = await app.prisma.org.findFirst();

    if (!org) {
      return reply.code(401).send({ error: 'No organization found. Please register first.' });
    }

    const token = app.jwt.sign({
      userId: crypto.randomUUID(),
      orgId: org.orgId,
      email: body.email,
    });

    return { token };
  });

  // Register new organization
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    // Create organization
    const org = await app.prisma.org.create({
      data: {
        name: body.orgName,
        defaultTimezone: 'Asia/Riyadh', // Default for Middle East
      },
    });

    // TODO: Create user record and hash password
    // For now, just return the org

    const token = app.jwt.sign({
      userId: 'new-user-id',
      orgId: org.orgId,
      email: body.email,
    });

    return {
      token,
      org: {
        id: org.orgId,
        name: org.name,
      },
    };
  });

  // Get current user
  app.get('/me', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest) => {
    const user = request.user;

    const org = await app.prisma.org.findUnique({
      where: { orgId: user.orgId },
    });

    return {
      userId: user.userId,
      email: user.email,
      org: org ? { id: org.orgId, name: org.name } : null,
    };
  });
}
