import { FastifyInstance, FastifyRequest } from 'fastify';
import { monthlyRevenueFromSubscriptions } from '../services/billing/plans.js';

interface MetricsPayload {
  totals: {
    orgs: number;
    orgsByStatus: Record<string, number>;
    patients: number;
    appointments: number;
    smsMessages: number;
    activeSubscriptions: number;
  };
  mrr: {
    sar: number;
  };
  subscriptionsByPlan: Record<string, number>;
  signups: {
    last7d: number;
    last30d: number;
    last90d: number;
    last30dDaily: { date: string; count: number }[];
  };
  generatedAt: string;
}

interface MetricsCacheEntry {
  cache: { at: number; value: MetricsPayload } | null;
  inflight: Promise<MetricsPayload> | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    platformMetricsCache: MetricsCacheEntry;
  }
}

const CACHE_TTL_MS = 60_000;

async function computeMetrics(app: FastifyInstance): Promise<MetricsPayload> {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const d7 = new Date(now.getTime() - 7 * day);
  const d30 = new Date(now.getTime() - 30 * day);
  const d90 = new Date(now.getTime() - 90 * day);

  const [totalOrgs, orgsGrouped, patientCount, appointmentCount, smsCount, activeSubs, recentOrgs] = await Promise.all([
    app.prisma.org.count(),
    app.prisma.org.groupBy({ by: ['status'], _count: { _all: true } }),
    app.prisma.patient.count(),
    app.prisma.appointment.count(),
    app.prisma.smsLog.count(),
    app.prisma.tawafudSubscription.findMany({
      where: { status: 'active', endDate: { gte: now } },
      select: { plan: true },
    }),
    app.prisma.org.findMany({
      where: { createdAt: { gte: d90 } },
      select: { createdAt: true },
    }),
  ]);

  const orgsByStatus: Record<string, number> = {};
  for (const row of orgsGrouped) {
    orgsByStatus[row.status] = row._count._all;
  }

  const subscriptionsByPlan: Record<string, number> = {};
  for (const s of activeSubs) {
    const key = s.plan ?? 'unknown';
    subscriptionsByPlan[key] = (subscriptionsByPlan[key] ?? 0) + 1;
  }

  let last7d = 0;
  let last30d = 0;
  const last90d = recentOrgs.length;
  const daily = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * day);
    const key = d.toISOString().slice(0, 10);
    daily.set(key, 0);
  }
  for (const o of recentOrgs) {
    if (o.createdAt >= d7) last7d++;
    if (o.createdAt >= d30) {
      last30d++;
      const key = o.createdAt.toISOString().slice(0, 10);
      if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
    }
  }

  const last30dDaily = Array.from(daily.entries()).map(([date, count]) => ({ date, count }));

  return {
    totals: {
      orgs: totalOrgs,
      orgsByStatus,
      patients: patientCount,
      appointments: appointmentCount,
      smsMessages: smsCount,
      activeSubscriptions: activeSubs.length,
    },
    mrr: {
      sar: monthlyRevenueFromSubscriptions(activeSubs),
    },
    subscriptionsByPlan,
    signups: { last7d, last30d, last90d, last30dDaily },
    generatedAt: now.toISOString(),
  };
}

export default async function platformMetricsRoutes(app: FastifyInstance) {
  // Hold cache + inflight on the app instance so hot-reload doesn't strand
  // a stale promise in module scope, and so a thrown computeMetrics doesn't
  // poison the next request via leftover state.
  if (!app.hasDecorator('platformMetricsCache')) {
    app.decorate('platformMetricsCache', { cache: null, inflight: null } as MetricsCacheEntry);
  }

  app.get('/', {
    preHandler: [app.authenticatePlatform],
  }, async (_request: FastifyRequest) => {
    const store = app.platformMetricsCache;
    const now = Date.now();
    if (store.cache && now - store.cache.at < CACHE_TTL_MS) {
      return store.cache.value;
    }
    if (store.inflight) {
      return store.inflight;
    }
    store.inflight = computeMetrics(app)
      .then((value) => {
        store.cache = { at: Date.now(), value };
        return value;
      })
      .catch((err) => {
        store.cache = null;
        throw err;
      })
      .finally(() => {
        store.inflight = null;
      });
    return store.inflight;
  });
}
