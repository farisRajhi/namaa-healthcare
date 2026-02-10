import { PrismaClient } from '@prisma/client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ────────────────────────────────────────────────────────
// Audit Logger — Trail for every sensitive data access
// Section 21 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

export interface AuditEntry {
  orgId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditQueryOptions {
  orgId: string;
  page?: number;
  limit?: number;
  action?: string;
  resource?: string;
  userId?: string;
  from?: string;
  to?: string;
}

// ── Sensitive route patterns ────────────────────────────

const SENSITIVE_PATTERNS: {
  method: string;
  pathPattern: RegExp;
  action: string;
  resource: string;
}[] = [
  // Patient data access
  { method: 'GET', pathPattern: /^\/api\/patients\/[^/]+$/, action: 'patient.viewed', resource: 'patient' },
  { method: 'POST', pathPattern: /^\/api\/patients\/?$/, action: 'patient.created', resource: 'patient' },
  { method: 'PUT', pathPattern: /^\/api\/patients\/[^/]+$/, action: 'patient.updated', resource: 'patient' },
  { method: 'DELETE', pathPattern: /^\/api\/patients\/[^/]+$/, action: 'patient.deleted', resource: 'patient' },

  // Appointment access
  { method: 'GET', pathPattern: /^\/api\/appointments\/[^/]+$/, action: 'appointment.viewed', resource: 'appointment' },
  { method: 'POST', pathPattern: /^\/api\/appointments\/?$/, action: 'appointment.created', resource: 'appointment' },
  { method: 'PUT', pathPattern: /^\/api\/appointments\/[^/]+/, action: 'appointment.updated', resource: 'appointment' },
  { method: 'DELETE', pathPattern: /^\/api\/appointments\/[^/]+$/, action: 'appointment.deleted', resource: 'appointment' },

  // Conversation access
  { method: 'GET', pathPattern: /^\/api\/chat\/conversations\/[^/]+/, action: 'conversation.viewed', resource: 'conversation' },

  // Analytics
  { method: 'GET', pathPattern: /^\/api\/analytics\//, action: 'analytics.viewed', resource: 'analytics' },

  // Fleet / config changes
  { method: 'PUT', pathPattern: /^\/api\/fleet\/config\//, action: 'config.changed', resource: 'facility_config' },
  { method: 'POST', pathPattern: /^\/api\/fleet\/bulk-update/, action: 'config.bulk_changed', resource: 'facility_config' },

  // Audit log access (meta-audit!)
  { method: 'GET', pathPattern: /^\/api\/audit\//, action: 'audit.viewed', resource: 'audit_log' },
  { method: 'GET', pathPattern: /^\/api\/audit\/[^/]+\/export/, action: 'audit.exported', resource: 'audit_log' },

  // Quality scores
  { method: 'GET', pathPattern: /^\/api\/analytics\/quality/, action: 'quality.viewed', resource: 'call_quality' },
];

// ── Audit Logger Service ────────────────────────────────

export class AuditLoggerService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Record a single audit log entry.
   */
  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        orgId: entry.orgId,
        userId: entry.userId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        details: (entry.details as any) ?? undefined,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  /**
   * Record a configuration change with before/after values.
   */
  async logConfigChange(
    orgId: string,
    userId: string,
    resource: string,
    resourceId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<void> {
    // Compute diff
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }

    if (Object.keys(changes).length === 0) return; // No actual changes

    await this.log({
      orgId,
      userId,
      action: 'config.changed',
      resource,
      resourceId,
      details: { changes },
      ipAddress,
    });
  }

  /**
   * Query audit logs with filters and pagination.
   */
  async query(options: AuditQueryOptions) {
    const {
      orgId,
      page = 1,
      limit = 50,
      action,
      resource,
      userId,
      from,
      to,
    } = options;

    const where: Record<string, unknown> = { orgId };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (resource) where.resource = resource;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where: where as any }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Export audit logs as JSON (for compliance reporting).
   * Returns all logs in the period — no pagination.
   */
  async exportLogs(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<{
    exportedAt: string;
    orgId: string;
    totalRecords: number;
    records: unknown[];
  }> {
    const where: Record<string, unknown> = { orgId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const logs = await this.prisma.auditLog.findMany({
      where: where as any,
      orderBy: { createdAt: 'asc' },
      take: 10000, // Hard cap to prevent OOM
    });

    return {
      exportedAt: new Date().toISOString(),
      orgId,
      totalRecords: logs.length,
      records: logs,
    };
  }
}

// ── Fastify Middleware ───────────────────────────────────

/**
 * Extract client IP from request.
 */
function getClientIP(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip;
}

/**
 * Extract resource ID from URL path.
 * e.g., /api/patients/abc-123 → abc-123
 */
function extractResourceId(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  // UUID pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (uuidPattern.test(segments[i])) return segments[i];
  }
  return undefined;
}

/**
 * Register audit logging middleware on the Fastify instance.
 * Automatically logs sensitive route access after the response is sent.
 */
export function registerAuditMiddleware(app: FastifyInstance): void {
  const auditLogger = new AuditLoggerService(app.prisma);

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only audit authenticated requests
    if (!request.user) return;

    // Only audit successful responses
    if (reply.statusCode >= 400) return;

    const method = request.method;
    const path = request.url.split('?')[0]; // Strip query params

    for (const pattern of SENSITIVE_PATTERNS) {
      if (method === pattern.method && pattern.pathPattern.test(path)) {
        const resourceId = extractResourceId(path);

        // Fire and forget — don't block the response
        auditLogger
          .log({
            orgId: request.user.orgId,
            userId: request.user.userId,
            action: pattern.action,
            resource: pattern.resource,
            resourceId,
            details: {
              method,
              path,
              statusCode: reply.statusCode,
            },
            ipAddress: getClientIP(request),
          })
          .catch((err) => {
            // Log but don't crash — audit is important but not worth 500s
            request.log.error({ err }, 'Failed to write audit log');
          });

        break; // Only match first pattern
      }
    }
  });
}
