import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ────────────────────────────────────────────────────────
// Enhanced Analytics Routes (post voice-removal)
// Voice-call analytics have been retired. The endpoints below remain
// registered for backwards compatibility with the frontend, but return
// empty/zero values where the underlying data was voice-call based.
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

// ── Empty payload helpers ────────────────────────────────────────────────

function emptyOverview() {
  return {
    totalCalls: 0,
    totalConversations: 0,
    aiResolved: 0,
    aiResolvedPct: 0,
    humanEscalated: 0,
    humanEscalatedPct: 0,
    avgCallDurationSec: 0,
    appointmentsBooked: 0,
    conversionRate: 0,
    topCallDrivers: [] as { reason: string; count: number; pct: number }[],
  };
}

function emptyCallDriversData() {
  return {
    breakdown: [] as unknown[],
    trending: [] as unknown[],
    gaps: [] as unknown[],
    recommendations: [] as unknown[],
  };
}

function emptyContainmentData() {
  return {
    containmentRate: 0,
    totalConversations: 0,
    aiResolved: 0,
    humanEscalated: 0,
    humanEscalatedPct: 0,
    topCallDrivers: [] as { reason: string; count: number; pct: number }[],
  };
}

function emptySatisfactionData() {
  return {
    averageRating: 0,
    totalSurveys: 0,
    npsScore: 0,
    responseRate: 0,
    trends: [] as unknown[],
  };
}

function emptyQualityOverview() {
  return {
    avgOverall: 0,
    avgAccuracy: 0,
    avgTone: 0,
    avgResolution: 0,
    avgCompliance: 0,
    flaggedCount: 0,
    totalAnalyzed: 0,
  };
}

async function getPredictiveData(app: FastifyInstance, orgId: string) {
  // Voice-call volume removed; appointment trends derived from native data.
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentAppointments = await app.prisma.appointment.count({
    where: { orgId, startTs: { gte: thirtyDaysAgo } },
  });

  const avgDailyAppointments = Math.round(recentAppointments / 30);

  return {
    predictedCallVolume: {
      nextDay: 0,
      nextWeek: 0,
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

async function getBenchmarksData(_app: FastifyInstance, _orgId: string) {
  // Voice-call metrics retired; return zeros against industry benchmarks.
  return {
    yourMetrics: {
      callVolume: 0,
      completionRate: 0,
      avgCallDurationSec: 0,
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

  const healthChecks = await Promise.all(
    facilities.map(async (fac) => {
      const config = await app.prisma.facilityConfig.findUnique({
        where: { facilityId: fac.facilityId },
      });

      let status: 'healthy' | 'degraded' | 'down' = 'healthy';
      const issues: string[] = [];
      if (!config?.aiEnabled) { status = 'down'; issues.push('AI is disabled'); }

      return {
        facilityId: fac.facilityId,
        facilityName: fac.name,
        status,
        aiEnabled: config?.aiEnabled ?? true,
        failedCallsLast24h: 0,
        issues,
      };
    }),
  );

  const hasDown = healthChecks.some((h) => h.status === 'down');
  const overallStatus: 'healthy' | 'degraded' | 'down' = hasDown ? 'down' : 'healthy';

  return { overallStatus, facilities: healthChecks, checkedAt: now.toISOString() };
}

// ── Route Registration ────────────────────────────────────────────────────────

export default async function analyticsEnhancedRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireSubscription);
  // Conversational intelligence, quality scores, and call-driver analysis are
  // Professional-tier features. Matches frontend planFeatures.ts (reports).
  app.addHook('preHandler', app.requirePlan('professional'));

  // ════════════════════════════════════════════════════════════════════════
  // Org-scoped routes: GET /api/analytics-v2/:orgId/<endpoint>
  // ════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { orgId: string } }>('/:orgId/call-drivers', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    dateRangeSchema.parse(request.query);
    return emptyCallDriversData();
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/containment', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    dateRangeSchema.parse(request.query);
    return emptyContainmentData();
  });

  app.get<{ Params: { orgId: string } }>('/:orgId/satisfaction', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    dateRangeSchema.parse(request.query);
    return emptySatisfactionData();
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
    dateRangeSchema.parse(request.query);
    return { overview: emptyQualityOverview(), trend: [] as unknown[] };
  });

  // Fleet endpoints aggregate across multiple facilities/branches — Enterprise only.
  app.get<{ Params: { orgId: string } }>(
    '/:orgId/fleet',
    { preHandler: app.requirePlan('enterprise') },
    async (request, reply) => {
      const { orgId } = request.user;
      if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
      return getFleetData(app, orgId);
    },
  );

  app.get<{ Params: { orgId: string } }>(
    '/:orgId/fleet/health',
    { preHandler: app.requirePlan('enterprise') },
    async (request, reply) => {
      const { orgId } = request.user;
      if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
      return getFleetHealthData(app, orgId);
    },
  );

  app.post<{ Params: { orgId: string } }>('/:orgId/export', async (request, reply) => {
    const { orgId } = request.user;
    if (request.params.orgId !== orgId) return reply.code(403).send({ error: 'Forbidden' });
    const body = exportSchema.parse(request.body);

    return {
      exportedAt: new Date().toISOString(),
      orgId,
      format: body.format,
      data: {
        overview: emptyOverview(),
        callDrivers: emptyCallDriversData(),
        quality: emptyQualityOverview(),
      },
    };
  });

  // ════════════════════════════════════════════════════════════════════════
  // Original routes (no orgId in path — uses JWT orgId)
  // ════════════════════════════════════════════════════════════════════════

  app.get('/overview', async (request: FastifyRequest) => {
    dateRangeSchema.parse(request.query);
    return emptyOverview();
  });

  app.get('/trends', async (request: FastifyRequest) => {
    trendSchema.parse(request.query);
    return [] as unknown[];
  });

  app.get('/knowledge-gaps', async (request: FastifyRequest) => {
    dateRangeSchema.parse(request.query);
    paginationSchema.parse(request.query);
    return [] as unknown[];
  });

  app.get('/call-drivers', async (request: FastifyRequest) => {
    dateRangeSchema.parse(request.query);
    return emptyCallDriversData();
  });

  app.get('/patient-journey', async (request: FastifyRequest) => {
    dateRangeSchema.parse(request.query);
    return {
      totalInbound: 0,
      identified: 0,
      intentDetected: 0,
      resolved: 0,
      appointmentBooked: 0,
    };
  });

  app.get<{ Params: { facilityId: string } }>(
    '/facility/:facilityId',
    async (request) => {
      dateRangeSchema.parse(request.query);
      return { error: 'Facility not found or no data available' };
    },
  );

  app.get('/revenue-impact', async (request: FastifyRequest) => {
    const { avgVisitValue } = revenueSchema.parse(request.query);
    return {
      appointmentsBooked: 0,
      avgVisitValue,
      estimatedRevenue: 0,
      periodLabel: '',
    };
  });

  app.get('/quality', async (request: FastifyRequest) => {
    dateRangeSchema.parse(request.query);
    return { overview: emptyQualityOverview(), trend: [] as unknown[] };
  });

  app.get('/quality/trend', async (request: FastifyRequest) => {
    qualityTrendSchema.parse(request.query);
    return [] as unknown[];
  });

  app.get<{ Params: { callId: string } }>(
    '/quality/:callId',
    async () => {
      return { error: 'Quality score not found for this call/conversation' };
    },
  );

  app.post('/quality/analyze', async () => {
    return { analyzed: 0, message: 'Voice-call quality analysis has been retired' };
  });

  // Cross-branch facility comparison — Enterprise only.
  app.get(
    '/facility-comparison',
    { preHandler: app.requirePlan('enterprise') },
    async (request: FastifyRequest) => {
      dateRangeSchema.parse(request.query);
      return [] as unknown[];
    },
  );
}
