import { PrismaClient } from '@prisma/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AppointmentStats {
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
}

interface FrequencyItem {
  id: string;
  count: number;
}

// ─── InsightBuilder ────────────────────────────────────────────────────────────

export class InsightBuilder {
  constructor(private prisma: PrismaClient) {}

  /**
   * Recompute insights for a single patient
   */
  async rebuildInsight(patientId: string, orgId: string): Promise<void> {
    // 1. Appointment stats
    const appointments = await this.prisma.appointment.findMany({
      where: { patientId, orgId },
      select: {
        status: true,
        serviceId: true,
        providerId: true,
        startTs: true,
        bookedVia: true,
      },
    });

    const stats: AppointmentStats = { total: 0, completed: 0, noShow: 0, cancelled: 0 };
    const serviceFreq: Map<string, number> = new Map();
    const providerFreq: Map<string, number> = new Map();
    const dayFreq: Map<number, number> = new Map();
    const hourBuckets = { morning: 0, afternoon: 0, evening: 0 };

    for (const appt of appointments) {
      stats.total++;
      if (appt.status === 'completed') stats.completed++;
      else if (appt.status === 'no_show') stats.noShow++;
      else if (appt.status === 'cancelled') stats.cancelled++;

      // Only count completed appointments for preference analysis
      if (appt.status === 'completed') {
        serviceFreq.set(appt.serviceId, (serviceFreq.get(appt.serviceId) || 0) + 1);
        providerFreq.set(appt.providerId, (providerFreq.get(appt.providerId) || 0) + 1);

        const dayOfWeek = appt.startTs.getDay();
        dayFreq.set(dayOfWeek, (dayFreq.get(dayOfWeek) || 0) + 1);

        const hour = appt.startTs.getHours();
        if (hour < 12) hourBuckets.morning++;
        else if (hour < 17) hourBuckets.afternoon++;
        else hourBuckets.evening++;
      }
    }

    const completionRate = stats.total > 0 ? stats.completed / stats.total : 0;

    // Top 3 preferred services and providers
    const preferredServiceIds = this.topN(serviceFreq, 3);
    const preferredProviderIds = this.topN(providerFreq, 3);

    // Most frequent day of week
    const preferredDayOfWeek = this.topEntry(dayFreq);

    // Most frequent time slot
    const preferredTimeSlot = this.topTimeSlot(hourBuckets);

    // 2. Conversation stats
    const conversationAgg = await this.prisma.conversation.aggregate({
      where: { patientId, orgId },
      _count: { conversationId: true },
      _max: { lastActivityAt: true },
    });

    const totalConversations = conversationAgg._count.conversationId;
    const lastInteractionAt = conversationAgg._max.lastActivityAt;

    // 3. Channel preference from conversations
    const channelCounts = await this.prisma.conversation.groupBy({
      by: ['channel'],
      where: { patientId, orgId },
      _count: { conversationId: true },
      orderBy: { _count: { conversationId: 'desc' } },
      take: 1,
    });

    const channelPreference = channelCounts.length > 0 ? channelCounts[0].channel : null;

    // 4. Engagement score
    const engagementScore = this.computeEngagementScore({
      completionRate,
      totalAppointments: stats.total,
      totalConversations,
      noShowCount: stats.noShow,
      lastInteractionAt,
    });

    // 5. Return likelihood score
    const completedAppts = appointments
      .filter(a => a.status === 'completed')
      .sort((a, b) => a.startTs.getTime() - b.startTs.getTime());

    const returnResult = await this.computeReturnLikelihood(patientId, completedAppts);

    // 6. Upsert insight
    await this.prisma.patientInsight.upsert({
      where: { patientId },
      update: {
        orgId,
        totalAppointments: stats.total,
        completedAppointments: stats.completed,
        noShowCount: stats.noShow,
        cancelledCount: stats.cancelled,
        completionRate: Math.round(completionRate * 100) / 100,
        preferredServiceIds,
        preferredProviderIds,
        preferredDayOfWeek,
        preferredTimeSlot,
        channelPreference,
        engagementScore,
        returnLikelihood: returnResult.score,
        avgVisitIntervalDays: returnResult.avgIntervalDays,
        lastScoreFactors: returnResult.factors as any,
        lastInteractionAt,
        totalConversations,
        lifetimeValue: stats.completed,
        updatedAt: new Date(),
      },
      create: {
        patientId,
        orgId,
        totalAppointments: stats.total,
        completedAppointments: stats.completed,
        noShowCount: stats.noShow,
        cancelledCount: stats.cancelled,
        completionRate: Math.round(completionRate * 100) / 100,
        preferredServiceIds,
        preferredProviderIds,
        preferredDayOfWeek,
        preferredTimeSlot,
        channelPreference,
        engagementScore,
        returnLikelihood: returnResult.score,
        avgVisitIntervalDays: returnResult.avgIntervalDays,
        lastScoreFactors: returnResult.factors as any,
        lastInteractionAt,
        totalConversations,
        lifetimeValue: stats.completed,
      },
    });
  }

  /**
   * Batch recompute insights for all patients in an org
   */
  async rebuildAllInsights(orgId: string): Promise<number> {
    const patients = await this.prisma.patient.findMany({
      where: { orgId },
      select: { patientId: true },
    });

    let count = 0;
    for (const patient of patients) {
      try {
        await this.rebuildInsight(patient.patientId, orgId);
        count++;
      } catch (err) {
        console.error(`[InsightBuilder] Failed to rebuild insight for patient ${patient.patientId}:`, err);
      }
    }

    return count;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private computeEngagementScore(data: {
    completionRate: number;
    totalAppointments: number;
    totalConversations: number;
    noShowCount: number;
    lastInteractionAt: Date | null;
  }): number {
    let score = 0;

    // Completion rate: 30 points max
    score += data.completionRate * 30;

    // Recency: 25 points max (decays over 180 days)
    if (data.lastInteractionAt) {
      const daysSince = (Date.now() - data.lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 25 * (1 - daysSince / 180));
    }

    // Total appointments: 20 points max (caps at 20 appointments)
    score += Math.min(20, data.totalAppointments);

    // Conversation frequency: 15 points max (caps at 15 conversations)
    score += Math.min(15, data.totalConversations);

    // No-show penalty: -10 points max
    score -= Math.min(10, data.noShowCount * 5);

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Compute return likelihood score (0-100).
   *
   * Factors:
   *   1. Visit cadence consistency     → 0-25 pts (sticks to their interval)
   *   2. Recency relative to cadence   → 0-25 pts (overdue = lower score)
   *   3. Trend direction               → 0-15 pts (intervals shrinking vs growing)
   *   4. Campaign responsiveness       → 0-15 pts (booked after campaigns, redeemed offers)
   *   5. Active treatment course       → 0-10 pts (has future appointments)
   *   6. Recent no-show penalty        → -10 pts (no-shows in last 90 days)
   */
  private async computeReturnLikelihood(
    patientId: string,
    completedAppts: Array<{ startTs: Date; serviceId: string }>,
  ): Promise<{ score: number; avgIntervalDays: number | null; factors: Record<string, number> }> {
    const factors: Record<string, number> = {};
    let totalScore = 0;

    // ── Factor 1: Visit cadence consistency (0-25) ──
    // Calculate intervals between consecutive completed visits
    const intervals: number[] = [];
    for (let i = 1; i < completedAppts.length; i++) {
      const days = (completedAppts[i].startTs.getTime() - completedAppts[i - 1].startTs.getTime())
        / (1000 * 60 * 60 * 24);
      if (days > 0) intervals.push(days);
    }

    let avgIntervalDays: number | null = null;

    if (intervals.length >= 2) {
      avgIntervalDays = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
      // Consistency = low variance relative to mean
      const variance = intervals.reduce((s, v) => s + Math.pow(v - avgIntervalDays!, 2), 0) / intervals.length;
      const coeffOfVariation = avgIntervalDays > 0 ? Math.sqrt(variance) / avgIntervalDays : 1;
      // CV = 0 → perfect consistency (25 pts), CV >= 1 → no consistency (0 pts)
      const cadencePoints = Math.round(Math.max(0, 25 * (1 - coeffOfVariation)));
      factors.cadence_consistency = cadencePoints;
      totalScore += cadencePoints;
    } else if (completedAppts.length === 1) {
      // Single visit — moderate cadence score
      factors.cadence_consistency = 10;
      totalScore += 10;
    } else {
      factors.cadence_consistency = 0;
    }

    // ── Factor 2: Recency relative to personal cadence (0-25) ──
    if (completedAppts.length > 0) {
      const lastVisit = completedAppts[completedAppts.length - 1].startTs;
      const daysSinceLast = (Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24);

      if (avgIntervalDays && avgIntervalDays > 0) {
        // How overdue are they? 0% overdue = full points, 100%+ overdue = zero
        const overdueRatio = Math.max(0, daysSinceLast - avgIntervalDays) / avgIntervalDays;
        const recencyPoints = Math.round(Math.max(0, 25 * (1 - overdueRatio)));
        factors.recency_vs_cadence = recencyPoints;
        totalScore += recencyPoints;
      } else {
        // No cadence established — use absolute recency (180-day decay)
        const recencyPoints = Math.round(Math.max(0, 25 * (1 - daysSinceLast / 180)));
        factors.recency_vs_cadence = recencyPoints;
        totalScore += recencyPoints;
      }
    } else {
      factors.recency_vs_cadence = 0;
    }

    // ── Factor 3: Trend direction (0-15) ──
    // Compare last 3 intervals: are they getting shorter (good) or longer (bad)?
    if (intervals.length >= 3) {
      const recent = intervals.slice(-3);
      // Compare each interval to the previous — count improvements vs declines
      let improvements = 0;
      let declines = 0;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i] < recent[i - 1]) improvements++;
        else if (recent[i] > recent[i - 1]) declines++;
      }
      // +15 if improving, +8 if stable, +0 if declining
      if (improvements > declines) {
        factors.trend_direction = 15;
      } else if (improvements === declines) {
        factors.trend_direction = 8;
      } else {
        factors.trend_direction = 0;
      }
      totalScore += factors.trend_direction;
    } else if (intervals.length >= 1) {
      // Too few intervals to determine trend — neutral
      factors.trend_direction = 8;
      totalScore += 8;
    } else {
      factors.trend_direction = 0;
    }

    // ── Factor 4: Campaign responsiveness (0-15) ──
    // Did the patient book after receiving a campaign? Has redeemed offers?
    const [campaignBookings, offerRedemptions] = await Promise.all([
      this.prisma.campaignTarget.count({
        where: { patientId, status: 'booked' },
      }),
      this.prisma.offerRedemption.count({
        where: { patientId, status: { in: ['confirmed', 'completed'] } },
      }),
    ]);

    const responsivenessPoints = Math.min(15,
      (campaignBookings > 0 ? 8 : 0) + Math.min(7, offerRedemptions * 3),
    );
    factors.campaign_responsiveness = responsivenessPoints;
    totalScore += responsivenessPoints;

    // ── Factor 5: Active treatment course (0-10) ──
    // Has future booked/confirmed appointments = very likely to return
    const futureAppts = await this.prisma.appointment.count({
      where: {
        patientId,
        status: { in: ['booked', 'confirmed'] },
        startTs: { gt: new Date() },
      },
    });

    const coursePoints = futureAppts > 0 ? 10 : 0;
    factors.active_treatment = coursePoints;
    totalScore += coursePoints;

    // ── Factor 6: Recent no-show penalty (-10) ──
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentNoShows = await this.prisma.appointment.count({
      where: {
        patientId,
        status: 'no_show',
        startTs: { gte: ninetyDaysAgo },
      },
    });

    const noShowPenalty = Math.min(10, recentNoShows * 5);
    factors.recent_noshow_penalty = -noShowPenalty;
    totalScore -= noShowPenalty;

    const score = Math.round(Math.max(0, Math.min(100, totalScore)));

    return {
      score,
      avgIntervalDays,
      factors,
    };
  }

  private topN(freq: Map<string, number>, n: number): string[] {
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => id);
  }

  private topEntry(freq: Map<number, number>): number | null {
    if (freq.size === 0) return null;
    let maxKey = 0;
    let maxVal = 0;
    for (const [key, val] of freq) {
      if (val > maxVal) {
        maxVal = val;
        maxKey = key;
      }
    }
    return maxKey;
  }

  private topTimeSlot(buckets: { morning: number; afternoon: number; evening: number }): string | null {
    const { morning, afternoon, evening } = buckets;
    if (morning === 0 && afternoon === 0 && evening === 0) return null;
    if (morning >= afternoon && morning >= evening) return 'morning';
    if (afternoon >= evening) return 'afternoon';
    return 'evening';
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

let _instance: InsightBuilder | null = null;

export function getInsightBuilder(prisma: PrismaClient): InsightBuilder {
  if (!_instance) {
    _instance = new InsightBuilder(prisma);
  }
  return _instance;
}
