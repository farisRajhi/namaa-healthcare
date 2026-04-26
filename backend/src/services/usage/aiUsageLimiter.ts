import { PrismaClient } from '@prisma/client';
import { PLAN_TOKEN_LIMIT, PLAN_CONVERSATION_LIMIT, CONVERSATION_TOKEN_CAP, isPlanKey, type PlanKey } from '../billing/plans.js';
import { messages } from '../../lib/messages.js';

// ─────────────────────────────────────────────────────────
// AI Usage Limiter — Monthly token + conversation + per-conversation caps per organization
// ─────────────────────────────────────────────────────────

/** Soft-warning threshold: surface a warning to the client at this fraction of any limit. */
export const SOFT_WARNING_THRESHOLD = 0.8;

export interface TokenLimitCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface ConversationCapCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

export interface TokenDelta {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type LimitKind = 'conversation' | 'tokens';

export interface UsageWarning {
  kind: LimitKind;
  used: number;
  limit: number;
  percentage: number;
  message: { ar: string; en: string };
}

/**
 * Error thrown when the org's monthly plan limit is reached. Carries
 * machine-readable info so route-level error handlers can convert it
 * into a 402 response and the frontend overlay can prompt for upgrade.
 */
export class PlanLimitReachedError extends Error {
  readonly statusCode = 402;
  readonly code = 'PLAN_LIMIT_REACHED';
  readonly kind: LimitKind;
  readonly plan: PlanKey;
  readonly used: number;
  readonly limit: number;
  readonly bilingual: { ar: string; en: string };

  constructor(args: {
    kind: LimitKind;
    plan: PlanKey;
    used: number;
    limit: number;
    bilingual: { ar: string; en: string };
  }) {
    super(args.bilingual.en);
    this.name = 'PlanLimitReachedError';
    this.kind = args.kind;
    this.plan = args.plan;
    this.used = args.used;
    this.limit = args.limit;
    this.bilingual = args.bilingual;
  }
}

// ─── Bilingual error strings ────────────────────────────
// Re-exported from lib/messages.ts so the limiter remains the single source
// of truth for callers, while the actual strings live with the rest of the
// app's bilingual catalog.

export const AI_LIMIT_ERROR = messages.plan.limitReachedTokens;
export const CONVERSATION_LIMIT_ERROR = messages.plan.limitReachedConversations;
export const PROVIDER_LIMIT_ERROR = messages.plan.limitReachedProviders;

/** @deprecated use AI_LIMIT_ERROR / CONVERSATION_LIMIT_ERROR depending on the kind */
export const CONVERSATION_CAP_ERROR = {
  ar: 'وصلت هذه المحادثة إلى الحد الأقصى. سيتم تحويلك إلى أحد الموظفين.',
  en: 'This conversation has reached its limit. You will be transferred to a staff member.',
};

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function tokenLimitFor(plan: PlanKey | string | null | undefined): number {
  if (plan && (plan === 'starter' || plan === 'professional' || plan === 'enterprise')) {
    return PLAN_TOKEN_LIMIT[plan];
  }
  // Unknown/trial plans get the starter budget by default.
  return PLAN_TOKEN_LIMIT.starter;
}

function conversationLimitFor(plan: PlanKey | string | null | undefined): number {
  if (plan && (plan === 'starter' || plan === 'professional' || plan === 'enterprise')) {
    return PLAN_CONVERSATION_LIMIT[plan];
  }
  return PLAN_CONVERSATION_LIMIT.starter;
}

/** @deprecated use tokenLimitFor */
function planLimit(plan: PlanKey | string | null | undefined): number {
  return tokenLimitFor(plan);
}

/**
 * Pre-LLM-call check: does this org still have token budget this month?
 * Read-only — does NOT increment any counter.
 */
export async function checkLimit(
  prisma: PrismaClient,
  orgId: string,
  plan: PlanKey | string | null | undefined,
): Promise<TokenLimitCheck> {
  const { year, month } = currentYearMonth();
  const limit = tokenLimitFor(plan);

  const existing = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });

  const used = existing ? Number(existing.totalTokens) : 0;
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
    percentage,
  };
}

/**
 * Pre-conversation-create check: has this org reached its monthly
 * conversation count? Read-only.
 */
export async function checkConversationLimit(
  prisma: PrismaClient,
  orgId: string,
  plan: PlanKey | string | null | undefined,
): Promise<TokenLimitCheck> {
  const { year, month } = currentYearMonth();
  const limit = conversationLimitFor(plan);

  const existing = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });

  const used = existing?.conversationCount ?? 0;
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
    percentage,
  };
}

/**
 * Throw a `PlanLimitReachedError` if the org has reached the requested
 * monthly limit. Use at the top of any AI-call or conversation-create route
 * to enforce plan caps.
 */
export async function assertWithinLimits(
  prisma: PrismaClient,
  orgId: string,
  plan: PlanKey,
  kind: LimitKind,
): Promise<void> {
  if (kind === 'tokens') {
    const check = await checkLimit(prisma, orgId, plan);
    if (!check.allowed) {
      throw new PlanLimitReachedError({
        kind,
        plan,
        used: check.used,
        limit: check.limit,
        bilingual: AI_LIMIT_ERROR,
      });
    }
    return;
  }

  // kind === 'conversation'
  const check = await checkConversationLimit(prisma, orgId, plan);
  if (!check.allowed) {
    throw new PlanLimitReachedError({
      kind,
      plan,
      used: check.used,
      limit: check.limit,
      bilingual: CONVERSATION_LIMIT_ERROR,
    });
  }
}

/**
 * Compute a soft-warning payload for the given org+plan if usage has crossed
 * `SOFT_WARNING_THRESHOLD` (80 % default). Returns null when below threshold.
 *
 * Callers should attach the result to a successful response so the UI can
 * surface "approaching limit" messaging without blocking the request.
 */
export async function computeWarning(
  prisma: PrismaClient,
  orgId: string,
  plan: PlanKey,
  kind: LimitKind,
): Promise<UsageWarning | null> {
  const check = kind === 'tokens'
    ? await checkLimit(prisma, orgId, plan)
    : await checkConversationLimit(prisma, orgId, plan);

  // Below threshold OR already at/past 100 % (a hard error elsewhere).
  if (check.percentage / 100 < SOFT_WARNING_THRESHOLD) return null;
  if (check.used >= check.limit) return null;

  return {
    kind,
    used: check.used,
    limit: check.limit,
    percentage: check.percentage,
    message: kind === 'tokens'
      ? messages.plan.approachingLimitTokens
      : messages.plan.approachingLimitConversations,
  };
}

/**
 * Post-LLM-call: atomically record actual token usage.
 * Also bumps the legacy responseCount for backwards compatibility.
 *
 * Concurrent calls may push a few hundred tokens past the limit — that's
 * acceptable; we prefer eventual correctness over a transaction lock here.
 */
export async function recordUsage(
  prisma: PrismaClient,
  orgId: string,
  delta: TokenDelta,
): Promise<void> {
  const { year, month } = currentYearMonth();

  await prisma.aiUsageCounter.upsert({
    where: { orgId_year_month: { orgId, year, month } },
    update: {
      responseCount: { increment: 1 },
      promptTokens: { increment: BigInt(delta.promptTokens) },
      completionTokens: { increment: BigInt(delta.completionTokens) },
      totalTokens: { increment: BigInt(delta.totalTokens) },
    },
    create: {
      orgId,
      year,
      month,
      responseCount: 1,
      promptTokens: BigInt(delta.promptTokens),
      completionTokens: BigInt(delta.completionTokens),
      totalTokens: BigInt(delta.totalTokens),
    },
  });
}

/**
 * Increment the org's monthly conversation counter. Call once per *new*
 * conversation row (not per message). Safe to call before the conversation
 * row is created — uses upsert against the (orgId, year, month) key.
 */
export async function recordConversation(
  prisma: PrismaClient,
  orgId: string,
): Promise<void> {
  const { year, month } = currentYearMonth();

  await prisma.aiUsageCounter.upsert({
    where: { orgId_year_month: { orgId, year, month } },
    update: { conversationCount: { increment: 1 } },
    create: {
      orgId,
      year,
      month,
      conversationCount: 1,
    },
  });
}

/**
 * Pre-LLM-call per-conversation cap check — prevents runaway sessions
 * (loops, abuse, confused patients) from draining the monthly budget.
 */
export async function checkConversationCap(
  prisma: PrismaClient,
  conversationId: string,
): Promise<ConversationCapCheck> {
  const conv = await prisma.conversation.findUnique({
    where: { conversationId },
    select: { totalTokens: true },
  });
  const used = conv?.totalTokens ?? 0;
  return {
    allowed: used < CONVERSATION_TOKEN_CAP,
    used,
    limit: CONVERSATION_TOKEN_CAP,
  };
}

/** Increment a conversation's running token total. */
export async function incrementConversationTokens(
  prisma: PrismaClient,
  conversationId: string,
  tokens: number,
): Promise<void> {
  await prisma.conversation.update({
    where: { conversationId },
    data: { totalTokens: { increment: tokens } },
  });
}

/** Reset a single conversation's token counter back to 0 — unblocks a capped session. */
export async function resetConversationTokens(
  prisma: PrismaClient,
  orgId: string,
  conversationId: string,
): Promise<{ conversationId: string; previousTokens: number }> {
  const conv = await prisma.conversation.findFirst({
    where: { conversationId, orgId },
    select: { totalTokens: true },
  });
  if (!conv) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }
  await prisma.conversation.update({
    where: { conversationId },
    data: { totalTokens: 0 },
  });
  return { conversationId, previousTokens: conv.totalTokens };
}

/** Reset every conversation in the org to 0 tokens — bulk unblock. */
export async function resetAllConversationTokens(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ conversationsReset: number }> {
  const res = await prisma.conversation.updateMany({
    where: { orgId, totalTokens: { gt: 0 } },
    data: { totalTokens: 0 },
  });
  return { conversationsReset: res.count };
}

/** Reset the org's monthly AI usage counter for the current month. */
export async function resetMonthlyUsage(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ year: number; month: number; previousTotalTokens: number }> {
  const { year, month } = currentYearMonth();
  const existing = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });
  const previousTotalTokens = existing ? Number(existing.totalTokens) : 0;
  await prisma.aiUsageCounter.upsert({
    where: { orgId_year_month: { orgId, year, month } },
    update: {
      responseCount: 0,
      conversationCount: 0,
      promptTokens: BigInt(0),
      completionTokens: BigInt(0),
      totalTokens: BigInt(0),
    },
    create: {
      orgId,
      year,
      month,
      responseCount: 0,
      conversationCount: 0,
      promptTokens: BigInt(0),
      completionTokens: BigInt(0),
      totalTokens: BigInt(0),
    },
  });
  return { year, month, previousTotalTokens };
}

/**
 * Read-only usage query for dashboard display.
 */
export async function getUsage(
  prisma: PrismaClient,
  orgId: string,
  plan: PlanKey | string | null | undefined,
): Promise<{
  tokensUsed: number;
  tokensLimit: number;
  remaining: number;
  percentage: number;
  responseCount: number;
  avgTokensPerConversation: number;
  conversationsUsed: number;
  conversationsLimit: number;
  conversationsRemaining: number;
  conversationsPercentage: number;
  year: number;
  month: number;
}> {
  const { year, month } = currentYearMonth();
  const tokensLimit = tokenLimitFor(plan);
  const conversationsLimit = conversationLimitFor(plan);

  const counter = await prisma.aiUsageCounter.findUnique({
    where: { orgId_year_month: { orgId, year, month } },
  });

  const tokensUsed = counter ? Number(counter.totalTokens) : 0;
  const responseCount = counter?.responseCount ?? 0;
  const conversationsUsed = counter?.conversationCount ?? 0;

  const remaining = Math.max(0, tokensLimit - tokensUsed);
  const percentage = tokensLimit > 0 ? Math.min(100, Math.round((tokensUsed / tokensLimit) * 100)) : 0;
  const conversationsRemaining = Math.max(0, conversationsLimit - conversationsUsed);
  const conversationsPercentage = conversationsLimit > 0
    ? Math.min(100, Math.round((conversationsUsed / conversationsLimit) * 100))
    : 0;
  const avgTokensPerConversation = responseCount > 0
    ? Math.round(tokensUsed / responseCount)
    : 0;

  return {
    tokensUsed,
    tokensLimit,
    remaining,
    percentage,
    responseCount,
    avgTokensPerConversation,
    conversationsUsed,
    conversationsLimit,
    conversationsRemaining,
    conversationsPercentage,
    year,
    month,
  };
}

// ─── Legacy shim — keep existing callers working ────────────

/**
 * Resolve the effective plan for usage-limit purposes.
 *
 * Lookup order:
 *  1. Active or past_due paid subscription with endDate >= now → that plan.
 *  2. Trial org (trialEndsAt > now) → 'professional' (matches planGuard/subscriptionGuard).
 *  3. No active sub and no trial → 'starter' (most restrictive fallback).
 */
export async function resolveOrgPlan(
  prisma: PrismaClient,
  orgId: string,
): Promise<PlanKey> {
  const now = new Date();

  const sub = await prisma.tawafudSubscription.findFirst({
    where: {
      orgId,
      status: { in: ['active', 'past_due'] },
      endDate: { gte: now },
    },
    select: { plan: true },
  });
  if (sub?.plan && isPlanKey(sub.plan)) return sub.plan;

  const org = await prisma.org.findUnique({
    where: { orgId },
    select: { trialEndsAt: true } as any,
  });
  const trialEndsAt: Date | null = (org as any)?.trialEndsAt ?? null;
  const isTrialing = !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
  if (isTrialing) return 'professional';

  return 'starter';
}

/**
 * @deprecated Use checkLimit() + recordUsage() instead.
 * Legacy wrapper that pre-checks against the plan's token budget, but
 * increments only responseCount (not tokens). Existing callers that don't
 * yet pass token usage continue to work via this shim.
 *
 * Resolves the org's real plan before checking the token budget, so
 * Professional/Enterprise orgs get their advertised budget rather than the
 * Starter cap.
 */
export async function checkAndIncrement(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ allowed: boolean; current: number; limit: number; remaining: number; plan: PlanKey }> {
  const plan = await resolveOrgPlan(prisma, orgId);
  const check = await checkLimit(prisma, orgId, plan);
  if (!check.allowed) {
    return { allowed: false, current: check.used, limit: check.limit, remaining: 0, plan };
  }
  // Bump only responseCount — callers that use this shim don't have token data yet.
  const { year, month } = currentYearMonth();
  const counter = await prisma.aiUsageCounter.upsert({
    where: { orgId_year_month: { orgId, year, month } },
    update: { responseCount: { increment: 1 } },
    create: { orgId, year, month, responseCount: 1 },
  });
  return {
    allowed: true,
    current: counter.responseCount,
    limit: check.limit,
    remaining: check.remaining,
    plan,
  };
}
