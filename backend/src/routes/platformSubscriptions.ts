import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { cancelSubscription } from '../services/billing/subscriptions.js';
import { renewOrgSubscription } from '../services/billing/dunning.js';
import { messages, getLang, msg } from '../lib/messages.js';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'past_due', 'cancelled', 'expired']).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
});

const cancelBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export default async function platformSubscriptionsRoutes(app: FastifyInstance) {
  // GET / — paginated list with org name attached
  app.get('/', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest) => {
    const q = listSchema.parse(request.query);

    const where: Prisma.TawafudSubscriptionWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.plan) where.plan = q.plan;

    const [subs, total] = await Promise.all([
      app.prisma.tawafudSubscription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      app.prisma.tawafudSubscription.count({ where }),
    ]);

    const orgIds = Array.from(new Set(subs.map((s) => s.orgId)));
    const orgs = orgIds.length
      ? await app.prisma.org.findMany({
          where: { orgId: { in: orgIds } },
          select: { orgId: true, name: true, nameAr: true, status: true },
        })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.orgId, o]));

    return {
      data: subs.map((s) => ({
        ...s,
        org: orgMap.get(s.orgId) ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // GET /:id — single subscription with org + recent payments
  app.get('/:id', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const lang = getLang(request.headers['accept-language']);
    const sub = await app.prisma.tawafudSubscription.findUnique({ where: { id } });
    if (!sub) return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.subscriptionNotFound, lang) });

    const [org, payments] = await Promise.all([
      app.prisma.org.findUnique({
        where: { orgId: sub.orgId },
        select: { orgId: true, name: true, nameAr: true, status: true },
      }),
      app.prisma.tawafudPayment.findMany({
        where: { orgId: sub.orgId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    return { subscription: sub, org, payments };
  });

  // PATCH /:id/cancel — admin-initiated cancel (audit-logged)
  app.patch('/:id/cancel', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { reason } = cancelBodySchema.parse(request.body);
    const platformAdminId = request.platformAdmin!.platformAdminId;
    const lang = getLang(request.headers['accept-language']);
    const userAgent = request.headers['user-agent'] ?? null;

    const sub = await app.prisma.tawafudSubscription.findUnique({ where: { id } });
    if (!sub) return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.subscriptionNotFound, lang) });

    const updated = await cancelSubscription(app.prisma, sub.orgId);

    await app.prisma.auditLog.create({
      data: {
        orgId: sub.orgId,
        platformAdminId,
        action: 'platform.subscription.cancel',
        resource: 'subscription',
        resourceId: sub.id,
        details: { reason, plan: sub.plan, endDate: sub.endDate.toISOString(), userAgent },
        ipAddress: request.ip,
      },
    });

    return { subscription: updated };
  });

  // POST /:id/retry-renewal — admin-initiated immediate renewal attempt
  app.post('/:id/retry-renewal', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const platformAdminId = request.platformAdmin!.platformAdminId;
    const lang = getLang(request.headers['accept-language']);
    const userAgent = request.headers['user-agent'] ?? null;

    const sub = await app.prisma.tawafudSubscription.findUnique({ where: { id } });
    if (!sub) return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.subscriptionNotFound, lang) });

    const summary = await renewOrgSubscription(app.prisma, sub.orgId);

    await app.prisma.auditLog.create({
      data: {
        orgId: sub.orgId,
        platformAdminId,
        action: 'platform.subscription.retry_renewal',
        resource: 'subscription',
        resourceId: sub.id,
        details: { summary, userAgent } as unknown as Prisma.InputJsonValue,
        ipAddress: request.ip,
      },
    });

    return { summary };
  });
}
