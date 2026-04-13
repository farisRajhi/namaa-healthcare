import { PrismaClient } from '@prisma/client';

// ────────────────────────────────────────────────────────
// Automated QA/QM — Quality Analyzer
// Section 16 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

export interface QualityScores {
  accuracyScore: number;   // 0-100
  toneScore: number;       // 0-100
  resolutionScore: number; // 0-100
  complianceScore: number; // 0-100
  overallScore: number;    // 0-100 weighted average
}

export interface QualityFlag {
  flagged: boolean;
  flagReason: string | null;
}

export interface QualityResult extends QualityScores, QualityFlag {
  callId: string | null;
  conversationId: string;
}

export interface QualityTrend {
  bucket: string;
  avgOverall: number;
  avgAccuracy: number;
  avgTone: number;
  avgResolution: number;
  avgCompliance: number;
  flaggedCount: number;
  totalAnalyzed: number;
}

// ── Sentiment / keyword detectors ───────────────────────

const FRUSTRATION_PATTERNS = [
  /\b(angry|frustrated|upset|furious|horrible|terrible|worst|disgusting)\b/i,
  /\b(غاضب|محبط|زعلان|مستاء|سيء جداً|أسوأ)\b/,
  /!{2,}/, // multiple exclamation marks
  /\b(unacceptable|ridiculous|outrageous)\b/i,
];

const ABRUPT_ENDING_PATTERNS = [
  /\b(hang up|hung up|disconnected|dropped)\b/i,
  /\b(قطع الاتصال|انقطع)\b/,
];

const PHI_EXPOSURE_PATTERNS = [
  // Saudi national ID (10 digits starting with 1 or 2)
  /\b[12]\d{9}\b/,
  // Full phone numbers in AI output (should be redacted)
  /\+966\d{8,9}/,
  // Medical record numbers in output
  /\bMRN[:\s]*\d{4,}\b/i,
  // Date of birth explicitly stated in AI output
  /\b(date of birth|DOB|تاريخ الميلاد)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i,
];

const MEDICAL_ADVICE_PATTERNS = [
  /\b(you (should|need to|must) take|I recommend taking|الجرعة المناسبة)\b/i,
  /\b(diagnosis is|you have|your condition is|أنت مصاب)\b/i,
  /\b(treatment plan|prescribed|start taking|توقف عن تناول)\b/i,
];

// ── Scoring heuristics ──────────────────────────────────

/**
 * Compute accuracy score.
 * Higher if AI responses are specific, lower if hedging or providing irrelevant info.
 */
function computeAccuracyScore(
  aiMessages: string[],
  wasResolved: boolean,
  hadHandoff: boolean,
): number {
  let score = 75; // baseline

  const allText = aiMessages.join(' ');

  // Penalize hedging / uncertainty
  const hedgeCount = (allText.match(/\b(I think|I believe|maybe|perhaps|not sure|ربما|أعتقد)\b/gi) || []).length;
  score -= Math.min(hedgeCount * 5, 20);

  // Reward resolution
  if (wasResolved) score += 15;

  // Penalize escalation (AI couldn't handle it)
  if (hadHandoff) score -= 10;

  // Penalize very short AI responses (not helpful)
  const avgLen = aiMessages.length
    ? aiMessages.reduce((a, m) => a + m.length, 0) / aiMessages.length
    : 0;
  if (avgLen < 20) score -= 10;

  // Penalize medical advice (should not be giving it)
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(allText)) {
      score -= 15;
      break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute tone score.
 * Based on politeness, empathy markers, and absence of frustration escalation.
 */
function computeToneScore(
  aiMessages: string[],
  userMessages: string[],
): number {
  let score = 80; // baseline

  const aiText = aiMessages.join(' ');
  const userText = userMessages.join(' ');

  // Reward empathy markers in AI
  const empathyMarkers = [
    /\b(understand|sorry|apolog|happy to help|glad|أتفهم|عذراً|يسعدني|بكل سرور)\b/i,
  ];
  for (const p of empathyMarkers) {
    if (p.test(aiText)) {
      score += 5;
      break;
    }
  }

  // Reward greeting / farewell
  if (/\b(hello|hi|welcome|مرحباً|أهلاً|السلام عليكم)\b/i.test(aiText)) score += 3;
  if (/\b(thank|شكراً|goodbye|مع السلامة)\b/i.test(aiText)) score += 2;

  // Detect if user was frustrated and AI didn't de-escalate
  const userFrustrated = FRUSTRATION_PATTERNS.some((p) => p.test(userText));
  if (userFrustrated) {
    const aiDeEscalated = /\b(understand|sorry|apolog|let me help|أتفهم|عذراً|دعني أساعد)\b/i.test(aiText);
    if (aiDeEscalated) {
      score += 5;
    } else {
      score -= 15;
    }
  }

  // Penalize robotic/repetitive responses
  const uniqueResponses = new Set(aiMessages.map((m) => m.trim().toLowerCase()));
  if (aiMessages.length > 2 && uniqueResponses.size < aiMessages.length * 0.5) {
    score -= 10; // too repetitive
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute resolution score.
 */
function computeResolutionScore(
  wasResolved: boolean,
  hadHandoff: boolean,
  messageCount: number,
): number {
  let score = 50; // baseline

  if (wasResolved && !hadHandoff) {
    score = 90;
    // Bonus for quick resolution (fewer messages)
    if (messageCount <= 6) score += 5;
    if (messageCount <= 4) score += 5;
  } else if (wasResolved && hadHandoff) {
    score = 65; // resolved but needed human
  } else if (hadHandoff) {
    score = 40; // needed handoff and may not be resolved
  } else {
    score = 30; // not resolved, no handoff (abandoned?)
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute compliance score.
 * Checks for PHI exposure, medical advice, and proper identity verification.
 */
function computeComplianceScore(
  aiMessages: string[],
  hadVerification: boolean,
): number {
  let score = 90; // baseline — assume compliant

  const allAiText = aiMessages.join(' ');

  // Major penalty: PHI in AI output
  for (const pattern of PHI_EXPOSURE_PATTERNS) {
    if (pattern.test(allAiText)) {
      score -= 25;
      break;
    }
  }

  // Penalty: medical advice
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(allAiText)) {
      score -= 20;
      break;
    }
  }

  // Reward: identity verification was performed before sharing data
  if (hadVerification) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Determine if the call should be flagged for review.
 */
function determineFlagStatus(
  scores: QualityScores,
  userMessages: string[],
  aiMessages: string[],
  conversationEnded: string,
): QualityFlag {
  const reasons: string[] = [];

  if (scores.overallScore < 60) {
    reasons.push('low_overall_score');
  }

  const userText = userMessages.join(' ');
  if (FRUSTRATION_PATTERNS.some((p) => p.test(userText))) {
    reasons.push('frustrated_patient');
  }

  const allText = [...userMessages, ...aiMessages].join(' ');
  if (ABRUPT_ENDING_PATTERNS.some((p) => p.test(allText))) {
    reasons.push('abrupt_ending');
  }

  const aiText = aiMessages.join(' ');
  if (PHI_EXPOSURE_PATTERNS.some((p) => p.test(aiText))) {
    reasons.push('phi_exposure');
  }

  if (MEDICAL_ADVICE_PATTERNS.some((p) => p.test(aiText))) {
    reasons.push('medical_advice_given');
  }

  return {
    flagged: reasons.length > 0,
    flagReason: reasons.length > 0 ? reasons.join(', ') : null,
  };
}

// ── Quality Analyzer Service ────────────────────────────

export class QualityAnalyzerService {
  // Weights for overall score
  private static WEIGHTS = {
    accuracy: 0.3,
    tone: 0.2,
    resolution: 0.35,
    compliance: 0.15,
  };

  constructor(private prisma: PrismaClient) {}

  /**
   * Analyze a single conversation and generate a CallQualityScore record.
   * Intended to run async after each call/conversation completes.
   */
  async analyzeConversation(conversationId: string): Promise<QualityResult> {
    // Fetch conversation data
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
      select: { conversationId: true, status: true, patientId: true, orgId: true },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Fetch messages
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { direction: true, bodyText: true },
    });

    const userMessages = messages
      .filter((m) => m.direction === 'in' && m.bodyText)
      .map((m) => m.bodyText!);
    const aiMessages = messages
      .filter((m) => m.direction === 'out' && m.bodyText)
      .map((m) => m.bodyText!);

    // Check for handoff
    const handoff = await this.prisma.handoff.findFirst({
      where: { conversationId },
    });
    const hadHandoff = !!handoff;

    // Check if resolved
    const wasResolved = conversation.status === 'closed';

    // Check for identity verification
    const hadVerification = conversation.patientId != null;

    // Find associated voice call
    const voiceCall = await this.prisma.voiceCall.findFirst({
      where: { conversationId },
      select: { callId: true },
    });

    // Compute scores
    const accuracyScore = computeAccuracyScore(aiMessages, wasResolved, hadHandoff);
    const toneScore = computeToneScore(aiMessages, userMessages);
    const resolutionScore = computeResolutionScore(wasResolved, hadHandoff, messages.length);
    const complianceScore = computeComplianceScore(aiMessages, hadVerification);

    const overallScore = Math.round(
      accuracyScore * QualityAnalyzerService.WEIGHTS.accuracy +
      toneScore * QualityAnalyzerService.WEIGHTS.tone +
      resolutionScore * QualityAnalyzerService.WEIGHTS.resolution +
      complianceScore * QualityAnalyzerService.WEIGHTS.compliance,
    );

    const scores: QualityScores = {
      accuracyScore,
      toneScore,
      resolutionScore,
      complianceScore,
      overallScore,
    };

    const flag = determineFlagStatus(scores, userMessages, aiMessages, conversation.status);

    // Persist the quality score
    await this.prisma.callQualityScore.create({
      data: {
        callId: voiceCall?.callId ?? null,
        conversationId,
        accuracyScore,
        toneScore,
        resolutionScore,
        complianceScore,
        overallScore,
        flagged: flag.flagged,
        flagReason: flag.flagReason,
      },
    });

    return {
      callId: voiceCall?.callId ?? null,
      conversationId,
      ...scores,
      ...flag,
    };
  }

  /**
   * Batch-analyze all un-scored conversations for an org.
   */
  async analyzeUnscored(orgId: string, limit = 100): Promise<number> {
    // Find conversations that don't have a quality score yet
    const unscored = await this.prisma.conversation.findMany({
      where: {
        orgId,
        status: 'closed',
        // Exclude conversations that already have a score
        NOT: {
          conversationId: {
            in: (
              await this.prisma.callQualityScore.findMany({
                where: { conversationId: { not: null } },
                select: { conversationId: true },
              })
            )
              .filter((s) => s.conversationId != null)
              .map((s) => s.conversationId!),
          },
        },
      },
      select: { conversationId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let analyzed = 0;
    for (const convo of unscored) {
      try {
        await this.analyzeConversation(convo.conversationId);
        analyzed++;
      } catch {
        // Skip failures — will be retried
      }
    }

    return analyzed;
  }

  /**
   * Get quality scores overview (aggregated) for an org.
   */
  async getQualityOverview(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<{
    totalAnalyzed: number;
    avgOverall: number;
    avgAccuracy: number;
    avgTone: number;
    avgResolution: number;
    avgCompliance: number;
    flaggedCount: number;
    flagReasonBreakdown: { reason: string; count: number }[];
    scoreDistribution: { range: string; count: number }[];
  }> {
    const now = new Date();
    const gte = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const lte = to ? new Date(to) : now;

    // Fetch quality scores joined through conversations
    const scores = await this.prisma.callQualityScore.findMany({
      where: {
        analyzedAt: { gte, lte },
        ...(orgId
          ? {
              OR: [
                { conversationId: { not: null } },
                { callId: { not: null } },
              ],
            }
          : {}),
      },
      orderBy: { analyzedAt: 'desc' },
    });

    // Filter by org — need to check through conversation
    const convoIds = scores.filter((s) => s.conversationId).map((s) => s.conversationId!);
    const orgConvos = await this.prisma.conversation.findMany({
      where: { conversationId: { in: convoIds }, orgId },
      select: { conversationId: true },
    });
    const orgConvoSet = new Set(orgConvos.map((c) => c.conversationId));

    // Also check through voice calls
    const callIds = scores.filter((s) => s.callId).map((s) => s.callId!);
    const orgCalls = await this.prisma.voiceCall.findMany({
      where: { callId: { in: callIds }, orgId },
      select: { callId: true },
    });
    const orgCallSet = new Set(orgCalls.map((c) => c.callId));

    const filtered = scores.filter(
      (s) =>
        (s.conversationId && orgConvoSet.has(s.conversationId)) ||
        (s.callId && orgCallSet.has(s.callId)),
    );

    const totalAnalyzed = filtered.length;
    if (totalAnalyzed === 0) {
      return {
        totalAnalyzed: 0,
        avgOverall: 0,
        avgAccuracy: 0,
        avgTone: 0,
        avgResolution: 0,
        avgCompliance: 0,
        flaggedCount: 0,
        flagReasonBreakdown: [],
        scoreDistribution: [],
      };
    }

    const avg = (field: keyof typeof filtered[0]) =>
      Math.round(
        (filtered.reduce((a, s) => a + (Number(s[field]) || 0), 0) / totalAnalyzed) * 10,
      ) / 10;

    // Flag reason breakdown
    const flagReasons: Record<string, number> = {};
    for (const s of filtered) {
      if (s.flagged && s.flagReason) {
        for (const r of s.flagReason.split(', ')) {
          flagReasons[r] = (flagReasons[r] || 0) + 1;
        }
      }
    }

    // Score distribution buckets
    const buckets = [
      { range: '0-20', min: 0, max: 20 },
      { range: '21-40', min: 21, max: 40 },
      { range: '41-60', min: 41, max: 60 },
      { range: '61-80', min: 61, max: 80 },
      { range: '81-100', min: 81, max: 100 },
    ];
    const distribution = buckets.map((b) => ({
      range: b.range,
      count: filtered.filter((s) => s.overallScore >= b.min && s.overallScore <= b.max).length,
    }));

    return {
      totalAnalyzed,
      avgOverall: avg('overallScore'),
      avgAccuracy: avg('accuracyScore'),
      avgTone: avg('toneScore'),
      avgResolution: avg('resolutionScore'),
      avgCompliance: avg('complianceScore'),
      flaggedCount: filtered.filter((s) => s.flagged).length,
      flagReasonBreakdown: Object.entries(flagReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      scoreDistribution: distribution,
    };
  }

  /**
   * Get quality detail for a single call.
   */
  async getCallQualityDetail(callId: string, orgId: string) {
    // Get org-scoped conversation IDs to enforce tenant isolation
    const orgConversations = await this.prisma.conversation.findMany({
      where: { orgId },
      select: { conversationId: true },
    });
    const orgConvoIds = orgConversations.map((c) => c.conversationId);

    return this.prisma.callQualityScore.findFirst({
      where: {
        OR: [{ callId }, { conversationId: callId }],
        conversationId: { in: orgConvoIds },
      },
    });
  }

  /**
   * Quality trend over time for an org.
   */
  async getQualityTrend(
    orgId: string,
    period: 'daily' | 'weekly' | 'monthly' = 'daily',
    from?: string,
    to?: string,
  ): Promise<QualityTrend[]> {
    const now = new Date();
    const gte = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lte = to ? new Date(to) : now;

    const interval = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';

    // Security: whitelist-assert interval to prevent SQL injection via $queryRawUnsafe
    const VALID_INTERVALS = new Set(['day', 'week', 'month']);
    if (!VALID_INTERVALS.has(interval)) throw new Error(`Invalid SQL interval: ${interval}`);

    // Use raw SQL for efficient bucketing
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        date_trunc('${interval}', cqs.analyzed_at) AS bucket,
        ROUND(AVG(cqs.overall_score))::int          AS avg_overall,
        ROUND(AVG(cqs.accuracy_score))::int         AS avg_accuracy,
        ROUND(AVG(cqs.tone_score))::int             AS avg_tone,
        ROUND(AVG(cqs.resolution_score))::int       AS avg_resolution,
        ROUND(AVG(cqs.compliance_score))::int       AS avg_compliance,
        COUNT(CASE WHEN cqs.flagged THEN 1 END)::int AS flagged_count,
        COUNT(*)::int                                AS total_analyzed
      FROM call_quality_scores cqs
      LEFT JOIN conversations c ON c.conversation_id = cqs.conversation_id
      LEFT JOIN voice_calls vc ON vc.call_id = cqs.call_id
      WHERE (c.org_id = $1::uuid OR vc.org_id = $1::uuid)
        AND cqs.analyzed_at BETWEEN $2 AND $3
      GROUP BY 1
      ORDER BY 1
      `,
      orgId,
      gte,
      lte,
    );

    return rows.map((r: any) => ({
      bucket: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      avgOverall: Number(r.avg_overall),
      avgAccuracy: Number(r.avg_accuracy),
      avgTone: Number(r.avg_tone),
      avgResolution: Number(r.avg_resolution),
      avgCompliance: Number(r.avg_compliance),
      flaggedCount: Number(r.flagged_count),
      totalAnalyzed: Number(r.total_analyzed),
    }));
  }
}
