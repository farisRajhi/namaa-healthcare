import { PrismaClient } from '@prisma/client';
import {
  classifyCallDriver,
  type CallDriver,
} from './conversationalIntelligence.js';

// ────────────────────────────────────────────────────────
// Call Driver Analyzer
// Section 17 of COMPETITOR_FEATURES_SPEC.md
// ────────────────────────────────────────────────────────

export interface CallDriverSummary {
  driver: CallDriver;
  count: number;
  pct: number;
}

export interface TrendingTopic {
  driver: CallDriver;
  currentCount: number;
  previousCount: number;
  changePercent: number;
  trending: 'up' | 'down' | 'stable';
}

export interface GapDetection {
  driver: CallDriver;
  totalInteractions: number;
  handoffCount: number;
  failRate: number; // 0-100
  sampleQuestions: string[];
}

export interface OperationalRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  dataSupport: Record<string, number>;
}

// ── Helpers ─────────────────────────────────────────────

function dateRange(from?: string, to?: string): { gte: Date; lte: Date } {
  const now = new Date();
  return {
    gte: from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1),
    lte: to ? new Date(to) : now,
  };
}

function previousRange(gte: Date, lte: Date): { gte: Date; lte: Date } {
  const durationMs = lte.getTime() - gte.getTime();
  return {
    gte: new Date(gte.getTime() - durationMs),
    lte: new Date(gte.getTime() - 1),
  };
}

// ── Service ─────────────────────────────────────────────

export class CallDriverAnalyzerService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Auto-categorize all interactions in a period and return summary.
   */
  async getCategorizedDrivers(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<CallDriverSummary[]> {
    const range = dateRange(from, to);

    const summaries = await this.prisma.conversationSummary.findMany({
      where: {
        createdAt: { gte: range.gte, lte: range.lte },
        conversation: { orgId },
      },
      select: { keyTopics: true, summary: true },
    });

    const counts: Record<string, number> = {};
    for (const s of summaries) {
      const driver = classifyCallDriver(s.keyTopics, s.summary);
      counts[driver] = (counts[driver] || 0) + 1;
    }

    const total = summaries.length || 1;
    return Object.entries(counts)
      .map(([driver, count]) => ({
        driver: driver as CallDriver,
        count,
        pct: Math.round((count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Detect trending topics by comparing current period to previous period.
   */
  async getTrendingTopics(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<TrendingTopic[]> {
    const range = dateRange(from, to);
    const prev = previousRange(range.gte, range.lte);

    const [currentDrivers, previousDrivers] = await Promise.all([
      this.getCategorizedDrivers(orgId, range.gte.toISOString(), range.lte.toISOString()),
      this.getCategorizedDrivers(orgId, prev.gte.toISOString(), prev.lte.toISOString()),
    ]);

    const prevMap = new Map(previousDrivers.map((d) => [d.driver, d.count]));

    return currentDrivers.map((d) => {
      const prevCount = prevMap.get(d.driver) || 0;
      const change = prevCount > 0
        ? Math.round(((d.count - prevCount) / prevCount) * 1000) / 10
        : d.count > 0
          ? 100
          : 0;

      return {
        driver: d.driver,
        currentCount: d.count,
        previousCount: prevCount,
        changePercent: change,
        trending: change > 15 ? 'up' : change < -15 ? 'down' : 'stable',
      };
    });
  }

  /**
   * Gap detection — topics where AI fails most (highest handoff rate).
   */
  async getGapDetection(
    orgId: string,
    from?: string,
    to?: string,
    limit = 10,
  ): Promise<GapDetection[]> {
    const range = dateRange(from, to);

    // Get all summaries with their conversation IDs
    const summaries = await this.prisma.conversationSummary.findMany({
      where: {
        createdAt: { gte: range.gte, lte: range.lte },
        conversation: { orgId },
      },
      select: { keyTopics: true, summary: true, conversationId: true },
    });

    // Get handoff conversation IDs
    const handoffs = await this.prisma.handoff.findMany({
      where: { createdAt: { gte: range.gte, lte: range.lte } },
      select: { conversationId: true },
    });
    const handoffSet = new Set(handoffs.map((h) => h.conversationId));

    // Categorize and track handoffs per driver
    const driverData: Record<
      string,
      { total: number; handoffs: number; convoIds: string[] }
    > = {};

    for (const s of summaries) {
      const driver = classifyCallDriver(s.keyTopics, s.summary);
      if (!driverData[driver]) driverData[driver] = { total: 0, handoffs: 0, convoIds: [] };
      driverData[driver].total++;
      if (handoffSet.has(s.conversationId)) {
        driverData[driver].handoffs++;
        driverData[driver].convoIds.push(s.conversationId);
      }
    }

    // For each driver with failures, get sample questions
    const gaps: GapDetection[] = [];
    for (const [driver, data] of Object.entries(driverData)) {
      if (data.handoffs === 0) continue;

      const failRate = Math.round((data.handoffs / data.total) * 1000) / 10;

      // Get sample inbound messages from failed conversations
      const sampleConvos = data.convoIds.slice(0, 3);
      const sampleMessages: string[] = [];

      for (const convoId of sampleConvos) {
        const msg = await this.prisma.conversationMessage.findFirst({
          where: { conversationId: convoId, direction: 'in', bodyText: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { bodyText: true },
        });
        if (msg?.bodyText) {
          sampleMessages.push(
            msg.bodyText.length > 150 ? msg.bodyText.slice(0, 150) + '…' : msg.bodyText,
          );
        }
      }

      gaps.push({
        driver: driver as CallDriver,
        totalInteractions: data.total,
        handoffCount: data.handoffs,
        failRate,
        sampleQuestions: sampleMessages,
      });
    }

    return gaps.sort((a, b) => b.failRate - a.failRate).slice(0, limit);
  }

  /**
   * Recommendations engine — suggest operational improvements based on data patterns.
   */
  async getRecommendations(
    orgId: string,
    from?: string,
    to?: string,
  ): Promise<OperationalRecommendation[]> {
    const [drivers, gaps, trending] = await Promise.all([
      this.getCategorizedDrivers(orgId, from, to),
      this.getGapDetection(orgId, from, to),
      this.getTrendingTopics(orgId, from, to),
    ]);

    const recommendations: OperationalRecommendation[] = [];
    let idCounter = 1;

    // Rule 1: High-volume driver → suggest self-service
    const highVolume = drivers.filter((d) => d.pct > 30);
    for (const d of highVolume) {
      if (d.driver.startsWith('appointment_')) {
        recommendations.push({
          id: `rec-${idCounter++}`,
          priority: 'high',
          category: 'self_service',
          titleEn: 'Improve Online Booking Visibility',
          titleAr: 'تحسين رؤية الحجز عبر الإنترنت',
          descriptionEn: `${d.pct}% of interactions are about scheduling. Consider promoting your online booking portal to reduce call volume.`,
          descriptionAr: `${d.pct}% من التفاعلات تتعلق بالحجز. فكر في الترويج لبوابة الحجز عبر الإنترنت لتقليل حجم المكالمات.`,
          dataSupport: { schedulingPct: d.pct, schedulingCount: d.count },
        });
      }

      if (d.driver === 'portal_help' || d.driver === 'password_reset') {
        recommendations.push({
          id: `rec-${idCounter++}`,
          priority: 'high',
          category: 'it_improvement',
          titleEn: 'Add Self-Service Password Reset',
          titleAr: 'إضافة خدمة إعادة تعيين كلمة المرور الذاتية',
          descriptionEn: `${d.pct}% of calls are about portal/login issues. A self-service password reset would significantly reduce this volume.`,
          descriptionAr: `${d.pct}% من المكالمات تتعلق بمشاكل البوابة/تسجيل الدخول. خدمة إعادة تعيين كلمة المرور الذاتية ستقلل هذا الحجم بشكل كبير.`,
          dataSupport: { portalHelpPct: d.pct, portalHelpCount: d.count },
        });
      }
    }

    // Rule 2: High failure rate in a driver → improve FAQ / knowledge base
    const highFail = gaps.filter((g) => g.failRate > 40 && g.totalInteractions >= 5);
    for (const g of highFail) {
      recommendations.push({
        id: `rec-${idCounter++}`,
        priority: 'high',
        category: 'knowledge_base',
        titleEn: `Improve AI Training for "${g.driver}" Topics`,
        titleAr: `تحسين تدريب الذكاء الاصطناعي لمواضيع "${g.driver}"`,
        descriptionEn: `AI fails ${g.failRate}% of the time on "${g.driver}" questions (${g.handoffCount} out of ${g.totalInteractions}). Add FAQ entries or retrain the model on these topics.`,
        descriptionAr: `يفشل الذكاء الاصطناعي ${g.failRate}% من الوقت في أسئلة "${g.driver}" (${g.handoffCount} من ${g.totalInteractions}). أضف أسئلة شائعة أو أعد تدريب النموذج على هذه المواضيع.`,
        dataSupport: {
          failRate: g.failRate,
          handoffCount: g.handoffCount,
          totalInteractions: g.totalInteractions,
        },
      });
    }

    // Rule 3: Trending up topics → prepare capacity
    const spiking = trending.filter((t) => t.trending === 'up' && t.changePercent > 50);
    for (const t of spiking) {
      recommendations.push({
        id: `rec-${idCounter++}`,
        priority: 'medium',
        category: 'capacity_planning',
        titleEn: `"${t.driver}" Calls Increased ${t.changePercent}%`,
        titleAr: `مكالمات "${t.driver}" زادت بنسبة ${t.changePercent}%`,
        descriptionEn: `"${t.driver}" interactions spiked from ${t.previousCount} to ${t.currentCount} (${t.changePercent}% increase). Investigate root cause and ensure adequate capacity.`,
        descriptionAr: `تفاعلات "${t.driver}" ارتفعت من ${t.previousCount} إلى ${t.currentCount} (زيادة ${t.changePercent}%). تحقق من السبب الجذري وتأكد من القدرة الكافية.`,
        dataSupport: {
          currentCount: t.currentCount,
          previousCount: t.previousCount,
          changePercent: t.changePercent,
        },
      });
    }

    return recommendations.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      return prio[a.priority] - prio[b.priority];
    });
  }
}
