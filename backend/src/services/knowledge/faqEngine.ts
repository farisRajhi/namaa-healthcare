import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────
// FAQ & Triage Engine
// Knowledge base search, org-specific FAQs, symptom triage,
// red-flag detection, operating hours, pre-visit info
// ─────────────────────────────────────────────────────────

export type FaqCategory = 'general' | 'insurance' | 'procedures' | 'locations' | 'policies';
export type TriageSeverity = 'emergency' | 'urgent' | 'routine';
export type TriageAction = 'call_emergency' | 'schedule_urgent' | 'schedule_routine' | 'transfer_nurse';

/** Red-flag symptoms that always trigger emergency suggestion */
const RED_FLAG_SYMPTOMS: Array<{ keywords: string[]; keywordsAr: string[] }> = [
  { keywords: ['chest pain', 'heart attack', 'cardiac arrest'],                    keywordsAr: ['ألم في الصدر', 'نوبة قلبية', 'سكتة قلبية'] },
  { keywords: ['difficulty breathing', 'cannot breathe', 'shortness of breath'],    keywordsAr: ['صعوبة في التنفس', 'ضيق تنفس', 'ما أقدر أتنفس'] },
  { keywords: ['stroke', 'face drooping', 'slurred speech', 'sudden numbness'],     keywordsAr: ['جلطة', 'تنميل مفاجئ', 'ثقل في الوجه', 'تلعثم'] },
  { keywords: ['severe bleeding', 'uncontrolled bleeding', 'hemorrhage'],           keywordsAr: ['نزيف شديد', 'نزيف حاد', 'نزف'] },
  { keywords: ['unconscious', 'unresponsive', 'fainted', 'passed out'],             keywordsAr: ['فقدان الوعي', 'إغماء', 'ما يرد'] },
  { keywords: ['suicidal', 'self harm', 'want to die', 'kill myself'],              keywordsAr: ['انتحار', 'إيذاء النفس', 'أبي أموت'] },
  { keywords: ['poisoning', 'overdose', 'swallowed chemicals'],                     keywordsAr: ['تسمم', 'جرعة زائدة', 'بلع مواد كيميائية'] },
  { keywords: ['seizure', 'convulsions', 'fitting'],                                keywordsAr: ['تشنج', 'صرع', 'نوبة'] },
  { keywords: ['severe head injury', 'head trauma'],                                keywordsAr: ['إصابة بالرأس', 'صدمة في الرأس'] },
  { keywords: ['anaphylaxis', 'severe allergic reaction', 'throat swelling'],       keywordsAr: ['حساسية شديدة', 'تورم الحلق', 'صدمة تحسسية'] },
];

const EMERGENCY_RESPONSE = {
  en: 'This sounds like it could be a medical emergency. If severe or sudden, please call 997 (Saudi emergency) or 911 immediately. Do NOT delay.',
  ar: 'هذا يبدو أنه قد يكون حالة طوارئ طبية. إذا كانت الأعراض شديدة أو مفاجئة، يرجى الاتصال بـ 997 (طوارئ السعودية) أو 911 فوراً. لا تتأخر.',
};

export interface TriageResult {
  severity: TriageSeverity;
  action: TriageAction;
  responseEn: string;
  responseAr: string;
  isRedFlag: boolean;
  matchedKeywords: string[];
  ruleId?: string;
}

export interface FaqSearchResult {
  faqId: string;
  category: string;
  questionEn: string;
  questionAr: string;
  answerEn: string;
  answerAr: string;
  score: number;
}

// ─────────────────────────────────────────────────────────
export class FaqEngine {
  constructor(private prisma: PrismaClient) {}

  // ───── List FAQs for an org (with optional category filter) ─────
  async listByOrg(orgId: string, opts?: {
    category?: FaqCategory;
    activeOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = {
      orgId,
      ...(opts?.category && { category: opts.category }),
      ...(opts?.activeOnly !== false && { isActive: true }),
    };

    const [entries, total] = await Promise.all([
      this.prisma.faqEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'desc' }, { viewCount: 'desc' }],
      }),
      this.prisma.faqEntry.count({ where }),
    ]);

    return {
      data: entries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ───── Create FAQ entry ─────
  async create(data: {
    orgId: string;
    category: FaqCategory;
    questionEn: string;
    questionAr: string;
    answerEn: string;
    answerAr: string;
    priority?: number;
  }) {
    return this.prisma.faqEntry.create({
      data: {
        orgId: data.orgId,
        category: data.category,
        questionEn: data.questionEn,
        questionAr: data.questionAr,
        answerEn: data.answerEn,
        answerAr: data.answerAr,
        priority: data.priority ?? 0,
        isActive: true,
        viewCount: 0,
      },
    });
  }

  // ───── Update FAQ entry ─────
  async update(faqId: string, data: {
    category?: FaqCategory;
    questionEn?: string;
    questionAr?: string;
    answerEn?: string;
    answerAr?: string;
    priority?: number;
    isActive?: boolean;
  }) {
    return this.prisma.faqEntry.update({
      where: { faqId },
      data: {
        ...(data.category !== undefined && { category: data.category }),
        ...(data.questionEn !== undefined && { questionEn: data.questionEn }),
        ...(data.questionAr !== undefined && { questionAr: data.questionAr }),
        ...(data.answerEn !== undefined && { answerEn: data.answerEn }),
        ...(data.answerAr !== undefined && { answerAr: data.answerAr }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  // ───── Delete FAQ entry ─────
  async delete(faqId: string) {
    return this.prisma.faqEntry.delete({ where: { faqId } });
  }

  // ───── Keyword search (Arabic + English) ─────
  async search(orgId: string, query: string, opts?: { category?: FaqCategory; lang?: 'en' | 'ar'; limit?: number }): Promise<FaqSearchResult[]> {
    const limit = opts?.limit ?? 10;
    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(t => t.length > 2);

    if (queryTokens.length === 0) return [];

    // Fetch candidate FAQs for this org
    const candidates = await this.prisma.faqEntry.findMany({
      where: {
        orgId,
        isActive: true,
        ...(opts?.category && { category: opts.category }),
      },
      orderBy: [{ priority: 'desc' }, { viewCount: 'desc' }],
      take: 200, // cap to avoid memory issues
    });

    // Score each candidate
    const scored: FaqSearchResult[] = [];

    for (const faq of candidates) {
      let score = 0;

      const questionEnLower = faq.questionEn.toLowerCase();
      const questionArLower = faq.questionAr.toLowerCase();
      const answerEnLower = faq.answerEn.toLowerCase();
      const answerArLower = faq.answerAr.toLowerCase();

      // Exact substring match in question (highest weight)
      if (questionEnLower.includes(normalizedQuery) || questionArLower.includes(normalizedQuery)) {
        score += 10;
      }

      // Exact substring match in answer
      if (answerEnLower.includes(normalizedQuery) || answerArLower.includes(normalizedQuery)) {
        score += 5;
      }

      // Token-level matches
      for (const token of queryTokens) {
        if (questionEnLower.includes(token) || questionArLower.includes(token)) {
          score += 3;
        }
        if (answerEnLower.includes(token) || answerArLower.includes(token)) {
          score += 1;
        }
      }

      // Boost by priority
      score += faq.priority * 0.5;

      if (score > 0) {
        scored.push({
          faqId: faq.faqId,
          category: faq.category,
          questionEn: faq.questionEn,
          questionAr: faq.questionAr,
          answerEn: faq.answerEn,
          answerAr: faq.answerAr,
          score,
        });
      }
    }

    // Sort by score descending, return top results
    scored.sort((a, b) => b.score - a.score);

    // Increment view count for top results
    const topIds = scored.slice(0, limit).map(r => r.faqId);
    if (topIds.length > 0) {
      // Fire-and-forget update
      this.prisma.faqEntry.updateMany({
        where: { faqId: { in: topIds } },
        data: { viewCount: { increment: 1 } },
      }).catch(() => { /* non-critical */ });
    }

    return scored.slice(0, limit);
  }

  // ───── Symptom triage ─────
  async triageSymptoms(orgId: string, symptomText: string): Promise<TriageResult> {
    const textLower = symptomText.toLowerCase();

    // 1. Check red flag symptoms first (always highest priority)
    for (const flag of RED_FLAG_SYMPTOMS) {
      const matchedEn = flag.keywords.filter(kw => textLower.includes(kw));
      const matchedAr = flag.keywordsAr.filter(kw => textLower.includes(kw));
      const allMatched = [...matchedEn, ...matchedAr];

      if (allMatched.length > 0) {
        return {
          severity: 'emergency',
          action: 'call_emergency',
          responseEn: EMERGENCY_RESPONSE.en,
          responseAr: EMERGENCY_RESPONSE.ar,
          isRedFlag: true,
          matchedKeywords: allMatched,
        };
      }
    }

    // 2. Check org-specific triage rules
    const rules = await this.prisma.triageRule.findMany({
      where: { orgId, isActive: true },
    });

    // Score each rule against the symptom text
    let bestRule: typeof rules[number] | null = null;
    let bestMatchCount = 0;
    let bestMatchedKeywords: string[] = [];

    for (const rule of rules) {
      const matched = rule.keywords.filter(kw => textLower.includes(kw.toLowerCase()));
      if (matched.length > bestMatchCount) {
        bestMatchCount = matched.length;
        bestRule = rule;
        bestMatchedKeywords = matched;
      }
    }

    if (bestRule) {
      return {
        severity: bestRule.severity as TriageSeverity,
        action: bestRule.action as TriageAction,
        responseEn: bestRule.responseEn,
        responseAr: bestRule.responseAr,
        isRedFlag: false,
        matchedKeywords: bestMatchedKeywords,
        ruleId: bestRule.ruleId,
      };
    }

    // 3. Fallback: routine
    return {
      severity: 'routine',
      action: 'schedule_routine',
      responseEn: 'Based on what you described, I recommend scheduling a regular appointment with your doctor. Would you like me to help with that?',
      responseAr: 'بناءً على ما وصفت، أنصح بحجز موعد عادي مع طبيبك. هل تود مساعدتك في ذلك؟',
      isRedFlag: false,
      matchedKeywords: [],
    };
  }

  // ───── Triage rules CRUD ─────
  async listTriageRules(orgId: string) {
    return this.prisma.triageRule.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTriageRule(data: {
    orgId: string;
    keywords: string[];
    severity: TriageSeverity;
    responseEn: string;
    responseAr: string;
    action: TriageAction;
  }) {
    return this.prisma.triageRule.create({
      data: {
        orgId: data.orgId,
        keywords: data.keywords,
        severity: data.severity,
        responseEn: data.responseEn,
        responseAr: data.responseAr,
        action: data.action,
        isActive: true,
      },
    });
  }

  async updateTriageRule(ruleId: string, data: Partial<{
    keywords: string[];
    severity: TriageSeverity;
    responseEn: string;
    responseAr: string;
    action: TriageAction;
    isActive: boolean;
  }>) {
    return this.prisma.triageRule.update({
      where: { ruleId },
      data,
    });
  }

  // ───── Operating hours helper ─────
  async getOperatingHours(facilityId: string): Promise<{
    businessHours: Record<string, { open: string; close: string }> | null;
    isOpenNow: boolean;
    currentDayHours: { open: string; close: string } | null;
  }> {
    const config = await this.prisma.facilityConfig.findUnique({
      where: { facilityId },
    });

    if (!config?.businessHours) {
      return { businessHours: null, isOpenNow: false, currentDayHours: null };
    }

    const hours = config.businessHours as Record<string, { open: string; close: string }>;
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = dayNames[now.getDay()];
    const currentDayHours = hours[today] ?? null;

    let isOpenNow = false;
    if (currentDayHours) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const [openH, openM] = currentDayHours.open.split(':').map(Number);
      const [closeH, closeM] = currentDayHours.close.split(':').map(Number);
      const openMin = openH * 60 + openM;
      const closeMin = closeH * 60 + closeM;
      isOpenNow = nowMinutes >= openMin && nowMinutes < closeMin;
    }

    return { businessHours: hours, isOpenNow, currentDayHours };
  }

  // ───── Pre-visit info by service type ─────
  async getPreVisitInfo(orgId: string, serviceType: string): Promise<FaqSearchResult[]> {
    return this.search(orgId, `pre-visit ${serviceType} preparation`, {
      category: 'procedures',
      limit: 5,
    });
  }
}
