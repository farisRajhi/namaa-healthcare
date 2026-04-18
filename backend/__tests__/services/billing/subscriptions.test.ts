import { describe, it, expect, beforeEach } from 'vitest';
import {
  activateOrExtendSubscription,
  cancelSubscription,
  markPastDue,
  expireSubscription,
} from '../../../src/services/billing/subscriptions.js';

interface FakeSub {
  id: string;
  orgId: string;
  plan: string;
  status: string;
  tapChargeId: string | null;
  cardId: string | null;
  customerId: string | null;
  startDate: Date;
  endDate: Date;
  cancelledAt: Date | null;
  pastDueAt: Date | null;
  nextChargeAttemptAt: Date | null;
  failedAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal Prisma stand-in for the `tawafudSubscription` model (only methods we call). */
function makeFakePrisma(initial?: FakeSub) {
  let row: FakeSub | null = initial ?? null;

  return {
    tawafudSubscription: {
      async findUnique({ where }: { where: { orgId: string } }) {
        if (!row || row.orgId !== where.orgId) return null;
        return { ...row };
      },
      async update({ where, data }: { where: { orgId: string }; data: any }) {
        if (!row || row.orgId !== where.orgId) {
          throw new Error('No row to update');
        }
        const next = { ...row };
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in (v as any)) {
            (next as any)[k] = ((next as any)[k] ?? 0) + (v as any).increment;
          } else {
            (next as any)[k] = v;
          }
        }
        row = next;
        return { ...row };
      },
      async create({ data }: { data: any }) {
        row = {
          id: 'sub-1',
          orgId: data.orgId,
          plan: data.plan,
          status: data.status ?? 'active',
          tapChargeId: data.tapChargeId ?? null,
          cardId: data.cardId ?? null,
          customerId: data.customerId ?? null,
          startDate: data.startDate,
          endDate: data.endDate,
          cancelledAt: data.cancelledAt ?? null,
          pastDueAt: data.pastDueAt ?? null,
          nextChargeAttemptAt: data.nextChargeAttemptAt ?? null,
          failedAttempts: data.failedAttempts ?? 0,
          createdAt: new Date(),
          updatedAt: data.updatedAt ?? new Date(),
        };
        return { ...row };
      },
    },
    /** Test-only inspector */
    _row(): FakeSub | null {
      return row ? { ...row } : null;
    },
  };
}

describe('billing/subscriptions — activateOrExtendSubscription', () => {
  let prisma: ReturnType<typeof makeFakePrisma>;

  beforeEach(() => {
    prisma = makeFakePrisma();
  });

  it('creates a fresh subscription with endDate +1 month from now', async () => {
    const before = Date.now();
    await activateOrExtendSubscription(prisma as any, {
      orgId: 'org-1',
      plan: 'starter',
      tapChargeId: 'chg_1',
      cardId: 'card_x',
      customerId: 'cus_x',
    });

    const row = prisma._row();
    expect(row).not.toBeNull();
    expect(row!.orgId).toBe('org-1');
    expect(row!.plan).toBe('starter');
    expect(row!.status).toBe('active');
    expect(row!.tapChargeId).toBe('chg_1');
    expect(row!.cardId).toBe('card_x');
    expect(row!.customerId).toBe('cus_x');
    expect(row!.startDate.getTime()).toBeGreaterThanOrEqual(before);
    // ~30 days ahead
    const monthMs = (row!.endDate.getTime() - row!.startDate.getTime());
    expect(monthMs).toBeGreaterThan(27 * 86_400_000);
    expect(monthMs).toBeLessThan(32 * 86_400_000);
  });

  it('extends an active sub from current endDate (not from now)', async () => {
    const futureEnd = new Date(Date.now() + 10 * 86_400_000);
    prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'active',
      tapChargeId: 'chg_old',
      cardId: 'card_x',
      customerId: 'cus_x',
      startDate: new Date(Date.now() - 20 * 86_400_000),
      endDate: futureEnd,
      cancelledAt: null,
      pastDueAt: null,
      nextChargeAttemptAt: null,
      failedAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await activateOrExtendSubscription(prisma as any, {
      orgId: 'org-1',
      plan: 'starter',
      tapChargeId: 'chg_renew',
    });

    const row = prisma._row()!;
    // New endDate should be ~1 month past previous endDate (not 1 month from now).
    const delta = row.endDate.getTime() - futureEnd.getTime();
    expect(delta).toBeGreaterThan(27 * 86_400_000);
    expect(delta).toBeLessThan(32 * 86_400_000);
    expect(row.tapChargeId).toBe('chg_renew');
  });

  it('upgrades plan and resets failure counters / past_due flags', async () => {
    prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'past_due',
      tapChargeId: 'chg_old',
      cardId: 'card_x',
      customerId: 'cus_x',
      startDate: new Date(),
      endDate: new Date(Date.now() - 86_400_000), // expired
      cancelledAt: null,
      pastDueAt: new Date(),
      nextChargeAttemptAt: new Date(),
      failedAttempts: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await activateOrExtendSubscription(prisma as any, {
      orgId: 'org-1',
      plan: 'professional',
      tapChargeId: 'chg_upgrade',
    });

    const row = prisma._row()!;
    expect(row.plan).toBe('professional');
    expect(row.status).toBe('active');
    expect(row.failedAttempts).toBe(0);
    expect(row.pastDueAt).toBeNull();
    expect(row.cancelledAt).toBeNull();
    expect(row.nextChargeAttemptAt).toBeNull();
  });
});

describe('billing/subscriptions — cancelSubscription', () => {
  it('marks status=cancelled and stamps cancelledAt while keeping endDate', async () => {
    const endDate = new Date(Date.now() + 10 * 86_400_000);
    const prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'active',
      tapChargeId: 'chg_1',
      cardId: 'card_x',
      customerId: 'cus_x',
      startDate: new Date(),
      endDate,
      cancelledAt: null,
      pastDueAt: null,
      nextChargeAttemptAt: null,
      failedAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await cancelSubscription(prisma as any, 'org-1');
    const row = prisma._row()!;
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(row.endDate.getTime()).toBe(endDate.getTime());
  });

  it('returns null when no subscription exists', async () => {
    const prisma = makeFakePrisma();
    const result = await cancelSubscription(prisma as any, 'org-x');
    expect(result).toBeNull();
  });

  it('is a no-op when already cancelled', async () => {
    const prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'cancelled',
      tapChargeId: null,
      cardId: null,
      customerId: null,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86_400_000),
      cancelledAt: new Date(Date.now() - 86_400_000),
      pastDueAt: null,
      nextChargeAttemptAt: null,
      failedAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const before = prisma._row()!.cancelledAt!.getTime();
    await cancelSubscription(prisma as any, 'org-1');
    expect(prisma._row()!.cancelledAt!.getTime()).toBe(before);
  });
});

describe('billing/subscriptions — markPastDue / expireSubscription', () => {
  it('markPastDue sets status=past_due and increments failedAttempts', async () => {
    const prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'active',
      tapChargeId: null,
      cardId: 'card_x',
      customerId: 'cus_x',
      startDate: new Date(),
      endDate: new Date(),
      cancelledAt: null,
      pastDueAt: null,
      nextChargeAttemptAt: null,
      failedAttempts: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const next = new Date(Date.now() + 86_400_000);
    await markPastDue(prisma as any, 'org-1', next);
    const row = prisma._row()!;
    expect(row.status).toBe('past_due');
    expect(row.failedAttempts).toBe(2);
    expect(row.pastDueAt).toBeInstanceOf(Date);
    expect(row.nextChargeAttemptAt!.getTime()).toBe(next.getTime());
  });

  it('expireSubscription clears next attempt and sets status=expired', async () => {
    const prisma = makeFakePrisma({
      id: 'sub-1',
      orgId: 'org-1',
      plan: 'starter',
      status: 'past_due',
      tapChargeId: null,
      cardId: 'card_x',
      customerId: 'cus_x',
      startDate: new Date(),
      endDate: new Date(),
      cancelledAt: null,
      pastDueAt: new Date(),
      nextChargeAttemptAt: new Date(),
      failedAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expireSubscription(prisma as any, 'org-1');
    const row = prisma._row()!;
    expect(row.status).toBe('expired');
    expect(row.nextChargeAttemptAt).toBeNull();
  });
});
