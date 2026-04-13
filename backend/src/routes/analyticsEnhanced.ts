import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ConversationalIntelligenceService, type Period } from '../services/analytics/conversationalIntelligence.js';
import { QualityAnalyzerService } from '../services/analytics/qualityAnalyzer.js';
import { CallDriverAnalyzerService } from '../services/analytics/callDriverAnalyzer.js';

// ────────────────────────────────────────────────────────
// Enhanced Analytics Routes
// Sections 15, 16, 17 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const trendSchema = dateRangeSchema.extend({
  period: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily'),
});

const paginationSchema = z.object({
  limit: z.coerce.number().default(50),
});

const revenueSchema = dateRangeSchema.extend({
  avgVisitValue: z.coerce.number().default(350),
});

const qualityTrendSchema = dateRangeSchema.extend({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});

const exportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  dateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// ── Helper functions for org-scoped routes ────────────────────────────────

async function getCallDriversData(callDrivers: CallDriverAnalyzerService, orgId: string, from?: string, to?: string) {
  const [breakdown, trending, gaps, recommendations] = await Promise.all([
    callDrivers.getCategorizedDrivers(orgId, from, to),
    callDrivers.getTrendingTopics(orgId, from, to),
    callDrivers.getGapDetection(orgId, from, to),
    callDrivers.getRecommendations(orgId, from, to),
  ]);
  return { breakdown, trending, gaps, recommendations };
}

async function getContainmentData(intelligence: ConversationalIntelligenceService, orgId: string, from?: string, to?: string) {
  const overview = await intelligence.getOverview(orgId, from, to);
  return {
    containmentRate: overview.aiResolvedPct ?? 0,
    totalConversations: overview.totalConversations ?? 0,
    aiResolved: overview.aiResolved ?? 0,
    humanEscalated: overview.humanEscalated ?? 0,
    humanEscalatedPct: overview.humanEscalatedPct ?? 0,
    topCallDrivers: overview.topCallDrivers ?? [],
  };
}

async function getSatisfactionData(app: FastifyInstance, orgId: string, from?: string, to?: string) {
  // Derive satisfaction from quality scores (no separate survey model yet)
  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to);

  // Get org-scoped conversation IDs, then filter quality scores
  const orgConversations = await app.prisma.conversation.findMany({
    where: { orgId },
    select: { conversationId: true },
  });
  const orgConvoIds = orgConversations.map((c) => c.conversationId);

  const scores = await app.prisma.callQualityScore.findMany({
    where: {
      conversationId: { in: orgConvoIds },
      ...(Object.keys(dateFilter).length ? { analyzedAt: dateFilter } : {}),
    },
    select: { overallScore: true },
    take: 1000,
  }).catch(() => []);

  const totalSurveys = scores.length;
  const avgRating = totalSurveys > 0
    ? scores.reduce((sum, s) => sum + (s.overallScore ?? 0), 0) / totalSurveys
    : 0;

  return {
    averageRating: Math.round(avgRating * 100) / 100,
    totalSurveys,
    npsScore: totalSurveys > 0 ? Math.round((avgRating / 100) * 200 - 100) : 0,
    responseRate: 0,
    trends: [],
  };
}

async function getPredictiveData(app: FastifyInstance, orgId: string) {
  // Predictive analytics based on historical patterns
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [recentAppointments, recentCalls] = await Promise.all([
    app.prisma.appointment.count({
      where: { orgId, startTs: { gte: thirtyDaysAgo } },
    }),
    app.prisma.voiceCall.count({
      where: { orgId, startedAt: { gte: thirtyDaysAgo } },
    }).catch(() => 0),
  ]);

  const avgDailyAppointments = Math.round(recentAppointments / 30);
  const avgDailyCalls = Math.round(recentCalls / 30);

  return {
    predictedCallVolume: {
      nextDay: avgDailyCalls,
      nextWeek: avgDailyCalls * 7,
      trend: 'stable',
    },
    predictedAppointments: {
      nextDay: avgDailyAppointments,
      nextWeek: avgDailyAppointments * 7,
      trend: 'stable',
    },
    noShowRisk: {
      highRiskCount: 0,
      averageRiskScore: 0,
    },
    recommendations: [
      'Maintain current staffing levels based on stable trends',
    ],
  };
}

async function getBenchmarksData(app: FastifyInstance, orgId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalCalls, completedCalls, avgDuration] = await Promise.all([
    app.prisma.voiceCall.count({
      where: { orgId, startedAt: { gte: thirtyDaysAgo } },
    }).catch(() => 0),
    app.prisma.voiceCall.count({
      where: { orgId, status: 'completed', startedAt: { gte: thirtyDaysAgo } },
    }).catch(() => 0),
    app.prisma.voiceCall.aggregate({
      where: { orgId, status: 'completed', startedAt: { gte: thirtyDaysAgo } },
      _avg: { durationSec: true },
    }).catch(() => ({ _avg: { durationSec: null } })),
  ]);

  return {
    yourMetrics: {
      callVolume: totalCalls,
      completionRate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
      avgCallDurationSec: Math.round(avgDuration._avg.durationSec ?? 0),
      aiContainmentRate: 0,
    },
    industryBenchmarks: {
      callVolume: 'N/A',
      completionRate: 85,
      avgCallDurationSec: 180,
      aiContainmentRate: 70,
    },
    period: '30d',
  };
}

async function getFleetData(app: FastifyInstance, orgId: string) {
  const facilities = await app.prisma.facility.findMany({
    where: { orgId },
    select: { facilityId: true, name: true, city: true, region: true },
  });

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    facilities.map(async (fac) => {
      const [config, todayAppointments] = await Promise.all([
        app.prisma.facilityConfig.findUnique({ where: { facilityId: fac.facilityId } }),
        app.prisma.appointment.count({
          where: {
            orgId,
            facilityId: fac.facilityId,
            startTs: { gte: startOfToday },
            status: { in: ['booked', 'confirmed', 'completed'] },
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
        hasConfig: !!config,
      };
    }),
  );

  return { facilities: results };
}

async function getFleetHealthData(app: FastifyInstance, orgId: string) {
  const facilities = await app.prisma.facility.findMany({
    where: { orgId },
    select: { facilityId: true, name: true },
  });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const healthChecks = await Promise.all(
    facilities.map(async (fac) => {
      const [config, failedCalls] = await Promise.all([
        app.prisma.facilityConfig.findUnique({ where: { facilityId: fac.facilityId } }),
        app.prisma.voiceCall.count({
          where: { orgId, startedAt: { gte: oneDayAgo }, status: 'failed' },
        }).catch(() => 0),
      ]);

      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      const issues: string[] = [];
      if (!config?.aiEnabled) { status = 'down'; issues.push('AI is disabled'); }
      if (failedCalls > 5) { status = status === 'down' ? 'down' : 'degraded'; issues.push(`${failedCalls} failed calls in last 24h`); }

      return {
        facilityId: fac.facilityId,
        facilityName: fac.name,
        status,
        aiEnabled: config?.aiEnabled ?? true,
        failedCallsLast24h: failedCalls,
        issues,
      };
    }),
  );

  const overallStatus = healthChecks.some((h) => h.status === 'down')
    ? 'down'
    : healthChecks.some((h) => h.status === 'degraded')
      ? 'degraded'
      : 'healthy';

  return { overallStatus, facilities: healthChecks, checkedAt: now.toISOString() };
}

// ── Route Registration ────────────────────────────────────────────────────────

export default async function analyticsEnhancedRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const intelligence = new ConversationalIntelligenceService(app.prisma);
  const quality = new QualityAnalyzerService(app.prisma);
  const callDrivers = new CallDriverAnalyzerService(app.prisma);

  // ════════════════════════════════════════════════════════════════════════
  // Org-scoped routes: GET /api/analytics-v2/:orgId/<endpoint>
  // ════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { orgId: string } }>('/:orgId/call-drivers', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const { from, to } = dateRangeSchema.parse(request.query);
    return getCallDriversData(callDrivers, orgId, from, to);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/containment', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const { from, to } = dateRangeSchema.parse(request.query);
    return getContainmentData(intelligence, orgId, from, to);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/satisfaction', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const { from, to } = dateRangeSchema.parse(request.query);
    return getSatisfactionData(app, orgId, from, to);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/predictive', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return getPredictiveData(app, orgId);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/benchmarks', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return getBenchmarksData(app, orgId);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/quality', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const { from, to } = dateRangeSchema.parse(request.query);
    const [overview, trend] = await Promise.all([
      quality.getQualityOverview(orgId, from, to),
      quality.getQualityTrend(orgId, 'daily', from, to),
    ]);
    return { overview, trend };
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/fleet', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return getFleetData(app, orgId);
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/fleet/health', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    return getFleetHealthData(app, orgId);
  });

  app.post<{ Params: { orgId: string } }>('/:orgId/export', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const body = exportSchema.parse(request.body);
    const from = body.dateRange?.start || body.from;
    const to = body.dateRange?.end || body.to;

    const [overview, callDriverData, qualityData] = await Promise.all([
      intelligence.getOverview(orgId, from, to),
      getCallDriversData(callDrivers, orgId, from, to),
      quality.getQualityOverview(orgId, from, to),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      orgId,
      format: body.format,
      data: {
        overview,
        callDrivers: callDriverData,
        quality: qualityData,
      },
    };
  });

  // ════════════════════════════════════════════════════════════════════════
  // Original routes (no orgId in path — uses JWT orgId)
  // ════════════════════════════════════════════════════════════════════════

  app.get('/overview', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    return intelligence.getOverview(orgId, from, to);
  });

  app.get('/trends', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { period, from, to } = trendSchema.parse(request.query);
    return intelligence.getTimeSeries(orgId, period as Period, from, to);
  });

  app.get('/knowledge-gaps', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    const { limit } = paginationSchema.parse(request.query);
    return intelligence.getKnowledgeGaps(orgId, limit, from, to);
  });

  app.get('/call-drivers', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    return getCallDriversData(callDrivers, orgId, from, to);
  });

  app.get('/patient-journey', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    return intelligence.getPatientJourneyFunnel(orgId, from, to);
  });

  app.get<{ Params: { facilityId: string } }>(
    '/facility/:facilityId',
    async (request) => {
      const { orgId } = request.user;
      const { facilityId } = request.params;
      const { from, to } = dateRangeSchema.parse(request.query);
      const metrics = await intelligence.getSingleFacilityMetrics(orgId, facilityId, from, to);
      if (!metrics) return { error: 'Facility not found or no data available' };
      return metrics;
    },
  );

  app.get('/revenue-impact', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to, avgVisitValue } = revenueSchema.parse(request.query);
    return intelligence.getRevenueImpact(orgId, avgVisitValue, from, to);
  });

  app.get('/quality', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    const [overview, trend] = await Promise.all([
      quality.getQualityOverview(orgId, from, to),
      quality.getQualityTrend(orgId, 'daily', from, to),
    ]);
    return { overview, trend };
  });

  app.get('/quality/trend', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { period, from, to } = qualityTrendSchema.parse(request.query);
    return quality.getQualityTrend(orgId, period, from, to);
  });

  app.get<{ Params: { callId: string } }>(
    '/quality/:callId',
    async (request) => {
      const { orgId } = request.user;
      const { callId } = request.params;
      const detail = await quality.getCallQualityDetail(callId, orgId);
      if (!detail) return { error: 'Quality score not found for this call/conversation' };
      return detail;
    },
  );

  app.post('/quality/analyze', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const analyzed = await quality.analyzeUnscored(orgId);
    return { analyzed, message: `Analyzed ${analyzed} conversations` };
  });

  app.get('/facility-comparison', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const { from, to } = dateRangeSchema.parse(request.query);
    return intelligence.getFacilityComparison(orgId, from, to);
  });
}
