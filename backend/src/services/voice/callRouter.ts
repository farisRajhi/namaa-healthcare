import { randomUUID } from 'crypto';
import { getLLMService, ChatMessage } from '../llm.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CallerIntent =
  | 'scheduling'
  | 'physician_search'
  | 'faq'
  | 'billing'
  | 'urgent'
  | 'it_support'
  | 'unknown';

export type ConversationState =
  | 'greeting'
  | 'intent_detection'
  | 'identity_verification'
  | 'task_execution'
  | 'wrap_up';

export interface ActiveCall {
  callId: string;
  twilioCallSid: string;
  orgId: string;
  callerPhone: string;
  conversationId: string | null;
  patientId: string | null;
  state: ConversationState;
  intent: CallerIntent | null;
  intentConfidence: number;
  verificationLevel: number;
  startedAt: Date;
  lastActivityAt: Date;
  retryCount: number;
  metadata: Record<string, unknown>;
}

interface IntentClassification {
  intent: CallerIntent;
  confidence: number;
  keywords: string[];
}

// ─── Intent keyword maps (Arabic + English) ────────────────────────────────────

const INTENT_KEYWORDS: Record<CallerIntent, string[]> = {
  scheduling: [
    'موعد', 'حجز', 'الغاء', 'تغيير', 'appointment', 'book', 'schedule',
    'reschedule', 'cancel', 'حجز موعد', 'ابغى موعد', 'ابي موعد', 'عايز موعد',
    'بدي موعد', 'زيارة', 'visit', 'slot', 'available',
  ],
  physician_search: [
    'دكتور', 'طبيب', 'طبيبة', 'doctor', 'physician', 'specialist', 'اخصائي',
    'جلدية', 'عظام', 'باطنية', 'dermatologist', 'orthopedic', 'find doctor',
    'أبي دكتور', 'عايز دكتور', 'بدي دكتور',
  ],
  faq: [
    'سؤال', 'استفسار', 'ساعات', 'مواعيد العمل', 'عنوان', 'موقع', 'question',
    'hours', 'address', 'location', 'information', 'معلومات', 'parking', 'مواقف',
    'visiting', 'زيارة المريض',
  ],
  billing: [
    'فاتورة', 'دفع', 'تأمين', 'حساب', 'bill', 'billing', 'payment', 'insurance',
    'invoice', 'cost', 'price', 'سعر', 'تكلفة', 'claim', 'مطالبة',
  ],
  urgent: [
    'طوارئ', 'ضروري', 'حالة طارئة', 'emergency', 'urgent', 'critical',
    'ألم شديد', 'severe pain', 'chest pain', 'ألم صدر', 'نزيف', 'bleeding',
    'لا أستطيع التنفس', "can't breathe", 'heart attack', 'جلطة', 'حادث', 'accident',
  ],
  it_support: [
    'تطبيق', 'بوابة', 'كلمة مرور', 'تسجيل دخول', 'app', 'portal', 'password',
    'login', 'reset', 'account', 'حساب', 'ما يفتح', 'مشكلة تقنية', 'technical',
  ],
  unknown: [],
};

// Priority-based ordering for intent resolution
const INTENT_PRIORITY: CallerIntent[] = [
  'urgent',
  'scheduling',
  'billing',
  'physician_search',
  'it_support',
  'faq',
  'unknown',
];

// ─── State transitions ─────────────────────────────────────────────────────────

const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  greeting: ['intent_detection', 'identity_verification', 'wrap_up'],
  intent_detection: ['identity_verification', 'task_execution', 'wrap_up'],
  identity_verification: ['task_execution', 'wrap_up'],
  task_execution: ['wrap_up', 'intent_detection'], // can loop back for follow-ups
  wrap_up: [], // terminal state
};

// ─── Call Router (Singleton) ────────────────────────────────────────────────────

export class CallRouter {
  private activeCalls: Map<string, ActiveCall> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly CALL_TIMEOUT_MS = 45 * 60 * 1000; // 45 min
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupStaleCalls(), 5 * 60 * 1000);
  }

  // ─── Call lifecycle ─────────────────────────────────────────────────────────

  /**
   * Register a new active call and start the conversation state machine
   */
  startCall(
    twilioCallSid: string,
    orgId: string,
    callerPhone: string,
    conversationId?: string,
  ): ActiveCall {
    const call: ActiveCall = {
      callId: randomUUID(),
      twilioCallSid,
      orgId,
      callerPhone,
      conversationId: conversationId ?? null,
      patientId: null,
      state: 'greeting',
      intent: null,
      intentConfidence: 0,
      verificationLevel: 0,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      retryCount: 0,
      metadata: {},
    };

    this.activeCalls.set(twilioCallSid, call);
    return call;
  }

  /**
   * Get an active call by Twilio SID
   */
  getCall(twilioCallSid: string): ActiveCall | undefined {
    return this.activeCalls.get(twilioCallSid);
  }

  /**
   * End an active call — remove from tracking
   */
  endCall(twilioCallSid: string): ActiveCall | undefined {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.state = 'wrap_up';
      this.activeCalls.delete(twilioCallSid);
    }
    return call;
  }

  /**
   * List all active calls, optionally filtered by org
   */
  getActiveCalls(orgId?: string): ActiveCall[] {
    const calls = Array.from(this.activeCalls.values());
    return orgId ? calls.filter((c) => c.orgId === orgId) : calls;
  }

  /**
   * How many calls are currently active, optionally per-org
   */
  getActiveCallCount(orgId?: string): number {
    return this.getActiveCalls(orgId).length;
  }

  // ─── State machine ─────────────────────────────────────────────────────────

  /**
   * Transition the call to a new state (validates legal transitions)
   */
  transitionState(twilioCallSid: string, newState: ConversationState): boolean {
    const call = this.activeCalls.get(twilioCallSid);
    if (!call) return false;

    const allowed = STATE_TRANSITIONS[call.state];
    if (!allowed.includes(newState)) {
      console.warn(
        `[CallRouter] Illegal state transition ${call.state} → ${newState} for call ${twilioCallSid}`,
      );
      return false;
    }

    call.state = newState;
    call.lastActivityAt = new Date();
    return true;
  }

  /**
   * Get current state of a call
   */
  getState(twilioCallSid: string): ConversationState | undefined {
    return this.activeCalls.get(twilioCallSid)?.state;
  }

  // ─── Intent detection ──────────────────────────────────────────────────────

  /**
   * Fast keyword-based intent detection (runs first — cheap & fast)
   */
  classifyIntentByKeywords(text: string): IntentClassification {
    const normalised = text.toLowerCase().trim();
    const scores: Record<CallerIntent, { score: number; matched: string[] }> = {} as any;

    for (const intent of INTENT_PRIORITY) {
      const keywords = INTENT_KEYWORDS[intent];
      const matched = keywords.filter((kw) => normalised.includes(kw.toLowerCase()));
      scores[intent] = {
        score: matched.length,
        matched,
      };
    }

    // Find highest-scoring intent (first in priority order breaks ties)
    let best: CallerIntent = 'unknown';
    let bestScore = 0;
    let bestKeywords: string[] = [];

    for (const intent of INTENT_PRIORITY) {
      if (scores[intent].score > bestScore) {
        best = intent;
        bestScore = scores[intent].score;
        bestKeywords = scores[intent].matched;
      }
    }

    const confidence = bestScore === 0 ? 0 : Math.min(bestScore / 3, 1.0);

    return { intent: best, confidence, keywords: bestKeywords };
  }

  /**
   * LLM-based intent detection (runs when keyword confidence is low)
   */
  async classifyIntentByLLM(text: string): Promise<IntentClassification> {
    const llm = getLLMService();

    const systemPrompt = `You are an intent classifier for a healthcare call center. Classify the caller's intent into exactly one of these categories:
- scheduling: book, reschedule, or cancel appointments
- physician_search: finding a doctor or specialist
- faq: general questions, hours, directions, policies
- billing: payment, insurance, cost inquiries
- urgent: medical emergencies, severe symptoms
- it_support: portal, app, password help
- unknown: cannot determine intent

Respond in JSON: {"intent":"<category>","confidence":<0.0-1.0>,"keywords":["matched","words"]}
Only output the JSON object, nothing else.`;

    const messages: ChatMessage[] = [{ role: 'user', content: text }];

    try {
      const response = await llm.chat(messages, systemPrompt);
      const parsed = JSON.parse(response);
      return {
        intent: INTENT_PRIORITY.includes(parsed.intent) ? parsed.intent : 'unknown',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      };
    } catch (err) {
      console.error('[CallRouter] LLM intent classification failed:', err);
      return { intent: 'unknown', confidence: 0, keywords: [] };
    }
  }

  /**
   * Combined intent detection: keyword first, LLM fallback if confidence < 0.5
   */
  async detectIntent(twilioCallSid: string, utterance: string): Promise<IntentClassification> {
    const call = this.activeCalls.get(twilioCallSid);

    // Fast keyword pass
    let result = this.classifyIntentByKeywords(utterance);

    // If low confidence, escalate to LLM
    if (result.confidence < 0.5) {
      result = await this.classifyIntentByLLM(utterance);
    }

    // Store on the call
    if (call) {
      call.intent = result.intent;
      call.intentConfidence = result.confidence;
      call.lastActivityAt = new Date();
    }

    return result;
  }

  // ─── Retry & error handling ────────────────────────────────────────────────

  /**
   * Record a STT/TTS failure and decide whether to retry
   */
  recordFailure(twilioCallSid: string): { shouldRetry: boolean; retryCount: number } {
    const call = this.activeCalls.get(twilioCallSid);
    if (!call) return { shouldRetry: false, retryCount: 0 };

    call.retryCount += 1;
    call.lastActivityAt = new Date();

    return {
      shouldRetry: call.retryCount <= this.MAX_RETRIES,
      retryCount: call.retryCount,
    };
  }

  /**
   * Reset the retry counter (after a successful operation)
   */
  resetRetries(twilioCallSid: string): void {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.retryCount = 0;
    }
  }

  // ─── Metadata helpers ─────────────────────────────────────────────────────

  /**
   * Attach patient id once identity is verified
   */
  setPatientId(twilioCallSid: string, patientId: string): void {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.patientId = patientId;
      call.lastActivityAt = new Date();
    }
  }

  /**
   * Set the verification level achieved during the call
   */
  setVerificationLevel(twilioCallSid: string, level: number): void {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.verificationLevel = level;
      call.lastActivityAt = new Date();
    }
  }

  /**
   * Attach the conversation id once created
   */
  setConversationId(twilioCallSid: string, conversationId: string): void {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.conversationId = conversationId;
      call.lastActivityAt = new Date();
    }
  }

  /**
   * Set arbitrary metadata on the call
   */
  setMetadata(twilioCallSid: string, key: string, value: unknown): void {
    const call = this.activeCalls.get(twilioCallSid);
    if (call) {
      call.metadata[key] = value;
      call.lastActivityAt = new Date();
    }
  }

  // ─── Queue summary (for dashboard) ────────────────────────────────────────

  /**
   * Generate a quick summary of the call queue for the dashboard
   */
  getQueueSummary(orgId: string): {
    active: number;
    byState: Record<ConversationState, number>;
    byIntent: Record<CallerIntent | 'none', number>;
    avgDurationSec: number;
  } {
    const calls = this.getActiveCalls(orgId);
    const now = Date.now();

    const byState: Record<ConversationState, number> = {
      greeting: 0,
      intent_detection: 0,
      identity_verification: 0,
      task_execution: 0,
      wrap_up: 0,
    };

    const byIntent: Record<CallerIntent | 'none', number> = {
      scheduling: 0,
      physician_search: 0,
      faq: 0,
      billing: 0,
      urgent: 0,
      it_support: 0,
      unknown: 0,
      none: 0,
    };

    let totalDuration = 0;

    for (const call of calls) {
      byState[call.state]++;
      byIntent[call.intent ?? 'none']++;
      totalDuration += now - call.startedAt.getTime();
    }

    return {
      active: calls.length,
      byState,
      byIntent,
      avgDurationSec: calls.length > 0 ? Math.round(totalDuration / calls.length / 1000) : 0,
    };
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  private cleanupStaleCalls(): void {
    const now = Date.now();
    for (const [sid, call] of this.activeCalls) {
      if (now - call.lastActivityAt.getTime() > this.CALL_TIMEOUT_MS) {
        console.log(`[CallRouter] Cleaning up stale call: ${sid}`);
        this.activeCalls.delete(sid);
      }
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.activeCalls.clear();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

let callRouterInstance: CallRouter | null = null;

export function getCallRouter(): CallRouter {
  if (!callRouterInstance) {
    callRouterInstance = new CallRouter();
  }
  return callRouterInstance;
}
