import type { PrismaClient } from '@prisma/client';

export type SubscriptionLifecycleStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

interface ActivateParams {
  orgId: string;
  plan: string;
  tapChargeId: string;
  cardId?: string | null;
  customerId?: string | null;
  startsAt?: Date;
  monthsToAdd?: number;
}

/**
 * Idempotently start or extend a subscription. One row per org (TawafudSubscription.orgId is @unique).
 *
 * - First-time activation: creates a new sub starting now, ending in `monthsToAdd` (default 1).
 * - Existing sub: extends `endDate` from the later of (now, current endDate), resets failure counters,
 *   updates plan/card refs.
 */
export async function activateOrExtendSubscription(
  prisma: PrismaClient,
  { orgId, plan, tapChargeId, cardId, customerId, startsAt, monthsToAdd = 1 }: ActivateParams,
) {
  const now = startsAt ?? new Date();
  const existing = await prisma.tawafudSubscription.findUnique({ where: { orgId } });

  // Anchor for the new endDate: extend from current endDate if still in the future, otherwise from now.
  const baseDate = existing && existing.endDate > now ? existing.endDate : now;
  const newEndDate = addMonths(baseDate, monthsToAdd);

  const data = {
    plan,
    status: 'active' as SubscriptionLifecycleStatus,
    tapChargeId,
    cardId: cardId ?? existing?.cardId ?? null,
    customerId: customerId ?? existing?.customerId ?? null,
    cancelledAt: null,
    pastDueAt: null,
    nextChargeAttemptAt: null,
    failedAttempts: 0,
    endDate: newEndDate,
    updatedAt: now,
  };

  if (existing) {
    return prisma.tawafudSubscription.update({
      where: { orgId },
      data,
    });
  }
  return prisma.tawafudSubscription.create({
    data: {
      orgId,
      startDate: now,
      ...data,
    },
  });
}

/**
 * Mark a subscription as cancelled. Access continues until endDate (no proration / no immediate cutoff).
 */
export async function cancelSubscription(
  prisma: PrismaClient,
  orgId: string,
) {
  const existing = await prisma.tawafudSubscription.findUnique({ where: { orgId } });
  if (!existing) return null;
  if (existing.status === 'cancelled') return existing;

  return prisma.tawafudSubscription.update({
    where: { orgId },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      nextChargeAttemptAt: null,
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark a subscription as past_due — used by dunning when a renewal charge fails.
 */
export async function markPastDue(
  prisma: PrismaClient,
  orgId: string,
  nextAttemptAt: Date,
) {
  return prisma.tawafudSubscription.update({
    where: { orgId },
    data: {
      status: 'past_due',
      pastDueAt: new Date(),
      nextChargeAttemptAt: nextAttemptAt,
      failedAttempts: { increment: 1 },
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark a subscription as expired — used when retries are exhausted or a cancelled sub passes endDate.
 */
export async function expireSubscription(prisma: PrismaClient, orgId: string) {
  return prisma.tawafudSubscription.update({
    where: { orgId },
    data: {
      status: 'expired',
      nextChargeAttemptAt: null,
      updatedAt: new Date(),
    },
  });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle Jan 31 + 1 month → not Mar 3, but Feb 28/29.
  if (d.getDate() < day) d.setDate(0);
  return d;
}
