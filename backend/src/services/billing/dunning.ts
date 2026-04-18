import type { PrismaClient } from '@prisma/client';
import {
  chargeSavedCard,
  retrieveCharge,
  mapStatus,
  halalasToDecimal,
  extractCardSnapshot,
} from '../tap.js';
import { PLAN_PRICES, isPlanKey } from './plans.js';
import {
  activateOrExtendSubscription,
  expireSubscription,
  markPastDue,
} from './subscriptions.js';

interface DunningSummary {
  scanned: number;
  renewed: number;
  pastDue: number;
  expired: number;
  errors: number;
}

const RENEWAL_LEAD_DAYS = 3;        // start trying to renew this many days before endDate
const MAX_FAILED_ATTEMPTS = 3;      // after N failures total → past_due → eventually expire
const RETRY_BACKOFF_DAYS = [1, 2, 3]; // days between retries (compounded with failedAttempts)
const GRACE_DAYS_AFTER_END = 7;     // hard expire if endDate + grace has passed

export async function runDunning(prisma: PrismaClient): Promise<DunningSummary> {
  const summary: DunningSummary = { scanned: 0, renewed: 0, pastDue: 0, expired: 0, errors: 0 };
  const now = new Date();
  const renewalCutoff = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);
  const hardExpireCutoff = new Date(now.getTime() - GRACE_DAYS_AFTER_END * 24 * 60 * 60 * 1000);

  // 1. Hard-expire cancelled subscriptions whose endDate has passed.
  const cancelledExpired = await prisma.tawafudSubscription.updateMany({
    where: {
      status: 'cancelled',
      endDate: { lt: now },
    },
    data: { status: 'expired', updatedAt: now },
  });
  summary.expired += cancelledExpired.count;

  // 2. Hard-expire active/past_due subs that ran past the grace window without recovering.
  const longExpired = await prisma.tawafudSubscription.updateMany({
    where: {
      status: { in: ['active', 'past_due'] },
      endDate: { lt: hardExpireCutoff },
    },
    data: { status: 'expired', nextChargeAttemptAt: null, updatedAt: now },
  });
  summary.expired += longExpired.count;

  // 3. Find candidates: active + past_due subs whose endDate is within the renewal window.
  const candidates = await prisma.tawafudSubscription.findMany({
    where: {
      status: { in: ['active', 'past_due'] },
      endDate: { lte: renewalCutoff },
      OR: [
        { nextChargeAttemptAt: null },
        { nextChargeAttemptAt: { lte: now } },
      ],
    },
    take: 500,
  });

  summary.scanned = candidates.length;

  for (const sub of candidates) {
    try {
      // Skip if no saved card — these will hard-expire when grace runs out.
      const cardId = (sub as any).cardId as string | null;
      const customerId = (sub as any).customerId as string | null;
      if (!cardId || !customerId) {
        // Stretch out the next attempt so we don't keep scanning these every run.
        await prisma.tawafudSubscription.update({
          where: { orgId: sub.orgId },
          data: { nextChargeAttemptAt: addDays(now, 1) },
        });
        continue;
      }

      if (!isPlanKey(sub.plan)) {
        summary.errors++;
        continue;
      }

      const amountHalalas = PLAN_PRICES[sub.plan];
      const amount = halalasToDecimal(amountHalalas, 'SAR');
      const webhookUrl = `${process.env.BASE_URL || process.env.BACKEND_URL || 'http://localhost:3003'}/api/payments/webhook`;
      // Idempotency key includes endDate timestamp so each renewal cycle is its own attempt.
      const idempotencyKey = `renew-${sub.orgId}-${sub.endDate.getTime()}-${(sub as any).failedAttempts ?? 0}`;

      const charge = await chargeSavedCard({
        customerId,
        cardId,
        amount,
        currency: 'SAR',
        description: `Tawafud ${sub.plan} renewal`,
        webhookUrl,
        metadata: { orgId: sub.orgId, plan: sub.plan, kind: 'renewal' },
        idempotencyKey,
      });

      // Snapshot may include refreshed card details.
      let snapshot = extractCardSnapshot(charge);
      // Tap may need a follow-up retrieve to get final state if charge is async.
      let finalStatus = (charge.status || '').toUpperCase();
      if (finalStatus !== 'CAPTURED' && finalStatus !== 'FAILED' && finalStatus !== 'DECLINED') {
        try {
          const fresh = await retrieveCharge(charge.id);
          finalStatus = (fresh.status || '').toUpperCase();
          snapshot = extractCardSnapshot(fresh);
        } catch {
          /* keep first response */
        }
      }

      await prisma.tawafudPayment.create({
        data: {
          orgId: sub.orgId,
          amount: amountHalalas,
          currency: 'SAR',
          status: mapStatus(finalStatus),
          tapChargeId: charge.id,
          source: 'card',
          description: `${sub.plan} renewal`,
          plan: sub.plan,
          cardId: snapshot.cardId ?? cardId,
          customerId: snapshot.customerId ?? customerId,
          cardBrand: snapshot.brand,
          lastFour: snapshot.lastFour,
          kind: ((sub as any).failedAttempts ?? 0) > 0 ? 'retry' : 'renewal',
          metadata: { plan: sub.plan, automated: true },
        } as any,
      });

      if (finalStatus === 'CAPTURED') {
        await activateOrExtendSubscription(prisma, {
          orgId: sub.orgId,
          plan: sub.plan,
          tapChargeId: charge.id,
          cardId: snapshot.cardId ?? cardId,
          customerId: snapshot.customerId ?? customerId,
        });
        summary.renewed++;
        continue;
      }

      // Charge did not capture — increment failures, schedule retry, transition to past_due.
      const failedAttempts = ((sub as any).failedAttempts ?? 0) + 1;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        // Out of attempts — keep at past_due until endDate + grace, then expire (handled at top).
        await prisma.tawafudSubscription.update({
          where: { orgId: sub.orgId },
          data: {
            status: 'past_due',
            pastDueAt: (sub as any).pastDueAt ?? now,
            failedAttempts,
            nextChargeAttemptAt: null,
            updatedAt: now,
          },
        });
      } else {
        const backoff = RETRY_BACKOFF_DAYS[Math.min(failedAttempts - 1, RETRY_BACKOFF_DAYS.length - 1)];
        await markPastDue(prisma, sub.orgId, addDays(now, backoff));
      }
      summary.pastDue++;
    } catch (err: any) {
      summary.errors++;
      // Leave subscription state untouched — try again on the next dunning run.
      // eslint-disable-next-line no-console
      console.error('[dunning] renewal failed for org', sub.orgId, err?.message || err);
    }
  }

  return summary;
}

/**
 * Manual single-org renewal helper, used from admin endpoints.
 */
export async function renewOrgSubscription(prisma: PrismaClient, orgId: string) {
  const sub = await prisma.tawafudSubscription.findUnique({ where: { orgId } });
  if (!sub) throw new Error('No subscription');
  // Force the candidate window to include this sub regardless of endDate.
  await prisma.tawafudSubscription.update({
    where: { orgId },
    data: { nextChargeAttemptAt: new Date(0) },
  });
  return runDunning(prisma);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export async function expireOrg(prisma: PrismaClient, orgId: string) {
  return expireSubscription(prisma, orgId);
}
