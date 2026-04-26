import { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { redactAuditDetails } from '../services/security/redactAuditDetails.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
  platformAdminId: z.string().uuid().optional(),
  action: z.string().min(1).max(120).optional(),
});

/**
 * Cross-org audit feed for the platform admin "Audit" page.
 * Returns newest-first with optional filters; org name (both EN + AR) joined
 * in for display. PII inside `details` is redacted before returning.
 */
export default async function platformAuditRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest) => {
    const q = querySchema.parse(request.query);

    const where: Prisma.AuditLogWhereInput = {};
    if (q.orgId) where.orgId = q.orgId;
    if (q.platformAdminId) where.platformAdminId = q.platformAdminId;
    if (q.action) where.action = { contains: q.action, mode: 'insensitive' };

    const entries = await app.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { auditId: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = entries.length > q.limit;
    const items = hasMore ? entries.slice(0, q.limit) : entries;
    const nextCursor = hasMore ? items[items.length - 1].auditId : null;

    const orgIds = Array.from(new Set(items.map((e) => e.orgId).filter(Boolean) as string[]));
    const orgs = orgIds.length
      ? await app.prisma.org.findMany({
          where: { orgId: { in: orgIds } },
          select: { orgId: true, name: true, nameAr: true },
        })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.orgId, o]));

    return {
      items: items.map((e) => {
        const org = e.orgId ? orgMap.get(e.orgId) : null;
        return {
          ...e,
          details: redactAuditDetails(e.details),
          orgName: org?.name ?? null,
          orgNameAr: org?.nameAr ?? null,
        };
      }),
      nextCursor,
    };
  });
}
