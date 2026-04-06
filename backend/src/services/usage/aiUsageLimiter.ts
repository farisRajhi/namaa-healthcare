import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────
// AI Usage Limiter — Monthly response cap per organization
// ─────────────────────────────────────────────────────────

const MONTHLY_LIMIT = 5_000;

export interface UsageCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

export const AI_LIMIT_ERROR = {
  ar: 'تم تجاوز الحد الشهري للردود الذكية (5,000). يرجى الترقية أو الانتظار حتى الشهر القادم.',
  en: 'Monthly AI response limit (5,000) exceeded. Please upgrade or wait until next month.',
};

/**
 * Check if the org still has quota, and atomically increment if allowed.
 * Uses upsert + increment for safe concurrent access.
 */
export async function checkAndIncrement(
  prisma: PrismaClient,
  orgId: string,
): Promise<UsageCheckResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // First check current count (fast read)
  const existing = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });

  if (existing && existing.responseCount >= MONTHLY_LIMIT) {
    return {
      allowed: false,
      current: existing.responseCount,
      limit: MONTHLY_LIMIT,
      remaining: 0,
    };
  }

  // Atomically increment (upsert handles first-of-month creation)
  const counter = await prisma.aiUsageCounter.upsert({
    where: { orgId_year_month: { orgId, year, month } },
    update: { responseCount: { increment: 1 } },
    create: { orgId, year, month, responseCount: 1 },
  });

  // Edge case: concurrent requests could push past the limit
  // Accept the slight over-count rather than adding a transaction lock
  const allowed = counter.responseCount <= MONTHLY_LIMIT;

  return {
    allowed,
    current: counter.responseCount,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - counter.responseCount),
  };
}

/**
 * Read-only usage query for dashboard display.
 */
export async function getUsage(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ current: number; limit: number; remaining: number; year: number; month: number }> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const counter = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });

  const current = counter?.responseCount ?? 0;

  return {
    current,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - current),
    year,
    month,
  };
}
