import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditLoggerService } from '../services/security/auditLogger.js';
import { sanitizeForExport } from '../services/security/piiRedactor.js';

// ────────────────────────────────────────────────────────
// Audit Log Routes
// Section 21 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

const querySchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  action: z.string().optional(),
  resource: z.string().optional(),
  userId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const exportSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  redact: z.enum(['true', 'false']).default('true'),
});

export default async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const auditLogger = new AuditLoggerService(app.prisma);

  // ── List Audit Logs ────────────────────────────────────

  app.get<{ Params: { orgId: string } }>(
    '/:orgId',
    async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId } = request.params;

      // Ensure user can only access their own org's audit logs
      if (orgId !== userOrgId) {
        return reply.code(403).send({ error: 'Forbidden: cannot access audit logs for another organization' });
      }

      const query = querySchema.parse(request.query);

      return auditLogger.query({
        orgId,
        page: query.page,
        limit: query.limit,
        action: query.action,
        resource: query.resource,
        userId: query.userId,
        from: query.from,
        to: query.to,
      });
    },
  );

  // ── Export Audit Logs ──────────────────────────────────

  app.get<{ Params: { orgId: string } }>(
    '/:orgId/export',
    async (request, reply) => {
      const { orgId: userOrgId } = request.user;
      const { orgId } = request.params;

      if (orgId !== userOrgId) {
        return reply.code(403).send({ error: 'Forbidden: cannot export audit logs for another organization' });
      }

      const { from, to, redact } = exportSchema.parse(request.query);

      const exportData = await auditLogger.exportLogs(orgId, from, to);

      // Redact PII from export if requested
      if (redact === 'true') {
        exportData.records = exportData.records.map((record) =>
          sanitizeForExport(record as Record<string, unknown>, 'phi'),
        );
      }

      // Set headers for download
      reply.header('Content-Type', 'application/json');
      reply.header(
        'Content-Disposition',
        `attachment; filename="audit-log-${orgId}-${new Date().toISOString().split('T')[0]}.json"`,
      );

      return exportData;
    },
  );
}
