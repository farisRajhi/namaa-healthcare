import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PLAN_KEYS } from '../services/billing/plans.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const statusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(500).optional(),
});

const subscriptionOverrideSchema = z.object({
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['active', 'cancelled', 'expired']).optional(),
  reason: z.string().trim().min(3).max(500),
}).refine((v) => v.plan !== undefined || v.endDate !== undefined || v.status !== undefined, {
  message: 'At least one of plan, endDate, or status must be provided',
});

const impersonateSchema = z.object({
  userId: z.string().uuid().optional(),
}).default({});

export default async function platformOrgsRoutes(app: FastifyInstance) {
  // List orgs (paginated, filterable)
  app.get('/', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest) => {
    const q = listQuerySchema.parse(request.query);

    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.search) where.name = { contains: q.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      app.prisma.org.findMany({
        where,
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          _count: { select: { users: true } },
        },
      }),
      app.prisma.org.count({ where }),
    ]);

    // Fetch latest subscription for each org in a single batch
    const orgIds = data.map((o) => o.orgId);
    const subs = orgIds.length
      ? await app.prisma.tawafudSubscription.findMany({
          where: { orgId: { in: orgIds } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const latestByOrg = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      if (!latestByOrg.has(s.orgId)) latestByOrg.set(s.orgId, s);
    }

    return {
      data: data.map((o) => ({
        orgId: o.orgId,
        name: o.name,
        status: o.status,
        suspendedAt: o.suspendedAt,
        suspendedReason: o.suspendedReason,
        defaultTimezone: o.defaultTimezone,
        createdAt: o.createdAt,
        userCount: o._count.users,
        subscription: latestByOrg.get(o.orgId) ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  // Org detail: metadata + counts + subscription
  app.get('/:id', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const org = await app.prisma.org.findUnique({
      where: { orgId: id },
    });
    if (!org) {
      return reply.code(404).send({ error: 'Org not found' });
    }

    const [userCount, facilityCount, patientCount, appointmentCount, smsCount, subscription, latestAudit] = await Promise.all([
      app.prisma.user.count({ where: { orgId: id } }),
      app.prisma.facility.count({ where: { orgId: id } }),
      app.prisma.patient.count({ where: { orgId: id } }),
      app.prisma.appointment.count({ where: { orgId: id } }),
      app.prisma.smsLog.count({ where: { orgId: id } }),
      app.prisma.tawafudSubscription.findFirst({
        where: { orgId: id },
        orderBy: { createdAt: 'desc' },
      }),
      app.prisma.auditLog.findFirst({
        where: { orgId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      orgId: org.orgId,
      name: org.name,
      status: org.status,
      suspendedAt: org.suspendedAt,
      suspendedReason: org.suspendedReason,
      defaultTimezone: org.defaultTimezone,
      aiAutoReply: org.aiAutoReply,
      createdAt: org.createdAt,
      counts: {
        users: userCount,
        facilities: facilityCount,
        patients: patientCount,
        appointments: appointmentCount,
        smsMessages: smsCount,
      },
      subscription,
      lastActivityAt: latestAudit?.createdAt ?? null,
    };
  });

  // Suspend / reactivate
  app.patch('/:id/status', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);
    const platformAdminId = request.platformAdmin!.platformAdminId;

    const existing = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true, status: true } });
    if (!existing) {
      return reply.code(404).send({ error: 'Org not found' });
    }

    const nextStatus = body.status;
    const isSuspending = nextStatus === 'suspended';

    const updated = await app.prisma.$transaction(async (tx) => {
      const org = await tx.org.update({
        where: { orgId: id },
        data: {
          status: nextStatus,
          suspendedAt: isSuspending ? new Date() : null,
          suspendedReason: isSuspending ? (body.reason ?? null) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          orgId: id,
          platformAdminId,
          action: isSuspending ? 'platform.org.suspend' : 'platform.org.reactivate',
          resource: 'org',
          resourceId: id,
          details: { reason: body.reason ?? null, previousStatus: existing.status },
          ipAddress: request.ip,
        },
      });

      return org;
    });

    return updated;
  });

  // Override subscription (grant comps, extend trial, etc.)
  app.patch('/:id/subscription', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = subscriptionOverrideSchema.parse(request.body);
    const platformAdminId = request.platformAdmin!.platformAdminId;

    const org = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true } });
    if (!org) {
      return reply.code(404).send({ error: 'Org not found' });
    }

    const current = await app.prisma.tawafudSubscription.findFirst({
      where: { orgId: id },
      orderBy: { createdAt: 'desc' },
    });

    const nextPlan = body.plan ?? current?.plan ?? 'starter';
    const nextStatus = body.status ?? current?.status ?? 'active';
    const nextStart = current?.startDate ?? new Date();
    const nextEnd = body.endDate
      ? new Date(body.endDate)
      : current?.endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const result = await app.prisma.$transaction(async (tx) => {
      let subscription;
      if (current) {
        subscription = await tx.tawafudSubscription.update({
          where: { id: current.id },
          data: { plan: nextPlan, status: nextStatus, endDate: nextEnd },
        });
      } else {
        subscription = await tx.tawafudSubscription.create({
          data: {
            orgId: id,
            plan: nextPlan,
            status: nextStatus,
            startDate: nextStart,
            endDate: nextEnd,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          orgId: id,
          platformAdminId,
          action: 'platform.subscription.override',
          resource: 'subscription',
          resourceId: subscription.id,
          details: {
            reason: body.reason,
            previous: current ? { plan: current.plan, status: current.status, endDate: current.endDate } : null,
            next: { plan: nextPlan, status: nextStatus, endDate: nextEnd },
          },
          ipAddress: request.ip,
        },
      });

      return subscription;
    });

    return result;
  });

  // Impersonate: mint a short-lived staff JWT scoped to the target org.
  // Picks an active admin user if no userId given.
  app.post('/:id/impersonate', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = impersonateSchema.parse(request.body ?? {});
    const platformAdminId = request.platformAdmin!.platformAdminId;

    const org = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true, name: true, status: true } });
    if (!org) {
      return reply.code(404).send({ error: 'Org not found' });
    }
    if (org.status !== 'active') {
      return reply.code(400).send({ error: 'Cannot impersonate user in a non-active org' });
    }

    const target = body.userId
      ? await app.prisma.user.findFirst({
          where: { userId: body.userId, orgId: id, isActive: true },
        })
      : await app.prisma.user.findFirst({
          where: { orgId: id, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
    if (!target) {
      return reply.code(404).send({ error: 'No active user found in this org' });
    }

    let roleName: string | undefined;
    if (target.roleId) {
      const roleRecord = await app.prisma.role.findUnique({
        where: { roleId: target.roleId },
        select: { name: true },
      });
      roleName = roleRecord?.name ?? undefined;
    }

    const expiresInSec = 15 * 60;
    const token = (app.jwt.sign as any)(
      {
        userId: target.userId,
        orgId: target.orgId,
        email: target.email,
        role: roleName ?? 'admin',
        imp: true,
        platformAdminId,
      },
      { expiresIn: `${expiresInSec}s` },
    );

    await app.prisma.auditLog.create({
      data: {
        orgId: id,
        platformAdminId,
        userId: target.userId,
        action: 'platform.impersonate.start',
        resource: 'user',
        resourceId: target.userId,
        details: { orgName: org.name, expiresInSec },
        ipAddress: request.ip,
      },
    });

    return {
      token,
      expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      user: {
        userId: target.userId,
        email: target.email,
        name: target.name,
        role: roleName ?? 'admin',
      },
      org: { orgId: org.orgId, name: org.name },
    };
  });

  // Expose plan catalog for the override form
  app.get('/plans/catalog', {
    preHandler: [app.authenticatePlatform],
  }, async () => {
    return { plans: PLAN_KEYS };
  });

  // Audit log for a single org (paginated, newest first)
  app.get('/:id/audit-log', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().uuid().optional(),
    }).parse(request.query);

    const org = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true } });
    if (!org) return reply.code(404).send({ error: 'Org not found' });

    const entries = await app.prisma.auditLog.findMany({
      where: { orgId: id },
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { auditId: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > q.limit;
    const items = hasMore ? entries.slice(0, q.limit) : entries;
    const nextCursor = hasMore ? items[items.length - 1].auditId : null;

    return { items, nextCursor };
  });
}
