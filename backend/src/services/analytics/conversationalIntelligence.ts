import { PrismaClient } from '@prisma/client';

// ────────────────────────────────────────────────────────
// Conversational Intelligence — Analytics Engine
// Sections 15 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

export type Period = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface OverviewMetrics {
  totalCalls: number;
  totalConversations: number;
  aiResolved: number;
  aiResolvedPct: number;
  humanEscalated: number;
  humanEscalatedPct: number;
  avgCallDurationSec: number;
  appointmentsBooked: number;
  conversionRate: number;
  topCallDrivers: { reason: string; count: number; pct: number }[];
}

export interface TimeSeriesPoint {
  bucket: string; // ISO timestamp for the bucket start
  totalCalls: number;
  aiResolved: number;
  humanEscalated: number;
  appointmentsBooked: number;
}

export interface KnowledgeGap {
  conversationId: string;
  messageText: string;
  createdAt: Date;
  channel: string;
}

export interface CallDriverBreakdown {
  reason: string;
  count: number;
  pct: number;
  avgDurationSec: number | null;
}

export interface PatientJourneyFunnel {
  totalInbound: number;
  identified: number;
  intentDetected: number;
  resolved: number;
  appointmentBooked: number;
}

export interface RevenueImpact {
  appointmentsBooked: number;
  avgVisitValue: number;
  estimatedRevenue: number;
  periodLabel: string;
}

export interface FacilityMetrics {
  facilityId: string;
  facilityName: string;
  totalCalls: number;
  aiResolved: number;
  aiResolvedPct: number;
  appointmentsBooked: number;
  avgCallDurationSec: number;
}

// ── Well-known call drivers (matched from conversation context / summaries) ──
const CALL_DRIVERS = [
  'appointment_new',
  'appointment_reschedule',
  'appointment_cancel',
  'prescription_refill',
  'prescription_status',
  'billing_question',
  'insurance_verification',
  'physician_search',
  'location_search',
  'test_results',
  'referral_status',
  'portal_help',
  'password_reset',
  'general_question',
  'complaint',
  'emergency_triage',
  'other',
] as const;

export type CallDriver = (typeof CALL_DRIVERS)[number];

/**
 * Classify a conversation into a call-driver category using keyword heuristics
 * applied to the conversation summary / key topics / messages.
 */
export function classifyCallDriver(
  keyTopics: string[],
  summaryText: string,
): CallDriver {
  const haystack = [...keyTopics, summaryText].join(' ').toLowerCase();

  const rules: [CallDriver, RegExp][] = [
    ['appointment_new', /\b(book|schedule|new appointment|حجز|موعد جديد)\b/i],
    ['appointment_reschedule', /\b(reschedule|change appointment|تغيير موعد|إعادة جدولة)\b/i],
    ['appointment_cancel', /\b(cancel|إلغاء)\b/i],
    ['prescription_refill', /\b(refill|تعبئة|وصفة)\b/i],
    ['prescription_status', /\b(prescription status|حالة الوصفة|medication status)\b/i],
    ['billing_question', /\b(bill|invoice|payment|فاتورة|دفع)\b/i],
    ['insurance_verification', /\b(insurance|تأمين|verify insurance)\b/i],
    ['physician_search', /\b(find doctor|doctor search|ابحث عن طبيب|دكتور)\b/i],
    ['location_search', /\b(location|directions|address|عنوان|موقع)\b/i],
    ['test_results', /\b(test results|lab results|نتائج الفحص|تحليل)\b/i],
    ['referral_status', /\b(referral|تحويل)\b/i],
    ['portal_help', /\b(portal|login|password|تسجيل دخول|بوابة)\b/i],
    ['password_reset', /\b(password reset|reset password|إعادة تعيين كلمة المرور)\b/i],
    ['general_question', /\b(question|info|information|سؤال|استفسار)\b/i],
    ['complaint', /\b(complaint|شكوى|unhappy|not satisfied)\b/i],
    ['emergency_triage', /\b(emergency|urgent|طوارئ|عاجل|chest pain|ألم في الصدر)\b/i],
  ];

  for (const [driver, pattern] of rules) {
    if (pattern.test(haystack)) return driver;
  }
  return 'other';
}

// ─── Helpers ────────────────────────────────────────────

function dateRange(from?: string, to?: string): { gte: Date; lte: Date } {
  const now = new Date();
  return {
    gte: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
    lte: to ? new Date(to) : now,
  };
}

function bucketFormat(period: Period): string {
  switch (period) {
    case 'hourly':
      return 'YYYY-MM-DD HH24:00';
    case 'daily':
      return 'YYYY-MM-DD';
    case 'weekly':
      return 'IYYY-"W"IW';
    case 'monthly':
      return 'YYYY-MM';
  }
}

function truncInterval(period: Period): string {
  switch (period) {
    case 'hourly':
      return 'hour';
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
  }
}

// ─── Core analytics service ─────────────────────────────

export class ConversationalIntelligenceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Key metrics overview — the top-level dashboard numbers.
   */
  async getOverview(orgId: string, from?: string, to?: string): Promise<OverviewMetrics> {
    const range = dateRange(from, to);

    const [
      calls,
      conversations,
      handoffs,
      appointments,
      summaries,
    ] = await Promise.all([
      this.prisma.voiceCall.findMany({
        where: { orgId, startedAt: { gte: range.gte, lte: range.lte } },
        select: { callId: true, durationSec: true, status: true, conversationId: true },
      }),
      this.prisma.conversation.findMany({
        where: { orgId, createdAt: { gte: range.gte, lte: range.lte } },
        select: { conversationId: true, status: true, channel: true },
      }),
      this.prisma.handoff.findMany({
        where: {
          createdAt: { gte: range.gte, lte: range.lte },
          // filter by conversation's orgId via a sub-query would be ideal;
          // for now we fetch all in range (fleet-level view) and the route filters by org
        },
        select: { handoffId: true, conversationId: true },
      }),
      this.prisma.appointment.count({
        where: {
          orgId,
          createdAt: { gte: range.gte, lte: range.lte },
          status: { in: ['booked', 'confirmed', 'completed'] },
        },
      }),
      this.prisma.conversationSummary.findMany({
        where: {
          createdAt: { gte: range.gte, lte: range.lte },
          conversation: { orgId },
        },
        select: { keyTopics: true, summary: true },
      }),
    ]);

    const totalCalls = calls.length;
    const totalConversations = conversations.length;
    const handoffConvoIds = new Set(handoffs.map((h) => h.conversationId));
    const humanEscalated = handoffs.length;
    const aiResolved = totalConversations - humanEscalated;
    const totalForPct = totalConversations || 1;

    const durations = calls.filter((c) => c.durationSec != null).map((c) => c.durationSec!);
    const avgCallDurationSec = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // Call driver breakdown
    const driverCounts: Record<string, number> = {};
    for (const s of summaries) {
      const driver = classifyCallDriver(s.keyTopics, s.summary);
      driverCounts[driver] = (driverCounts[driver] || 0) + 1;
    }
    const totalDrivers = Object.values(driverCounts).reduce((a, b) => a + b, 0) || 1;
    const topCallDrivers = Object.entries(driverCounts)
      .map(([reason, count]) => ({
        reason,
        count,
        pct: Math.round((count / totalDrivers) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalCalls,
      totalConversations,
      aiResolved,
      aiResolvedPct: Math.round((aiResolved / totalForPct) * 1000) / 10,
      humanEscalated,
      humanEscalatedPct: Math.round((humanEscalated / totalForPct) * 1000) / 10,
      avgCallDurationSec,
      appointmentsBooked: appointments,
      conversionRate: totalConversations
        ? Math.round((appointments / totalConversations) * 1000) / 10
        : 0,
      topCallDrivers,
    };
  }

  /**
   * Time-series data for trend charts.
   */
  async getTimeSeries(
    orgId: string,
    period: Period = 'daily',
    from?: string,
    to?: string,
  ): Promise<TimeSeriesPoint[]> {
    const range = dateRange(from, to);
    const interval = truncInterval(period);

    // Raw SQL for bucketed aggregation
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        date_trunc('${interval}', vc.started_at) AS bucket,
        COUNT(*)::int                              AS total_calls,
        COUNT(CASE WHEN h.handoff_id IS NULL THEN 1 END)::int AS ai_resolved,
        COUNT(h.handoff_id)::int                   AS human_escalated,
        COUNT(DISTINCT a.appointment_id)::int      AS appointments_booked
      FROM voice_calls vc
      LEFT JOIN conversations c ON c.conversation_id = vc.conversation_id
      LEFT JOIN handoffs h ON h.conversation_id = c.conversation_id
        AND h.created_at BETWEEN $2 AND $3
      LEFT JOIN appointments a ON a.conversation_id = c.conversation_id
        AND a.status IN ('booked','confirmed','completed')
        AND a.created_at BETWEEN $2 AND $3
      WHERE vc.org_id = $1::uuid
        AND vc.started_at BETWEEN $2 AND $3
      GROUP BY 1
      ORDER BY 1
      `,
      orgId,
      range.gte,
      range.lte,
    );

    return rows.map((r: any) => ({
      bucket: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      totalCalls: Number(r.total_calls),
      aiResolved: Number(r.ai_resolved),
      humanEscalated: Number(r.human_escalated),
      appointmentsBooked: Number(r.appointments_booked),
    }));
  }

  /**
   * Knowledge gaps — messages where AI couldn't answer (escalated or low-confidence).
   * We surface the last user message before any handoff or messages with "I don't know" patterns.
   */
  async getKnowledgeGaps(
    orgId: string,
    limit = 50,
    from?: string,
    to?: string,
  ): Promise<KnowledgeGap[]> {
    const range = dateRange(from, to);

    // Approach: find conversations that resulted in handoff, then pull the last inbound message
    const handoffConversations = await this.prisma.handoff.findMany({
      where: { createdAt: { gte: range.gte, lte: range.lte } },
      select: { conversationId: true, reason: true },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    });

    const convoIds = handoffConversations.map((h) => h.conversationId);

    // Also add conversations where AI explicitly said it couldn't help
    const unsureMessages = await this.prisma.conversationMessage.findMany({
      where: {
        conversation: { orgId },
        direction: 'out',
        createdAt: { gte: range.gte, lte: range.lte },
        OR: [
          { bodyText: { contains: "I'm not sure", mode: 'insensitive' } },
          { bodyText: { contains: 'لا أعرف', mode: 'insensitive' } },
          { bodyText: { contains: "I don't have information", mode: 'insensitive' } },
          { bodyText: { contains: 'لا أملك معلومات', mode: 'insensitive' } },
          { bodyText: { contains: 'let me connect you', mode: 'insensitive' } },
        ],
      },
      select: { conversationId: true },
      take: limit,
    });

    const allConvoIds = [...new Set([...convoIds, ...unsureMessages.map((m) => m.conversationId)])];

    // For each conversation, grab the last inbound message (the question AI couldn't answer)
    const gaps: KnowledgeGap[] = [];
    for (const cId of allConvoIds.slice(0, limit)) {
      const lastInbound = await this.prisma.conversationMessage.findFirst({
        where: { conversationId: cId, direction: 'in' },
        orderBy: { createdAt: 'desc' },
        select: { bodyText: true, createdAt: true },
      });
      const conversation = await this.prisma.conversation.findUnique({
        where: { conversationId: cId },
        select: { conversationId: true, channel: true, orgId: true },
      });
      if (lastInbound?.bodyText && conversation && conversation.orgId === orgId) {
        gaps.push({
          conversationId: cId,
          messageText: lastInbound.bodyText,
          createdAt: lastInbound.createdAt,
          channel: conversation.channel,
        });
      }
    }

    return gaps.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }

  /**
   * Call driver breakdown with avg duration per category.
   */
  async getCallDriverBreakdown(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<CallDriverBreakdown[]> {
    const range = dateRange(from, to);

    const summaries = await this.prisma.conversationSummary.findMany({
      where: {
        createdAt: { gte: range.gte, lte: range.lte },
        conversation: { orgId },
      },
      select: {
        keyTopics: true,
        summary: true,
        conversationId: true,
      },
    });

    // Classify each
    const buckets: Record<string, { count: number; convoIds: string[] }> = {};
    for (const s of summaries) {
      const driver = classifyCallDriver(s.keyTopics, s.summary);
      if (!buckets[driver]) buckets[driver] = { count: 0, convoIds: [] };
      buckets[driver].count++;
      buckets[driver].convoIds.push(s.conversationId);
    }

    const total = summaries.length || 1;

    // Compute avg duration per driver via voice calls
    const convoIdToDriver: Record<string, string> = {};
    for (const [driver, b] of Object.entries(buckets)) {
      for (const cId of b.convoIds) {
        convoIdToDriver[cId] = driver;
      }
    }

    const calls = await this.prisma.voiceCall.findMany({
      where: {
        orgId,
        conversationId: { in: Object.keys(convoIdToDriver) },
      },
      select: { conversationId: true, durationSec: true },
    });

    const driverDurations: Record<string, number[]> = {};
    for (const call of calls) {
      if (call.conversationId && call.durationSec != null) {
        const driver = convoIdToDriver[call.conversationId];
        if (driver) {
          if (!driverDurations[driver]) driverDurations[driver] = [];
          driverDurations[driver].push(call.durationSec);
        }
      }
    }

    return Object.entries(buckets)
      .map(([reason, b]) => {
        const durations = driverDurations[reason] || [];
        return {
          reason,
          count: b.count,
          pct: Math.round((b.count / total) * 1000) / 10,
          avgDurationSec: durations.length
            ? Math.round(durations.reduce((a, c) => a + c, 0) / durations.length)
            : null,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Patient journey funnel: inbound → identified → intent → resolved → booked
   */
  async getPatientJourneyFunnel(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<PatientJourneyFunnel> {
    const range = dateRange(from, to);

    const [conversations, handoffs, appointments] = await Promise.all([
      this.prisma.conversation.findMany({
        where: { orgId, createdAt: { gte: range.gte, lte: range.lte } },
        select: { conversationId: true, patientId: true, status: true },
      }),
      this.prisma.handoff.findMany({
        where: { createdAt: { gte: range.gte, lte: range.lte } },
        select: { conversationId: true },
      }),
      this.prisma.appointment.count({
        where: {
          orgId,
          createdAt: { gte: range.gte, lte: range.lte },
          status: { in: ['booked', 'confirmed', 'completed'] },
          conversationId: { not: null },
        },
      }),
    ]);

    const totalInbound = conversations.length;
    const identified = conversations.filter((c) => c.patientId != null).length;
    // All conversations where at least 2 messages exist → intent detected
    const intentDetected = conversations.filter(
      (c) => c.status === 'closed' || c.status === 'handoff' || c.patientId != null,
    ).length;
    const handoffIds = new Set(handoffs.map((h) => h.conversationId));
    const resolved = conversations.filter(
      (c) => c.status === 'closed' && !handoffIds.has(c.conversationId),
    ).length;

    return {
      totalInbound,
      identified,
      intentDetected,
      resolved,
      appointmentBooked: appointments,
    };
  }

  /**
   * Revenue impact — estimated revenue from AI-booked appointments.
   */
  async getRevenueImpact(
    orgId: string,
    avgVisitValue = 350, // SAR default
    from?: string,
    to?: string,
  ): Promise<RevenueImpact> {
    const range = dateRange(from, to);

    const appointmentsBooked = await this.prisma.appointment.count({
      where: {
        orgId,
        createdAt: { gte: range.gte, lte: range.lte },
        status: { in: ['booked', 'confirmed', 'completed'] },
        bookedVia: { in: ['phone', 'whatsapp', 'web'] },
      },
    });

    return {
      appointmentsBooked,
      avgVisitValue,
      estimatedRevenue: appointmentsBooked * avgVisitValue,
      periodLabel: `${range.gte.toISOString().split('T')[0]} – ${range.lte.toISOString().split('T')[0]}`,
    };
  }

  /**
   * Per-facility metrics for fleet comparison.
   */
  async getFacilityComparison(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<FacilityMetrics[]> {
    const range = dateRange(from, to);

    const facilities = await this.prisma.facility.findMany({
      where: { orgId },
      select: { facilityId: true, name: true },
    });

    const results: FacilityMetrics[] = [];

    for (const fac of facilities) {
      const [calls, appointments, handoffs] = await Promise.all([
        this.prisma.voiceCall.findMany({
          where: {
            orgId,
            startedAt: { gte: range.gte, lte: range.lte },
            // Filter by facility via the conversation → appointment → facility chain
            // Simplified: count calls that have a conversation with appointments at this facility
          },
          select: { durationSec: true, conversationId: true },
        }),
        this.prisma.appointment.count({
          where: {
            orgId,
            facilityId: fac.facilityId,
            createdAt: { gte: range.gte, lte: range.lte },
            status: { in: ['booked', 'confirmed', 'completed'] },
          },
        }),
        this.prisma.handoff.count({
          where: {
            createdAt: { gte: range.gte, lte: range.lte },
          },
        }),
      ]);

      // For facility-level call count, use raw SQL to join through conversations → appointments
      const facilityCallRows: any[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT
          COUNT(DISTINCT vc.call_id)::int AS total_calls,
          COUNT(DISTINCT h.handoff_id)::int AS handoff_count
        FROM voice_calls vc
        INNER JOIN conversations c ON c.conversation_id = vc.conversation_id
        INNER JOIN appointments a ON a.conversation_id = c.conversation_id
          AND a.facility_id = $2::uuid
        LEFT JOIN handoffs h ON h.conversation_id = c.conversation_id
        WHERE vc.org_id = $1::uuid
          AND vc.started_at BETWEEN $3 AND $4
        `,
        orgId,
        fac.facilityId,
        range.gte,
        range.lte,
      );

      const totalCalls = Number(facilityCallRows[0]?.total_calls ?? 0);
      const facHandoffs = Number(facilityCallRows[0]?.handoff_count ?? 0);

      const aiResolved = Math.max(0, totalCalls - facHandoffs);
      const aiResPct = totalCalls > 0 ? Math.round((aiResolved / totalCalls) * 1000) / 10 : 0;

      // Avg duration for this facility's calls via raw SQL
      const durationRows: any[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT AVG(vc.duration_sec)::int AS avg_duration
        FROM voice_calls vc
        INNER JOIN conversations c ON c.conversation_id = vc.conversation_id
        INNER JOIN appointments a ON a.conversation_id = c.conversation_id
          AND a.facility_id = $2::uuid
        WHERE vc.org_id = $1::uuid
          AND vc.started_at BETWEEN $3 AND $4
          AND vc.duration_sec IS NOT NULL
        `,
        orgId,
        fac.facilityId,
        range.gte,
        range.lte,
      );
      const avgDuration = Number(durationRows[0]?.avg_duration ?? 0);

      results.push({
        facilityId: fac.facilityId,
        facilityName: fac.name,
        totalCalls,
        aiResolved,
        aiResolvedPct: aiResPct,
        appointmentsBooked: appointments,
        avgCallDurationSec: avgDuration,
      });
    }

    return results.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  /**
   * Get metrics for a single facility.
   */
  async getSingleFacilityMetrics(
    orgId: string,
    facilityId: string,
    from?: string,
    to?: string,
  ): Promise<FacilityMetrics | null> {
    const all = await this.getFacilityComparison(orgId, from, to);
    return all.find((f) => f.facilityId === facilityId) ?? null;
  }
}
