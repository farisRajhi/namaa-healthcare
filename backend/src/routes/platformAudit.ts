import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
  platformAdminId: z.string().uuid().optional(),
  action: z.string().min(1).max(120).optional(),
});

/**
 * Cross-org audit feed for the platform admin "Audit" page.
 * Returns newest-first with optional filters; org name is joined in for display.
 */
export default async function platformAuditRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticatePlatform],
  }, async (request: FastifyRequest) => {
    const q = querySchema.parse(request.query);

    const where: any = {};
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

    // Attach org names in a single batch.
    const orgIds = Array.from(new Set(items.map((e) => e.orgId).filter(Boolean) as string[]));
    const orgs = orgIds.length
      ? await app.prisma.org.findMany({
          where: { orgId: { in: orgIds } },
          select: { orgId: true, name: true },
        })
      : [];
    const orgMap = new Map(orgs.map((o) => [o.orgId, o.name]));

    return {
      items: items.map((e) => ({
        ...e,
        orgName: e.orgId ? orgMap.get(e.orgId) ?? null : null,
      })),
      nextCursor,
    };
  });
}
