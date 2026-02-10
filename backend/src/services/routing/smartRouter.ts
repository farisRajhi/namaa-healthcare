import { PrismaClient } from '@prisma/client';
import { getLLMService, ChatMessage } from '../llm.js';
import { CallerIntent } from '../voice/callRouter.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  action: 'continue' | 'transfer' | 'notify' | 'escalate';
  targetType: string | null; // department | agent | phone_number | queue
  targetValue: string | null;
  reason: string;
  summary: string | null;
  priority: number;
  isAfterHours: boolean;
}

export interface HandoffRequest {
  conversationId: string;
  reason: string;
  callerPhone: string;
  patientId: string | null;
  intent: CallerIntent | null;
  verificationLevel: number;
  conversationHistory: Array<{ role: string; content: string }>;
}

export interface HandoffResult {
  handoffId: string;
  summary: string;
  patientContext: Record<string, unknown>;
  assignedTo: string | null;
  status: string;
}

export interface AgentSuggestion {
  type: 'response' | 'action' | 'info';
  content: string;
  contentAr: string;
  confidence: number;
}

export interface SentimentAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative' | 'angry';
  score: number; // -1.0 to 1.0
  triggers: string[];
}

// ─── Default routing table ──────────────────────────────────────────────────────

const DEFAULT_ROUTING_TABLE: Record<CallerIntent, { department: string; queue: string }> = {
  scheduling: { department: 'Booking Team', queue: 'scheduling_queue' },
  prescription: { department: 'Pharmacy', queue: 'pharmacy_queue' },
  physician_search: { department: 'Patient Services', queue: 'general_queue' },
  faq: { department: 'Information Desk', queue: 'general_queue' },
  billing: { department: 'Finance', queue: 'billing_queue' },
  urgent: { department: 'Nurse Hotline', queue: 'urgent_queue' },
  it_support: { department: 'IT Support', queue: 'it_queue' },
  unknown: { department: 'General', queue: 'general_queue' },
};

// Business hours (Saudi Arabia defaults — Sun-Thu)
const DEFAULT_BUSINESS_HOURS: Record<number, { open: string; close: string } | null> = {
  0: { open: '08:00', close: '22:00' }, // Sunday
  1: { open: '08:00', close: '22:00' }, // Monday
  2: { open: '08:00', close: '22:00' }, // Tuesday
  3: { open: '08:00', close: '22:00' }, // Wednesday
  4: { open: '08:00', close: '22:00' }, // Thursday
  5: null, // Friday — closed
  6: { open: '09:00', close: '21:00' }, // Saturday
};

// Angry/frustration keyword detection
const ANGER_KEYWORDS = [
  'مستحيل', 'سخيف', 'غضبان', 'زعلان', 'ما ينفع', 'ما يصلح', 'خربان', 'سيء',
  'أسوأ', 'مقرف', 'ridiculous', 'unacceptable', 'terrible', 'horrible', 'worst',
  'angry', 'furious', 'disgusted', 'incompetent', 'waste of time', 'never again',
  'complaint', 'شكوى', 'مدير', 'مسؤول', 'supervisor', 'manager',
];

// ─── Smart Router ───────────────────────────────────────────────────────────────

export class SmartRouter {
  constructor(private prisma: PrismaClient) {}

  // ─── Escalation rules engine ──────────────────────────────────────────────

  /**
   * Evaluate all active escalation rules for the given org and context.
   * Returns the highest-priority matching rule's routing decision.
   */
  async evaluateEscalationRules(
    orgId: string,
    context: {
      intent?: CallerIntent | null;
      sentiment?: SentimentAnalysis;
      confidence?: number;
      utterance?: string;
      patientRequestedHuman?: boolean;
      failedAttempts?: number;
    },
  ): Promise<RoutingDecision> {
    const rules = await this.prisma.escalationRule.findMany({
      where: { orgId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    const isAfterHours = this.isAfterHours();

    for (const rule of rules) {
      // Filter by schedule if present
      if (rule.schedule) {
        const schedule = rule.schedule as Record<string, unknown>;
        if (schedule.afterHours === true && !isAfterHours) continue;
        if (schedule.afterHours === false && isAfterHours) continue;
      }

      const matched = this.matchesTrigger(rule.triggerType, rule.triggerValue, context);
      if (!matched) continue;

      return {
        action: rule.action as RoutingDecision['action'],
        targetType: rule.targetType,
        targetValue: rule.targetValue,
        reason: `Matched rule: ${rule.triggerType}=${rule.triggerValue}`,
        summary: null,
        priority: rule.priority,
        isAfterHours,
      };
    }

    // No rule matched — continue with AI
    return {
      action: 'continue',
      targetType: null,
      targetValue: null,
      reason: 'No escalation rule matched',
      summary: null,
      priority: 0,
      isAfterHours,
    };
  }

  /**
   * Check whether a specific trigger matches the current context.
   */
  private matchesTrigger(
    triggerType: string,
    triggerValue: string,
    context: {
      intent?: CallerIntent | null;
      sentiment?: SentimentAnalysis;
      confidence?: number;
      utterance?: string;
      patientRequestedHuman?: boolean;
      failedAttempts?: number;
    },
  ): boolean {
    switch (triggerType) {
      case 'intent':
        return context.intent === triggerValue;

      case 'sentiment': {
        if (!context.sentiment) return false;
        // e.g. triggerValue = "angry_3x" or "negative"
        if (triggerValue === 'angry') return context.sentiment.sentiment === 'angry';
        if (triggerValue === 'negative') return context.sentiment.score < -0.5;
        return context.sentiment.sentiment === triggerValue;
      }

      case 'confidence': {
        if (context.confidence === undefined) return false;
        const threshold = parseFloat(triggerValue);
        return !isNaN(threshold) && context.confidence < threshold;
      }

      case 'keyword': {
        if (!context.utterance) return false;
        const lower = context.utterance.toLowerCase();
        return lower.includes(triggerValue.toLowerCase());
      }

      case 'patient_request':
        return context.patientRequestedHuman === true;

      case 'failed_attempts': {
        const maxAttempts = parseInt(triggerValue, 10);
        return !isNaN(maxAttempts) && (context.failedAttempts ?? 0) >= maxAttempts;
      }

      default:
        return false;
    }
  }

  // ─── Intent-based routing ─────────────────────────────────────────────────

  /**
   * Get the default routing target for a given intent.
   */
  getRoutingTarget(intent: CallerIntent): { department: string; queue: string } {
    return DEFAULT_ROUTING_TABLE[intent] ?? DEFAULT_ROUTING_TABLE.unknown;
  }

  // ─── Warm handoff ────────────────────────────────────────────────────────

  /**
   * Perform a warm handoff: generate summary, create Handoff record, return
   * context for the receiving agent.
   */
  async warmHandoff(request: HandoffRequest): Promise<HandoffResult> {
    const summary = await this.generateConversationSummary(request);
    const patientContext = await this.buildPatientContext(request);

    // Determine target based on intent
    const target = request.intent
      ? this.getRoutingTarget(request.intent)
      : { department: 'General', queue: 'general_queue' };

    const handoff = await this.prisma.handoff.create({
      data: {
        conversationId: request.conversationId,
        reason: request.reason,
        summary,
        patientContext: patientContext as any,
        assignedTo: target.department,
        status: 'pending',
      },
    });

    return {
      handoffId: handoff.handoffId,
      summary,
      patientContext,
      assignedTo: target.department,
      status: 'pending',
    };
  }

  /**
   * Accept a handoff (agent picks up)
   */
  async acceptHandoff(handoffId: string, agentId: string): Promise<void> {
    await this.prisma.handoff.update({
      where: { handoffId },
      data: {
        status: 'accepted',
        assignedTo: agentId,
        acceptedAt: new Date(),
        waitTimeSec: Math.round(
          (Date.now() -
            (
              await this.prisma.handoff.findUnique({
                where: { handoffId },
                select: { createdAt: true },
              })
            )!.createdAt.getTime()) /
            1000,
        ),
      },
    });
  }

  /**
   * Complete a handoff
   */
  async completeHandoff(handoffId: string): Promise<void> {
    await this.prisma.handoff.update({
      where: { handoffId },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  // ─── Agent assist (real-time suggestions) ─────────────────────────────────

  /**
   * Generate real-time suggestions for a human agent who has taken over the call.
   */
  async getAgentSuggestions(
    conversationId: string,
    latestUtterance: string,
  ): Promise<AgentSuggestion[]> {
    const llm = getLLMService();

    const systemPrompt = `You are an AI assistant helping a human call center agent at a healthcare facility in Saudi Arabia.
Given the patient's latest message, provide 1-3 short suggestions for how the agent should respond or what action to take.
Respond in JSON array format: [{"type":"response"|"action"|"info","content":"English text","contentAr":"Arabic text","confidence":0.0-1.0}]
Only output the JSON array, nothing else.`;

    // Load recent conversation context
    const recentMessages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { direction: true, bodyText: true },
    });

    const history = recentMessages
      .reverse()
      .filter((m) => m.bodyText)
      .map((m) => `${m.direction === 'in' ? 'Patient' : 'Agent'}: ${m.bodyText}`)
      .join('\n');

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Conversation so far:\n${history}\n\nLatest from patient: ${latestUtterance}`,
      },
    ];

    try {
      const response = await llm.chat(messages, systemPrompt);
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3).map((s: any) => ({
          type: s.type || 'response',
          content: s.content || '',
          contentAr: s.contentAr || '',
          confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
        }));
      }
    } catch (err) {
      console.error('[SmartRouter] Agent suggestion generation failed:', err);
    }

    return [];
  }

  // ─── Sentiment detection ──────────────────────────────────────────────────

  /**
   * Quick keyword-based sentiment detection. Good enough for routing decisions;
   * more nuanced analysis can be done via LLM post-call.
   */
  detectSentiment(utterance: string): SentimentAnalysis {
    const lower = utterance.toLowerCase();
    const matchedKeywords = ANGER_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));

    if (matchedKeywords.length >= 3) {
      return { sentiment: 'angry', score: -0.9, triggers: matchedKeywords };
    }
    if (matchedKeywords.length >= 1) {
      return { sentiment: 'negative', score: -0.5, triggers: matchedKeywords };
    }

    // Simple positive check
    const positiveWords = [
      'شكرا', 'ممتاز', 'رائع', 'thank', 'great', 'excellent', 'perfect', 'happy',
      'appreciate', 'مشكور', 'حلو', 'زين', 'تمام', 'ممتنّ',
    ];
    const positiveMatches = positiveWords.filter((pw) => lower.includes(pw.toLowerCase()));
    if (positiveMatches.length >= 1) {
      return { sentiment: 'positive', score: 0.5, triggers: positiveMatches };
    }

    return { sentiment: 'neutral', score: 0, triggers: [] };
  }

  /**
   * LLM-backed deep sentiment analysis (use selectively — costs tokens).
   */
  async detectSentimentLLM(utterance: string): Promise<SentimentAnalysis> {
    const llm = getLLMService();

    const systemPrompt = `Analyse the sentiment of this healthcare call center message.
Reply in JSON: {"sentiment":"positive"|"neutral"|"negative"|"angry","score":<-1.0 to 1.0>,"triggers":["matched","keywords"]}
Only output the JSON object, nothing else.`;

    try {
      const response = await llm.chat(
        [{ role: 'user', content: utterance }],
        systemPrompt,
      );
      const parsed = JSON.parse(response);
      return {
        sentiment: parsed.sentiment || 'neutral',
        score: typeof parsed.score === 'number' ? parsed.score : 0,
        triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
      };
    } catch {
      return this.detectSentiment(utterance);
    }
  }

  // ─── After-hours routing ──────────────────────────────────────────────────

  /**
   * Check if current Saudi time (Asia/Riyadh) is outside business hours.
   */
  isAfterHours(businessHours?: Record<number, { open: string; close: string } | null>): boolean {
    const hours = businessHours ?? DEFAULT_BUSINESS_HOURS;

    const now = new Date();
    // Convert to Riyadh time
    const riyadhTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }),
    );
    const dayOfWeek = riyadhTime.getDay(); // 0=Sun
    const currentTime = `${String(riyadhTime.getHours()).padStart(2, '0')}:${String(riyadhTime.getMinutes()).padStart(2, '0')}`;

    const dayHours = hours[dayOfWeek];
    if (!dayHours) return true; // closed today

    return currentTime < dayHours.open || currentTime >= dayHours.close;
  }

  /**
   * Get routing decision specifically for after-hours calls.
   */
  async getAfterHoursRouting(orgId: string, intent: CallerIntent): Promise<RoutingDecision> {
    // Check for org-specific after-hours escalation rules
    const afterHoursRule = await this.prisma.escalationRule.findFirst({
      where: {
        orgId,
        isActive: true,
        schedule: { path: ['afterHours'], equals: true },
      },
      orderBy: { priority: 'desc' },
    });

    if (afterHoursRule) {
      return {
        action: afterHoursRule.action as RoutingDecision['action'],
        targetType: afterHoursRule.targetType,
        targetValue: afterHoursRule.targetValue,
        reason: 'After-hours escalation rule',
        summary: null,
        priority: afterHoursRule.priority,
        isAfterHours: true,
      };
    }

    // Urgent calls always get routed even after hours
    if (intent === 'urgent') {
      return {
        action: 'transfer',
        targetType: 'queue',
        targetValue: 'urgent_queue',
        reason: 'Urgent call during after-hours',
        summary: null,
        priority: 100,
        isAfterHours: true,
      };
    }

    // Default: AI handles it, with messaging about callback
    return {
      action: 'continue',
      targetType: null,
      targetValue: null,
      reason: 'After-hours — AI handling with limited scope',
      summary: null,
      priority: 0,
      isAfterHours: true,
    };
  }

  // ─── Full routing decision ────────────────────────────────────────────────

  /**
   * The main entry point: given the full call context, decide what to do.
   * Returns the highest-priority action from all evaluated rules.
   */
  async route(
    orgId: string,
    context: {
      intent: CallerIntent | null;
      utterance: string;
      confidence: number;
      patientRequestedHuman: boolean;
      failedAttempts: number;
    },
  ): Promise<RoutingDecision> {
    const sentiment = this.detectSentiment(context.utterance);

    // 1. Check after-hours first
    if (this.isAfterHours()) {
      const afterHoursDecision = await this.getAfterHoursRouting(
        orgId,
        context.intent ?? 'unknown',
      );
      if (afterHoursDecision.action !== 'continue') {
        return afterHoursDecision;
      }
    }

    // 2. Evaluate org-specific escalation rules
    const ruleDecision = await this.evaluateEscalationRules(orgId, {
      intent: context.intent,
      sentiment,
      confidence: context.confidence,
      utterance: context.utterance,
      patientRequestedHuman: context.patientRequestedHuman,
      failedAttempts: context.failedAttempts,
    });

    if (ruleDecision.action !== 'continue') {
      ruleDecision.summary = null; // Summary generated on actual handoff
      return ruleDecision;
    }

    // 3. Built-in safety checks
    if (sentiment.sentiment === 'angry') {
      return {
        action: 'transfer',
        targetType: 'queue',
        targetValue: 'supervisor_queue',
        reason: 'Angry caller detected',
        summary: null,
        priority: 90,
        isAfterHours: false,
      };
    }

    if (context.patientRequestedHuman) {
      return {
        action: 'transfer',
        targetType: 'queue',
        targetValue: this.getRoutingTarget(context.intent ?? 'unknown').queue,
        reason: 'Patient requested human agent',
        summary: null,
        priority: 80,
        isAfterHours: false,
      };
    }

    if (context.failedAttempts >= 3) {
      return {
        action: 'transfer',
        targetType: 'queue',
        targetValue: 'general_queue',
        reason: '3+ failed interaction attempts',
        summary: null,
        priority: 70,
        isAfterHours: false,
      };
    }

    if (context.confidence < 0.3) {
      return {
        action: 'transfer',
        targetType: 'queue',
        targetValue: 'general_queue',
        reason: `Very low AI confidence (${context.confidence})`,
        summary: null,
        priority: 60,
        isAfterHours: false,
      };
    }

    // 4. No escalation needed — AI continues
    return {
      action: 'continue',
      targetType: null,
      targetValue: null,
      reason: 'AI handling — no escalation triggered',
      summary: null,
      priority: 0,
      isAfterHours: this.isAfterHours(),
    };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Generate a conversation summary for the handoff using LLM.
   */
  private async generateConversationSummary(request: HandoffRequest): Promise<string> {
    if (request.conversationHistory.length === 0) {
      return `Call from ${request.callerPhone}. Intent: ${request.intent ?? 'unknown'}. Reason for handoff: ${request.reason}`;
    }

    const llm = getLLMService();
    const transcript = request.conversationHistory
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const systemPrompt = `Summarise this healthcare call center conversation for the human agent taking over. Include:
1. Patient's main issue
2. What has already been tried/discussed
3. Verification status
4. Any relevant patient info collected
Keep it concise (3-5 sentences). Respond in English.`;

    try {
      return await llm.chat([{ role: 'user', content: transcript }], systemPrompt);
    } catch {
      return `Call from ${request.callerPhone}. Intent: ${request.intent ?? 'unknown'}. Reason: ${request.reason}. Messages exchanged: ${request.conversationHistory.length}`;
    }
  }

  /**
   * Build a structured patient context object for the agent dashboard.
   */
  private async buildPatientContext(
    request: HandoffRequest,
  ): Promise<Record<string, unknown>> {
    const ctx: Record<string, unknown> = {
      callerPhone: request.callerPhone,
      intent: request.intent,
      verificationLevel: request.verificationLevel,
      handoffReason: request.reason,
    };

    if (request.patientId) {
      try {
        const patient = await this.prisma.patient.findUnique({
          where: { patientId: request.patientId },
          select: {
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            mrn: true,
            sex: true,
          },
        });
        if (patient) {
          ctx.patient = patient;
        }

        // Recent appointments
        const appointments = await this.prisma.appointment.findMany({
          where: { patientId: request.patientId },
          orderBy: { startTs: 'desc' },
          take: 3,
          select: {
            startTs: true,
            status: true,
            reason: true,
          },
        });
        if (appointments.length > 0) {
          ctx.recentAppointments = appointments;
        }
      } catch (err) {
        console.error('[SmartRouter] Error building patient context:', err);
      }
    }

    return ctx;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

let instance: SmartRouter | null = null;

export function getSmartRouter(prisma: PrismaClient): SmartRouter {
  if (!instance) {
    instance = new SmartRouter(prisma);
  }
  return instance;
}
