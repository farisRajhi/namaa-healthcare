import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
// HIDDEN: billing system — re-enable when subscriptions return
// import { PLAN_KEYS } from '../services/billing/plans.js';
import { getBaileysManager } from '../services/messaging/baileysManager.js';
import { messages, getLang, msg } from '../lib/messages.js';
import { redactAuditDetails } from '../services/security/redactAuditDetails.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'suspended', 'deleted']).optional(),
  isActivated: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const statusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(500).optional(),
});

const activationSchema = z.object({
  isActivated: z.boolean(),
  reason: z.string().trim().min(3).max(500).optional(),
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

    const where: Prisma.OrgWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.isActivated !== undefined) (where as any).isActivated = q.isActivated;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { nameAr: { contains: q.search, mode: 'insensitive' } },
      ];
    }

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

    return {
      data: data.map((o) => ({
        orgId: o.orgId,
        name: o.name,
        nameAr: o.nameAr,
        status: o.status,
        suspendedAt: o.suspendedAt,
        suspendedReason: o.suspendedReason,
        defaultTimezone: o.defaultTimezone,
        createdAt: o.createdAt,
        userCount: o._count.users,
        isActivated: (o as any).isActivated ?? false,
        activatedAt: (o as any).activatedAt ?? null,
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
    const lang = getLang(request.headers['accept-language']);

    const org = await app.prisma.org.findUnique({
      where: { orgId: id },
    });
    if (!org) {
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.orgNotFound, lang) });
    }

    const [userCount, facilityCount, patientCount, appointmentCount, smsCount, latestAudit, activatedBy] = await Promise.all([
      app.prisma.user.count({ where: { orgId: id } }),
      app.prisma.facility.count({ where: { orgId: id } }),
      app.prisma.patient.count({ where: { orgId: id } }),
      app.prisma.appointment.count({ where: { orgId: id } }),
      app.prisma.smsLog.count({ where: { orgId: id } }),
      app.prisma.auditLog.findFirst({
        where: { orgId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      (org as any).activatedByPlatformAdminId
        ? app.prisma.platformAdmin.findUnique({
            where: { platformAdminId: (org as any).activatedByPlatformAdminId },
            select: { name: true, email: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      orgId: org.orgId,
      name: org.name,
      nameAr: org.nameAr,
      status: org.status,
      suspendedAt: org.suspendedAt,
      suspendedReason: org.suspendedReason,
      defaultTimezone: org.defaultTimezone,
      aiAutoReply: org.aiAutoReply,
      createdAt: org.createdAt,
      isActivated: (org as any).isActivated ?? false,
      activatedAt: (org as any).activatedAt ?? null,
      activatedBy: activatedBy ? { name: activatedBy.name, email: activatedBy.email } : null,
      counts: {
        users: userCount,
        facilities: facilityCount,
        patients: patientCount,
        appointments: appointmentCount,
        smsMessages: smsCount,
      },
      lastActivityAt: latestAudit?.createdAt ?? null,
    };
  });

  // Activate / deactivate org (replaces hidden subscription system)
  app.patch('/:id/activation', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = activationSchema.parse(request.body);
    const platformAdminId = request.platformAdmin!.platformAdminId;
    const lang = getLang(request.headers['accept-language']);
    const userAgent = request.headers['user-agent'] ?? null;

    const existing = await app.prisma.org.findUnique({
      where: { orgId: id },
      select: { orgId: true, isActivated: true } as any,
    });
    if (!existing) {
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.orgNotFound, lang) });
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      const org = await tx.org.update({
        where: { orgId: id },
        data: ({
          isActivated: body.isActivated,
          activatedAt: body.isActivated ? new Date() : null,
          activatedByPlatformAdminId: body.isActivated ? platformAdminId : null,
        } as any),
      });

      await tx.auditLog.create({
        data: {
          orgId: id,
          platformAdminId,
          action: body.isActivated ? 'platform.org.activate' : 'platform.org.deactivate',
          resource: 'org',
          resourceId: id,
          details: {
            reason: body.reason ?? null,
            previousIsActivated: (existing as any).isActivated ?? false,
            userAgent,
          },
          ipAddress: request.ip,
        },
      });

      return org;
    });

    return updated;
  });

  // Suspend / reactivate
  app.patch('/:id/status', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = statusSchema.parse(request.body);
    const platformAdminId = request.platformAdmin!.platformAdminId;
    const lang = getLang(request.headers['accept-language']);
    const userAgent = request.headers['user-agent'] ?? null;

    const existing = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true, status: true } });
    if (!existing) {
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.orgNotFound, lang) });
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
          details: { reason: body.reason ?? null, previousStatus: existing.status, userAgent },
          ipAddress: request.ip,
        },
      });

      return org;
    });

    if (isSuspending) {
      try {
        await getBaileysManager().disconnect(id);
      } catch (err) {
        request.log.warn({ err, orgId: id }, 'Failed to tear down Baileys session on suspend');
      }
    }

    return updated;
  });

  // HIDDEN: billing system — subscription override endpoint removed while activation
  // is the only gating signal. Re-enable PATCH /:id/subscription when billing returns.

  // Impersonate
  app.post('/:id/impersonate', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = impersonateSchema.parse(request.body ?? {});
    const platformAdminId = request.platformAdmin!.platformAdminId;
    const lang = getLang(request.headers['accept-language']);
    const userAgent = request.headers['user-agent'] ?? null;

    const org = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true, name: true, nameAr: true, status: true } });
    if (!org) {
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.orgNotFound, lang) });
    }
    if (org.status !== 'active') {
      return reply.code(400).send({ error: 'BadRequest', message: msg(messages.platform.cannotImpersonateInactiveOrg, lang) });
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
      return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.noActiveUserInOrg, lang) });
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
        details: { orgName: org.name, orgNameAr: org.nameAr, expiresInSec, userAgent },
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
      org: { orgId: org.orgId, name: org.name, nameAr: org.nameAr },
    };
  });

  // Per-org audit log (newest first, paginated)
  app.get('/:id/audit-log', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const lang = getLang(request.headers['accept-language']);
    const q = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      cursor: z.string().uuid().optional(),
    }).parse(request.query);

    const org = await app.prisma.org.findUnique({ where: { orgId: id }, select: { orgId: true } });
    if (!org) return reply.code(404).send({ error: 'NotFound', message: msg(messages.platform.orgNotFound, lang) });

    const entries = await app.prisma.auditLog.findMany({
      where: { orgId: id },
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { auditId: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > q.limit;
    const items = (hasMore ? entries.slice(0, q.limit) : entries).map((e) => ({
      ...e,
      details: redactAuditDetails(e.details),
    }));
    const nextCursor = hasMore ? items[items.length - 1].auditId : null;

    return { items, nextCursor };
  });
}
