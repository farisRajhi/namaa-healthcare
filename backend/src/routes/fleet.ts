import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditLoggerService } from '../services/security/auditLogger.js';

// ────────────────────────────────────────────────────────
// Fleet Management Routes
// Section 18 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

const facilityConfigSchema = z.object({
  greetingEn: z.string().optional(),
  greetingAr: z.string().optional(),
  businessHours: z.record(
    z.object({
      open: z.string(),
      close: z.string(),
    }),
  ).optional(),
  languages: z.array(z.string()).optional(),
  aiEnabled: z.boolean().optional(),
  maxWaitSec: z.number().int().min(5).max(300).optional(),
  afterHoursMsg: z.string().optional(),
  customFaqs: z.any().optional(),
});

const bulkUpdateSchema = z.object({
  facilityIds: z.array(z.string().uuid()),
  config: facilityConfigSchema,
});

export default async function fleetRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const auditLogger = new AuditLoggerService(app.prisma);

  // ── Fleet Overview ─────────────────────────────────────

  app.get('/overview', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const facilities = await app.prisma.facility.findMany({
      where: { orgId },
      select: {
        facilityId: true,
        name: true,
        city: true,
        region: true,
      },
    });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const results = await Promise.all(
      facilities.map(async (fac) => {
        const [config, todayAppointments, todayCalls, activeConversations] = await Promise.all([
          app.prisma.facilityConfig.findUnique({
            where: { facilityId: fac.facilityId },
          }),
          app.prisma.appointment.count({
            where: {
              orgId,
              facilityId: fac.facilityId,
              startTs: { gte: startOfToday },
              status: { in: ['booked', 'confirmed', 'completed'] },
            },
          }),
          // Count calls today for this facility (via appointments at this facility)
          app.prisma.voiceCall.count({
            where: {
              orgId,
              startedAt: { gte: startOfToday },
            },
          }),
          app.prisma.conversation.count({
            where: {
              orgId,
              status: 'active',
            },
          }),
        ]);

        return {
          facilityId: fac.facilityId,
          name: fac.name,
          city: fac.city,
          region: fac.region,
          aiEnabled: config?.aiEnabled ?? true,
          languages: config?.languages ?? ['ar', 'en'],
          todayAppointments,
          todayCalls,
          activeConversations,
          hasConfig: !!config,
        };
      }),
    );

    return { facilities: results };
  });

  // ── Bulk Update Config ─────────────────────────────────

  app.post('/bulk-update', async (request: FastifyRequest) => {
    const { orgId, userId } = request.user;
    const { facilityIds, config } = bulkUpdateSchema.parse(request.body);

    // Verify all facilities belong to this org
    const facilities = await app.prisma.facility.findMany({
      where: { orgId, facilityId: { in: facilityIds } },
      select: { facilityId: true },
    });

    const validIds = new Set(facilities.map((f) => f.facilityId));
    const invalidIds = facilityIds.filter((id) => !validIds.has(id));

    if (invalidIds.length > 0) {
      return {
        error: 'Some facilities do not belong to this organization',
        invalidIds,
      };
    }

    // Build the update data from provided config fields
    const updateData: Record<string, unknown> = {};
    if (config.greetingEn !== undefined) updateData.greetingEn = config.greetingEn;
    if (config.greetingAr !== undefined) updateData.greetingAr = config.greetingAr;
    if (config.businessHours !== undefined) updateData.businessHours = config.businessHours;
    if (config.languages !== undefined) updateData.languages = config.languages;
    if (config.aiEnabled !== undefined) updateData.aiEnabled = config.aiEnabled;
    if (config.maxWaitSec !== undefined) updateData.maxWaitSec = config.maxWaitSec;
    if (config.afterHoursMsg !== undefined) updateData.afterHoursMsg = config.afterHoursMsg;
    if (config.customFaqs !== undefined) updateData.customFaqs = config.customFaqs;

    const results: { facilityId: string; status: string }[] = [];

    for (const facilityId of facilityIds) {
      const existing = await app.prisma.facilityConfig.findUnique({
        where: { facilityId },
      });

      if (existing) {
        await app.prisma.facilityConfig.update({
          where: { facilityId },
          data: updateData as any,
        });
      } else {
        await app.prisma.facilityConfig.create({
          data: {
            facilityId,
            ...updateData,
          } as any,
        });
      }

      results.push({ facilityId, status: 'updated' });

      // Audit log
      await auditLogger.log({
        orgId,
        userId,
        action: 'config.bulk_changed',
        resource: 'facility_config',
        resourceId: facilityId,
        details: { updatedFields: Object.keys(updateData) },
      });
    }

    return { updated: results.length, results };
  });

  // ── System Health ──────────────────────────────────────

  app.get('/health', async (request: FastifyRequest) => {
    const { orgId } = request.user;

    const facilities = await app.prisma.facility.findMany({
      where: { orgId },
      select: { facilityId: true, name: true },
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const healthChecks = await Promise.all(
      facilities.map(async (fac) => {
        const [config, recentCalls, failedCalls, recentScores] = await Promise.all([
          app.prisma.facilityConfig.findUnique({
            where: { facilityId: fac.facilityId },
          }),
          app.prisma.voiceCall.count({
            where: {
              orgId,
              startedAt: { gte: oneHourAgo },
            },
          }),
          app.prisma.voiceCall.count({
            where: {
              orgId,
              startedAt: { gte: oneDayAgo },
              status: 'failed',
            },
          }),
          app.prisma.callQualityScore.findMany({
            where: {
              analyzedAt: { gte: oneDayAgo },
              flagged: true,
            },
            select: { overallScore: true },
            take: 100,
          }),
        ]);

        // Health status determination
        let status: 'healthy' | 'degraded' | 'down' = 'healthy';
        const issues: string[] = [];

        if (!config?.aiEnabled) {
          status = 'down';
          issues.push('AI is disabled for this facility');
        }

        if (failedCalls > 5) {
          status = status === 'down' ? 'down' : 'degraded';
          issues.push(`${failedCalls} failed calls in last 24h`);
        }

        const avgScore = recentScores.length
          ? recentScores.reduce((a, s) => a + s.overallScore, 0) / recentScores.length
          : null;

        if (avgScore !== null && avgScore < 60) {
          status = status === 'down' ? 'down' : 'degraded';
          issues.push(`Average quality score is ${Math.round(avgScore)} (below 60)`);
        }

        return {
          facilityId: fac.facilityId,
          facilityName: fac.name,
          status,
          aiEnabled: config?.aiEnabled ?? true,
          recentCallsLastHour: recentCalls,
          failedCallsLast24h: failedCalls,
          avgQualityScore24h: avgScore ? Math.round(avgScore) : null,
          flaggedCalls24h: recentScores.length,
          issues,
        };
      }),
    );

    const overallStatus = healthChecks.some((h) => h.status === 'down')
      ? 'down'
      : healthChecks.some((h) => h.status === 'degraded')
        ? 'degraded'
        : 'healthy';

    return {
      overallStatus,
      facilities: healthChecks,
      checkedAt: now.toISOString(),
    };
  });

  // ── Get Facility Config ────────────────────────────────

  app.get<{ Params: { facilityId: string } }>(
    '/config/:facilityId',
    async (request) => {
      const { orgId } = request.user;
      const { facilityId } = request.params;

      // Verify facility belongs to org
      const facility = await app.prisma.facility.findFirst({
        where: { facilityId, orgId },
        select: { facilityId: true, name: true },
      });

      if (!facility) {
        return { error: 'Facility not found' };
      }

      const config = await app.prisma.facilityConfig.findUnique({
        where: { facilityId },
      });

      return {
        facility,
        config: config || {
          facilityId,
          greetingEn: null,
          greetingAr: null,
          businessHours: null,
          languages: ['ar', 'en'],
          aiEnabled: true,
          maxWaitSec: 30,
          afterHoursMsg: null,
          customFaqs: null,
        },
      };
    },
  );

  // ── Update Facility Config ─────────────────────────────

  app.put<{ Params: { facilityId: string } }>(
    '/config/:facilityId',
    async (request) => {
      const { orgId, userId } = request.user;
      const { facilityId } = request.params;
      const config = facilityConfigSchema.parse(request.body);

      // Verify facility belongs to org
      const facility = await app.prisma.facility.findFirst({
        where: { facilityId, orgId },
      });

      if (!facility) {
        return { error: 'Facility not found' };
      }

      // Get existing config for audit trail
      const existing = await app.prisma.facilityConfig.findUnique({
        where: { facilityId },
      });

      const updateData: Record<string, unknown> = {};
      if (config.greetingEn !== undefined) updateData.greetingEn = config.greetingEn;
      if (config.greetingAr !== undefined) updateData.greetingAr = config.greetingAr;
      if (config.businessHours !== undefined) updateData.businessHours = config.businessHours;
      if (config.languages !== undefined) updateData.languages = config.languages;
      if (config.aiEnabled !== undefined) updateData.aiEnabled = config.aiEnabled;
      if (config.maxWaitSec !== undefined) updateData.maxWaitSec = config.maxWaitSec;
      if (config.afterHoursMsg !== undefined) updateData.afterHoursMsg = config.afterHoursMsg;
      if (config.customFaqs !== undefined) updateData.customFaqs = config.customFaqs;

      let result;
      if (existing) {
        result = await app.prisma.facilityConfig.update({
          where: { facilityId },
          data: updateData as any,
        });

        // Audit: log changes with before/after
        await auditLogger.logConfigChange(
          orgId,
          userId,
          'facility_config',
          facilityId,
          existing as unknown as Record<string, unknown>,
          { ...existing, ...updateData } as unknown as Record<string, unknown>,
        );
      } else {
        result = await app.prisma.facilityConfig.create({
          data: {
            facilityId,
            ...updateData,
          } as any,
        });

        await auditLogger.log({
          orgId,
          userId,
          action: 'config.created',
          resource: 'facility_config',
          resourceId: facilityId,
          details: { config: updateData },
        });
      }

      return result;
    },
  );
}
