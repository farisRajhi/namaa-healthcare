import { describe, it, expect, beforeEach } from 'vitest';
import {
  assertWithinLimits,
  checkLimit,
  checkConversationLimit,
  computeWarning,
  PlanLimitReachedError,
  recordConversation,
  recordUsage,
  SOFT_WARNING_THRESHOLD,
} from '../../../src/services/usage/aiUsageLimiter.js';
import { PLAN_CONVERSATION_LIMIT, PLAN_TOKEN_LIMIT } from '../../../src/services/billing/plans.js';

// ─────────────────────────────────────────────────────────
// Plan-limit enforcement tests
//
// Covers Gap #1: token / conversation limits are now enforced rather than
// just defined in code. Uses a hand-rolled Prisma stand-in (mirrors the style
// of subscriptions.test.ts in the same folder) so we never touch a real DB.
// ─────────────────────────────────────────────────────────

interface FakeRow {
  orgId: string;
  year: number;
  month: number;
  responseCount: number;
  conversationCount: number;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
}

function makeFakePrisma(initial?: Partial<FakeRow>) {
  let row: FakeRow | null = initial
    ? {
        orgId: initial.orgId ?? 'org-1',
        year: initial.year ?? new Date().getFullYear(),
        month: initial.month ?? new Date().getMonth() + 1,
        responseCount: initial.responseCount ?? 0,
        conversationCount: initial.conversationCount ?? 0,
        promptTokens: initial.promptTokens ?? 0n,
        completionTokens: initial.completionTokens ?? 0n,
        totalTokens: initial.totalTokens ?? 0n,
      }
    : null;

  // Apply Prisma-style increment / set semantics.
  function applyUpdate(target: FakeRow, data: any): FakeRow {
    const next = { ...target };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as any)) {
        const inc = (v as any).increment;
        const cur = (next as any)[k];
        // BigInt-aware addition.
        (next as any)[k] = typeof cur === 'bigint' || typeof inc === 'bigint'
          ? BigInt(cur) + BigInt(inc)
          : (cur ?? 0) + inc;
      } else {
        (next as any)[k] = v;
      }
    }
    return next;
  }

  return {
    aiUsageCounter: {
      async findUnique({ where }: { where: { orgId_year_month: { orgId: string; year: number; month: number } } }) {
        const k = where.orgId_year_month;
        if (!row || row.orgId !== k.orgId || row.year !== k.year || row.month !== k.month) return null;
        return { ...row };
      },
      async upsert({ where, update, create }: { where: any; update: any; create: any }) {
        const k = where.orgId_year_month;
        if (!row || row.orgId !== k.orgId || row.year !== k.year || row.month !== k.month) {
          row = {
            orgId: create.orgId,
            year: create.year,
            month: create.month,
            responseCount: create.responseCount ?? 0,
            conversationCount: create.conversationCount ?? 0,
            promptTokens: create.promptTokens ?? 0n,
            completionTokens: create.completionTokens ?? 0n,
            totalTokens: create.totalTokens ?? 0n,
          };
          return { ...row };
        }
        row = applyUpdate(row, update);
        return { ...row };
      },
    },
    /** Test inspector */
    _row(): FakeRow | null {
      return row ? { ...row } : null;
    },
    /** Allow tests to seed a row directly */
    _set(next: FakeRow | null) {
      row = next ? { ...next } : null;
    },
  };
}

describe('aiUsageLimiter — checkLimit (tokens)', () => {
  it('allows when org has no usage row this month', async () => {
    const prisma = makeFakePrisma();
    const result = await checkLimit(prisma as any, 'org-1', 'starter');
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(PLAN_TOKEN_LIMIT.starter);
    expect(result.percentage).toBe(0);
  });

  it('blocks when used >= limit', async () => {
    const prisma = makeFakePrisma({ totalTokens: BigInt(PLAN_TOKEN_LIMIT.starter) });
    const result = await checkLimit(prisma as any, 'org-1', 'starter');
    expect(result.allowed).toBe(false);
    expect(result.percentage).toBe(100);
    expect(result.remaining).toBe(0);
  });

  it('uses the higher Pro budget when plan is professional', async () => {
    const prisma = makeFakePrisma({ totalTokens: BigInt(PLAN_TOKEN_LIMIT.starter + 1) });
    const result = await checkLimit(prisma as any, 'org-1', 'professional');
    // Above starter cap but well below professional cap.
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_TOKEN_LIMIT.professional);
  });

  it('falls back to starter limit for unknown plans', async () => {
    const prisma = makeFakePrisma();
    const result = await checkLimit(prisma as any, 'org-1', 'mystery-plan' as any);
    expect(result.limit).toBe(PLAN_TOKEN_LIMIT.starter);
  });
});

describe('aiUsageLimiter — checkConversationLimit', () => {
  it('allows fresh orgs', async () => {
    const prisma = makeFakePrisma();
    const result = await checkConversationLimit(prisma as any, 'org-1', 'starter');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_CONVERSATION_LIMIT.starter);
  });

  it('blocks at the plan conversation cap', async () => {
    const prisma = makeFakePrisma({ conversationCount: PLAN_CONVERSATION_LIMIT.starter });
    const result = await checkConversationLimit(prisma as any, 'org-1', 'starter');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('respects plan-specific limits — pro keeps allowing past starter cap', async () => {
    const prisma = makeFakePrisma({ conversationCount: PLAN_CONVERSATION_LIMIT.starter + 10 });
    const result = await checkConversationLimit(prisma as any, 'org-1', 'professional');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(PLAN_CONVERSATION_LIMIT.professional);
  });
});

describe('aiUsageLimiter — assertWithinLimits', () => {
  it('does not throw when token usage is below the cap', async () => {
    const prisma = makeFakePrisma({ totalTokens: 100n });
    await expect(assertWithinLimits(prisma as any, 'org-1', 'starter', 'tokens')).resolves.toBeUndefined();
  });

  it('throws PlanLimitReachedError with bilingual payload when token cap is reached', async () => {
    const prisma = makeFakePrisma({ totalTokens: BigInt(PLAN_TOKEN_LIMIT.starter) });

    let caught: unknown = null;
    try {
      await assertWithinLimits(prisma as any, 'org-1', 'starter', 'tokens');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PlanLimitReachedError);
    const e = caught as PlanLimitReachedError;
    expect(e.statusCode).toBe(402);
    expect(e.code).toBe('PLAN_LIMIT_REACHED');
    expect(e.kind).toBe('tokens');
    expect(e.plan).toBe('starter');
    expect(e.limit).toBe(PLAN_TOKEN_LIMIT.starter);
    // Bilingual payload — both languages present and non-empty.
    expect(e.bilingual.ar).toBeTruthy();
    expect(e.bilingual.en).toBeTruthy();
    expect(e.bilingual.ar).not.toBe(e.bilingual.en);
  });

  it('throws when conversation cap is reached', async () => {
    const prisma = makeFakePrisma({ conversationCount: PLAN_CONVERSATION_LIMIT.starter });
    await expect(
      assertWithinLimits(prisma as any, 'org-1', 'starter', 'conversation'),
    ).rejects.toThrow(PlanLimitReachedError);
  });

  it('does not throw for higher-tier plans even past lower-tier caps', async () => {
    const prisma = makeFakePrisma({
      conversationCount: PLAN_CONVERSATION_LIMIT.starter + 1,
      totalTokens: BigInt(PLAN_TOKEN_LIMIT.starter + 1),
    });
    // Professional plan still has headroom.
    await expect(
      assertWithinLimits(prisma as any, 'org-1', 'professional', 'tokens'),
    ).resolves.toBeUndefined();
    await expect(
      assertWithinLimits(prisma as any, 'org-1', 'professional', 'conversation'),
    ).resolves.toBeUndefined();
  });
});

describe('aiUsageLimiter — recordUsage / recordConversation', () => {
  it('recordUsage creates a row from zero on first call', async () => {
    const prisma = makeFakePrisma();
    await recordUsage(prisma as any, 'org-1', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    const row = prisma._row()!;
    expect(row.responseCount).toBe(1);
    expect(row.totalTokens).toBe(150n);
    expect(row.promptTokens).toBe(100n);
    expect(row.completionTokens).toBe(50n);
  });

  it('recordUsage accumulates across calls', async () => {
    const prisma = makeFakePrisma();
    await recordUsage(prisma as any, 'org-1', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    await recordUsage(prisma as any, 'org-1', { promptTokens: 200, completionTokens: 100, totalTokens: 300 });
    const row = prisma._row()!;
    expect(row.responseCount).toBe(2);
    expect(row.totalTokens).toBe(450n);
  });

  it('recordConversation increments separately from recordUsage', async () => {
    const prisma = makeFakePrisma();
    await recordConversation(prisma as any, 'org-1');
    await recordConversation(prisma as any, 'org-1');
    await recordConversation(prisma as any, 'org-1');
    const row = prisma._row()!;
    expect(row.conversationCount).toBe(3);
    // recordUsage was never called, so message-level counters stay at zero.
    expect(row.responseCount).toBe(0);
    expect(row.totalTokens).toBe(0n);
  });
});

describe('aiUsageLimiter — computeWarning (soft 80% warning)', () => {
  it('returns null when usage is below 80% of token limit', async () => {
    const halfway = Math.floor(PLAN_TOKEN_LIMIT.starter * 0.5);
    const prisma = makeFakePrisma({ totalTokens: BigInt(halfway) });
    const warning = await computeWarning(prisma as any, 'org-1', 'starter', 'tokens');
    expect(warning).toBeNull();
  });

  it('returns a warning when usage crosses 80% of token limit', async () => {
    const eightyPct = Math.floor(PLAN_TOKEN_LIMIT.starter * SOFT_WARNING_THRESHOLD) + 100;
    const prisma = makeFakePrisma({ totalTokens: BigInt(eightyPct) });
    const warning = await computeWarning(prisma as any, 'org-1', 'starter', 'tokens');
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe('tokens');
    expect(warning!.percentage).toBeGreaterThanOrEqual(80);
    expect(warning!.message.ar).toBeTruthy();
    expect(warning!.message.en).toBeTruthy();
  });

  it('returns null once usage hits 100% (hard error fires elsewhere)', async () => {
    const prisma = makeFakePrisma({ totalTokens: BigInt(PLAN_TOKEN_LIMIT.starter) });
    const warning = await computeWarning(prisma as any, 'org-1', 'starter', 'tokens');
    // When over the hard cap, suppress the soft warning so we don't double-message.
    expect(warning).toBeNull();
  });

  it('warns on conversation count when crossing 80%', async () => {
    const eightyPct = Math.floor(PLAN_CONVERSATION_LIMIT.starter * SOFT_WARNING_THRESHOLD) + 1;
    const prisma = makeFakePrisma({ conversationCount: eightyPct });
    const warning = await computeWarning(prisma as any, 'org-1', 'starter', 'conversation');
    expect(warning).not.toBeNull();
    expect(warning!.kind).toBe('conversation');
  });
});
