import type { PrismaClient, Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────
// Conversation State Machine
// Inspired by claw-code's turn-based control flow:
// Tracks conversation phase, constrains AI behavior per
// state, and manages structured flows (booking, etc.)
// ─────────────────────────────────────────────────────────

export type ConversationState =
  | 'start'
  | 'greeting'
  | 'active'
  | 'booking'
  | 'cancelling'
  | 'rescheduling'
  | 'confirming'
  | 'handoff'
  | 'closed';

export interface BookingContext {
  serviceId?: string;
  serviceName?: string;
  providerId?: string;
  providerName?: string;
  date?: string;
  time?: string;
  holdAppointmentId?: string;
  step: 'service' | 'provider' | 'date' | 'time' | 'guest_info' | 'hold' | 'confirm';
}

export interface SubFlowRecord {
  id: string;
  type: 'booking' | 'cancelling' | 'rescheduling';
  outcome: string;
  completedAt: string;
}

export interface FlowContext {
  /** Active state — always the top of the stateStack */
  state: ConversationState;
  /** State stack for interruptible flows. Top = active, lower = suspended. */
  stateStack: ConversationState[];
  booking?: BookingContext;
  /** Active sub-flow ID (isolates context from previous completed sub-flows) */
  subFlowId: string | null;
  /** History of completed sub-flows in this conversation */
  subFlowHistory: SubFlowRecord[];
  turnCount: number;
  maxTurns: number;
  lastToolCalls: string[];
  patientIdentified: boolean;
  orgName?: string;
  patientName?: string;
  /** Track last completed action for post-action follow-up prompts */
  lastCompletedAction?: 'booking' | 'cancellation' | 'reschedule';
}

// ── Default turn budget ──────────────────────────────────

const DEFAULT_MAX_TURNS = 50;
const HANDOFF_WARNING_TURNS = 40;

// ── Intent Detection Keywords ────────────────────────────

const BOOKING_INTENTS = [
  'حجز', 'موعد', 'أبغى أحجز', 'أبي أحجز', 'أريد حجز', 'أريد موعد',
  'book', 'appointment', 'schedule', 'reserve',
  'أبغى موعد', 'ممكن موعد', 'فيه مواعيد',
];

// Inquiry phrases — patient asking ABOUT an existing appointment, not
// trying to create a new one. These must NOT trigger the booking state
// (which assumes "create new"); they should keep the conversation in the
// active state where the AI is told to call list_patient_appointments.
const APPOINTMENT_INQUIRY_PATTERNS: RegExp[] = [
  /هل\s*عندي\s*موعد/i,
  /هل\s*لي\s*موعد/i,
  /وش\s*موعدي/i,
  /متى\s*موعدي/i,
  /(اش|ايش)\s*(وقت|تاريخ)\s*موعدي/i,
  /موعدي\s*(الجاي|القادم|متى)/i,
  /do\s+i\s+have\s+(an?\s+)?appointment/i,
  /when\s+is\s+my\s+appointment/i,
  /what\s+time\s+is\s+my\s+appointment/i,
];

const CANCEL_INTENTS = [
  'إلغاء', 'الغي', 'ألغي', 'الغ', 'cancel', 'ابغى الغي',
  'أبغى ألغي الموعد', 'لغي الموعد', 'ابي الغي',
];

const HANDOFF_INTENTS = [
  'موظف', 'شخص حقيقي', 'إنسان', 'بشري', 'تحويل',
  'human', 'agent', 'transfer', 'real person', 'talk to someone',
  'أبغى أكلم شخص', 'وصلني بموظف',
];

const RESCHEDULE_INTENTS = [
  'تغيير', 'أغير', 'أبغى أغير', 'تعديل', 'إعادة جدولة', 'نقل الموعد',
  'أبغى أغير موعدي', 'ممكن أغير الموعد', 'أبي أأجل', 'أبغى أأجل',
  'reschedule', 'change appointment', 'move appointment',
];

const FAREWELL_INTENTS = [
  'شكراً', 'مشكور', 'شكرا', 'الله يعطيك العافية', 'مع السلامة',
  'thanks', 'thank you', 'bye', 'goodbye', 'that\'s all',
  'بس كذا', 'لا خلاص', 'ما أحتاج شيء', 'تمام شكراً',
];

const GREETING_INTENTS = [
  'مرحبا', 'السلام', 'هلا', 'أهلاً', 'hi', 'hello', 'hey',
  'صباح الخير', 'مساء الخير', 'good morning', 'good evening',
];

// ── Read-only tools (used for pop-back heuristic) ───────
const READ_ONLY_TOOLS_SET = new Set([
  'check_availability', 'search_providers', 'list_services',
  'get_facility_info', 'list_patient_appointments',
  'browse_available_dates',
]);

// ── State Machine ────────────────────────────────────────

export class ConversationFlowManager {
  constructor(private prisma: PrismaClient) {}

  /**
   * Initialize flow context for a new or existing conversation.
   */
  initContext(existing?: Partial<FlowContext>, patientIdentified = false): FlowContext {
    const state = existing?.state ?? 'start';
    return {
      state,
      stateStack: existing?.stateStack ?? [state],
      booking: existing?.booking,
      subFlowId: existing?.subFlowId ?? null,
      subFlowHistory: existing?.subFlowHistory ?? [],
      turnCount: existing?.turnCount ?? 0,
      maxTurns: existing?.maxTurns ?? DEFAULT_MAX_TURNS,
      lastToolCalls: existing?.lastToolCalls ?? [],
      patientIdentified: existing?.patientIdentified ?? patientIdentified,
    };
  }

  /**
   * Detect intent from the latest user message and transition state.
   */
  detectIntentAndTransition(
    currentState: ConversationState,
    userMessage: string,
    toolCallsMade: string[],
    ctx: FlowContext,
  ): FlowContext {
    const msg = userMessage.toLowerCase().trim();
    const stack = [...(ctx.stateStack ?? [currentState])];
    const newCtx = { ...ctx, turnCount: ctx.turnCount + 1, lastToolCalls: toolCallsMade, stateStack: stack, lastCompletedAction: undefined as FlowContext['lastCompletedAction'] };

    /** Helper: set active state (replaces top of stack) */
    const setActive = (s: ConversationState): FlowContext => {
      stack[0] = s;
      return { ...newCtx, state: s, stateStack: stack };
    };

    /** Helper: push interruption on top of stack (preserves current state below) */
    const pushState = (s: ConversationState): FlowContext => {
      stack.unshift(s);
      return { ...newCtx, state: s, stateStack: stack };
    };

    /** Helper: pop the top state, returning to the one below */
    const popState = (): FlowContext => {
      if (stack.length > 1) stack.shift();
      const topState = stack[0];
      return { ...newCtx, state: topState, stateStack: stack };
    };

    // Tool-call-driven transitions take priority
    if (toolCallsMade.includes('transfer_to_human')) {
      return { ...setActive('handoff'), stateStack: ['handoff'] };
    }
    if (toolCallsMade.includes('book_appointment') || toolCallsMade.includes('book_appointment_guest')) {
      const result = popState();
      return { ...result, state: 'active', stateStack: ['active'], booking: undefined, lastCompletedAction: 'booking' };
    }
    if (toolCallsMade.includes('hold_appointment')) {
      if (newCtx.booking) {
        return { ...setActive('booking'), booking: { ...newCtx.booking, step: 'confirm' } };
      }
    }
    if (toolCallsMade.includes('cancel_appointment')) {
      const result = popState();
      return { ...result, state: 'active', stateStack: ['active'], lastCompletedAction: 'cancellation' };
    }
    if (toolCallsMade.includes('reschedule_appointment')) {
      const result = popState();
      return { ...result, state: 'active', stateStack: ['active'], lastCompletedAction: 'reschedule' };
    }

    // If already in handoff/closed, stay there
    if (currentState === 'handoff' || currentState === 'closed') {
      return setActive(currentState);
    }

    // Farewell detection (only from active state)
    // Exact-match short negatives ("لا", "no", "nope", "كلا") as farewell too —
    // avoids substring false-positives on words like "لازم" / "لأن" / "لاحقاً".
    const SHORT_NEGATIVE_FAREWELLS = new Set(['لا', 'كلا', 'no', 'nope', 'nah']);
    if (currentState === 'active' && (
      FAREWELL_INTENTS.some(kw => msg.includes(kw)) ||
      SHORT_NEGATIVE_FAREWELLS.has(msg)
    )) {
      return { ...setActive('closed'), stateStack: ['closed'] };
    }

    // Intent-based transitions with interruption support
    if (HANDOFF_INTENTS.some(kw => msg.includes(kw))) {
      return { ...setActive('handoff'), stateStack: ['handoff'] };
    }

    // Inquiry about an existing appointment — keep in active state (not booking)
    // so the AI follows the "must call list_patient_appointments" rule rather
    // than entering the create-new-booking flow.
    if (APPOINTMENT_INQUIRY_PATTERNS.some(re => re.test(msg))) {
      return setActive('active');
    }

    if (BOOKING_INTENTS.some(kw => msg.includes(kw))) {
      if (currentState === 'booking') {
        return { ...newCtx, state: 'booking', booking: newCtx.booking ?? { step: 'service' } };
      }
      return {
        ...setActive('booking'),
        booking: newCtx.booking ?? { step: 'service' },
      };
    }

    if (CANCEL_INTENTS.some(kw => msg.includes(kw))) {
      if (currentState === 'booking') {
        return pushState('cancelling');
      }
      return setActive('cancelling');
    }

    if (RESCHEDULE_INTENTS.some(kw => msg.includes(kw))) {
      return setActive('rescheduling');
    }

    if (currentState === 'start' && GREETING_INTENTS.some(kw => msg.includes(kw))) {
      return setActive('greeting');
    }

    // If in start, move to active after first real message
    if (currentState === 'start' || currentState === 'greeting') {
      return setActive('active');
    }

    // If the active state is a temporary interruption (not booking) and
    // the AI has answered (no specific intent detected), pop back
    if (stack.length > 1 && (currentState === 'active' || currentState === 'cancelling')) {
      // Check if the interruption seems resolved (AI responded without tool calls for the sub-task)
      if (toolCallsMade.length === 0 || toolCallsMade.every(t => READ_ONLY_TOOLS_SET.has(t))) {
        return popState();
      }
    }

    return { ...newCtx, state: currentState };
  }

  /**
   * Update booking sub-flow based on tool calls made.
   * Phase 5.2: Now inspects tool args to populate BookingContext fields.
   */
  updateBookingProgress(
    ctx: FlowContext,
    toolCallsMade: string[],
    toolResults: string[],
    toolArgs?: Record<string, Record<string, unknown>>[],
  ): FlowContext {
    if (ctx.state !== 'booking' || !ctx.booking) return ctx;

    const newBooking = { ...ctx.booking };

    // Only persist IDs that are valid UUIDs — LLM sometimes emits refs
    // like "[طبيب 1]" or service names, which would poison the next turn's
    // prompt and crash downstream Prisma queries.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidOrUndef = (v: unknown): string | undefined =>
      typeof v === 'string' && UUID_RE.test(v) ? v : undefined;

    // Phase 5.2: Extract actual data from tool args
    if (toolArgs) {
      for (const argMap of toolArgs) {
        for (const [toolName, args] of Object.entries(argMap)) {
          if (toolName === 'list_services') {
            // Services were listed — stay on service step
          }
          if (toolName === 'search_providers' && args.departmentId) {
            // Provider search was narrowed by department
          }
          if (toolName === 'browse_available_dates') {
            // Extract service/provider filters from browse args
            const sid = uuidOrUndef(args.serviceId);
            if (sid) newBooking.serviceId = sid;
            const pid = uuidOrUndef(args.providerId);
            if (pid) newBooking.providerId = pid;
          }
          if (toolName === 'check_availability') {
            // Extract selected provider/service/date from availability check
            const pid = uuidOrUndef(args.providerId);
            if (pid) newBooking.providerId = pid;
            const sid = uuidOrUndef(args.serviceId);
            if (sid) newBooking.serviceId = sid;
            if (args.date && typeof args.date === 'string') {
              newBooking.date = args.date;
            }
            newBooking.step = 'time'; // Patient is now picking a time slot
          }
          if (toolName === 'hold_appointment') {
            // Extract hold details and move to confirm step
            const pid = uuidOrUndef(args.providerId);
            if (pid) newBooking.providerId = pid;
            const sid = uuidOrUndef(args.serviceId);
            if (sid) newBooking.serviceId = sid;
            if (args.date) newBooking.date = args.date as string;
            if (args.time) newBooking.time = args.time as string;
            newBooking.step = 'confirm';
          }
          if (toolName === 'book_appointment' || toolName === 'book_appointment_guest') {
            // Extract all booking details
            const pid = uuidOrUndef(args.providerId);
            if (pid) newBooking.providerId = pid;
            const sid = uuidOrUndef(args.serviceId);
            if (sid) newBooking.serviceId = sid;
            if (args.date) newBooking.date = args.date as string;
            if (args.time) newBooking.time = args.time as string;
          }
        }
      }
    }

    // Extract names and IDs from tool results for display in prompts
    for (const result of toolResults) {
      // Extract providerId from tool result if not yet set
      if (!newBooking.providerId) {
        const providerIdMatch = result.match(/providerId:\s*([0-9a-f-]{36})/i);
        if (providerIdMatch) {
          newBooking.providerId = providerIdMatch[1];
        }
      }
      // Extract serviceId from tool result if not yet set
      if (!newBooking.serviceId) {
        const serviceIdMatch = result.match(/serviceId:\s*([0-9a-f-]{36})/i);
        if (serviceIdMatch) {
          newBooking.serviceId = serviceIdMatch[1];
        }
      }
      // Extract provider name if we have a providerId but no name
      if (newBooking.providerId && !newBooking.providerName) {
        const nameMatch = result.match(/🩺\s*(?:\[طبيب \d+\]\s*)?([^\n(]+)/);
        if (nameMatch) {
          newBooking.providerName = nameMatch[1].trim();
        }
      }
      // Extract service name
      if (newBooking.serviceId && !newBooking.serviceName) {
        const serviceMatch = result.match(/الخدمة:\s*([^\n]+)/);
        if (serviceMatch) {
          newBooking.serviceName = serviceMatch[1].trim();
        }
      }
      // Extract holdAppointmentId from hold_appointment result
      if (result.includes('appointmentId:') && !newBooking.holdAppointmentId) {
        const holdMatch = result.match(/appointmentId:\s*([0-9a-f-]+)/i);
        if (holdMatch) {
          newBooking.holdAppointmentId = holdMatch[1];
        }
      }
    }

    // Tool-call-driven step transitions
    if (toolCallsMade.includes('browse_available_dates')) {
      // Patient is browsing dates — move to date step so they can pick one
      if (newBooking.step === 'service' || newBooking.step === 'provider') {
        newBooking.step = 'date';
      }
    }
    if (toolCallsMade.includes('check_availability')) {
      if (newBooking.step === 'service' || newBooking.step === 'provider') {
        newBooking.step = 'date';
      }
    }

    // hold_appointment succeeded — move to confirm step
    if (toolCallsMade.includes('hold_appointment')) {
      newBooking.step = 'confirm';
    }

    // For anonymous patients: advance to guest_info after the time step.
    // Note: booking.time is only set by hold_appointment (which anonymous patients don't use),
    // so we advance as soon as the AI has shown available times (step is 'time')
    // and no time-selection tool was called in this turn (user is picking from the list).
    if (!ctx.patientIdentified && newBooking.step === 'time' &&
        !toolCallsMade.includes('check_availability') && !toolCallsMade.includes('browse_available_dates')) {
      newBooking.step = 'guest_info';
    }

    // book_appointment or book_appointment_guest succeeded — flow complete
    if (toolCallsMade.includes('book_appointment') || toolCallsMade.includes('book_appointment_guest')) {
      return { ...ctx, state: 'active', booking: undefined };
    }

    return { ...ctx, booking: newBooking };
  }

  /**
   * Get state-specific system prompt addendum.
   * Constrains AI behavior based on current conversation phase.
   */
  getStatePrompt(ctx: FlowContext): string {
    let prompt = '';

    // Turn budget warning
    if (ctx.turnCount >= HANDOFF_WARNING_TURNS) {
      prompt += `\n⚠️ هذه المحادثة طويلة (${ctx.turnCount} رسالة). إذا لم تستطع مساعدة المريض، حوّله لموظف.\n`;
    }

    switch (ctx.state) {
      case 'start':
      case 'greeting':
        // Greeting guidance (departments list + working hours + invite to book)
        // now lives in systemPrompt.ts buildStateLayer — it has DB access and
        // can inject the live schedule. We intentionally emit nothing here so
        // the two prompts don't conflict with each other.
        if (ctx.patientName) {
          prompt += `- المريض معروف باسم: "${ctx.patientName}" — خاطبيه باسمه\n`;
        }
        break;

      case 'booking':
        prompt += `
## حالة المحادثة: حجز موعد 📅
أنتِ الآن في مسار حجز موعد. اتبعي الخطوات بالترتيب:
${this.getBookingStepPrompt(ctx.booking, ctx.patientIdentified)}

## الحجز السريع
إذا المريض حدد كل التفاصيل مرة وحدة (مثل: "أبغى كشف عام مع د. أحمد يوم الثلاثاء ١٠ صباحاً"):
١. تحقق من التوفر مباشرة باستخدام check_availability
٢. إذا متاح، استخدم hold_appointment
٣. اعرض ملخص مختصر واطلب التأكيد
لا تسأل أسئلة إذا عندك كل المعلومات.

تعليمات مهمة:
- **⛔ لا تسألي "وش الأيام اللي تناسبك؟" قبل ما تعرضي الأيام المتاحة** — المريض ما يعرف متى العيادة مفتوحة
- **بعد ما تفهمي الخدمة: استدعي browse_available_dates فوراً لعرض أيام وساعات العيادة**
- **اعرضي نتيجة browse_available_dates كاملة — كل الأيام اللي رجعت، مش يوم واحد فقط**
- إذا المريض حدد تاريخ: استخدمي check_availability لعرض الأوقات المتاحة ليوم معين
- استخدمي list_services فقط إذا المريض طلب قائمة الخدمات — مش كل مرة
- لا تختلقي مواعيد أو أيام عمل — استخدمي الأدوات فقط
- إذا غيّر المريض رأيه أو سأل عن شيء آخر، أجيبيه ثم عودي للحجز
- إذا المريض يسأل "متى أنتم مفتوحين؟" أو "ايش أيام الدوام؟": استدعي browse_available_dates — تجيب أيام العمل + ساعاتها
${ctx.patientIdentified
  ? `- **مهم: بعد اختيار المريض للوقت، استخدمي hold_appointment أولاً لحجز الموعد مؤقتاً**
- **ثم اعرضي ملخص مختصر (3 أسطر كحد أقصى) واسألي "أأكد الحجز؟"**
- **فقط بعد تأكيد المريض: استخدمي book_appointment مع holdAppointmentId**`
  : `- **المريض غير مسجل — لا تستخدمي hold_appointment**
- **بعد اختيار الوقت: اطلبي من المريض اسمه الأول والأخير فقط**
- **رقم الجوال عندك من الواتساب — لا تسأليه عنه**
- **بعد الحصول على الاسم: استخدمي book_appointment_guest مباشرة مع رقم الواتساب**`}
`;
        break;

      case 'cancelling':
        prompt += `
## حالة المحادثة: إلغاء موعد ❌
⛔ لا تسألي المريض عن "رقم الموعد" أبداً — هذا UUID داخلي ما يعرفه.
- استدعي list_patient_appointments أولاً
- النتيجة تحوي مراجع [موعد 1], [موعد 2] — استخدميها كـ appointmentId
- إذا موعد واحد فقط: عرّفيه بالتاريخ والخدمة، اسألي للتأكيد، ثم cancel_appointment
- إذا عدة: اعرضيها مرقّمة بالتاريخ والخدمة، اسألي أي واحد يبي يلغي
`;
        break;

      case 'rescheduling':
        prompt += `
## حالة المحادثة: إعادة جدولة موعد 🔄
⛔ لا تسألي المريض عن "رقم الموعد" أبداً — استخدمي list_patient_appointments للحصول عليه داخلياً.
الخطوات:
١. list_patient_appointments فوراً → احصلي على المواعيد القادمة
٢. كل موعد له مرجع [موعد N] — هذا هو الـ appointmentId اللي تستخدميه
٣. إذا موعد واحد قادم: اعتبريه هو المطلوب، لا تسألي المريض أي موعد
٤. إذا عدة: اعرضي قائمة بالتاريخ والخدمة، اسألي أي واحد بالوصف (مش الرقم)
٥. اسألي عن التاريخ/الوقت الجديد إذا ما حدده
٦. check_availability للتحقق
٧. اعرضي ملخص (قديم → جديد) واسألي "أأكد التعديل؟"
٨. reschedule_appointment مع appointmentId الداخلي + newDate + newTime
`;
        break;

      case 'handoff':
        prompt += `
## حالة المحادثة: تحويل لموظف 🔄
- استخدمي transfer_to_human لتحويل المحادثة
- أخبري المريض أن موظف سيتواصل معه قريباً
- لا تحاولي حل المشكلة بعد طلب التحويل
`;
        break;

      case 'closed':
        prompt += `
## حالة المحادثة: إنهاء ✅
- ودّعي المريض بعبارة لطيفة
- مثال: "الله يعافيك! إذا احتجت أي شيء تراني هنا 😊 مع السلامة"
- لا تسألي "هل تحتاج شيء ثاني" — المريض قال خلاص
`;
        break;

      case 'active':
      default:
        prompt += `
## حالة المحادثة: نشطة
- أجيبي على استفسارات المريض بشكل طبيعي
- استخدمي الأدوات المتاحة حسب الحاجة
- إذا المريض يريد حجز، ابدئي مسار الحجز
- إذا المريض يسأل عن مواعيده ("هل عندي موعد؟"، "وش موعدي؟"، "متى موعدي؟") → **استدعي list_patient_appointments فوراً ولا تعتمدي على الذاكرة**
- ⛔ ممنوع ذكر وقت/تاريخ موعد من ذاكرة المحادثة — اقرئيه من نتيجة list_patient_appointments فقط
- ⛔ ممنوع قول "تم التعديل" إذا reschedule_appointment ما استُدعي بنجاح في هذا الدور
`;
        // Post-action follow-up prompts
        if (ctx.lastCompletedAction === 'booking') {
          prompt += `\n📋 أكملتِ حجز موعد. يجب أن:\n- تسألي "هل تحتاج شيء ثاني؟"\n- تذكري: يجب الحضور قبل الموعد بـ ١٥ دقيقة مع بطاقة الهوية\n`;
        } else if (ctx.lastCompletedAction === 'cancellation') {
          prompt += `\n📋 أكملتِ إلغاء موعد. اسألي: "تبي تحجز موعد بديل؟"\n`;
        } else if (ctx.lastCompletedAction === 'reschedule') {
          prompt += `\n📋 أكملتِ إعادة جدولة موعد. اسألي: "هل تحتاج شيء ثاني؟"\n`;
        }
        break;
    }

    // Patient identification status
    if (!ctx.patientIdentified) {
      prompt += `\n⚠️ المريض غير معروف الهوية — بعض الأدوات (إلغاء) غير متاحة.\n`;
      prompt += `لكن يمكنك استخدام book_appointment_guest لحجز موعد لمريض جديد (يتطلب: الاسم الأول، الاسم الأخير، رقم الجوال).\n`;
    }

    // Show completed sub-flow summaries
    if (ctx.subFlowHistory && ctx.subFlowHistory.length > 0) {
      prompt += `\n📋 الإجراءات المكتملة في هذه المحادثة:\n`;
      for (const sf of ctx.subFlowHistory) {
        prompt += `- ${sf.outcome}\n`;
      }
      prompt += `لا تخلط بين بيانات الحجوزات السابقة والحجز الحالي.\n`;
    }

    // Show suspended state info (from state stack)
    if (ctx.stateStack && ctx.stateStack.length > 1) {
      const suspended = ctx.stateStack.slice(1);
      if (suspended.includes('booking') && ctx.booking) {
        const parts: string[] = [];
        if (ctx.booking.serviceName) parts.push(ctx.booking.serviceName);
        if (ctx.booking.providerName) parts.push(ctx.booking.providerName);
        if (ctx.booking.date) parts.push(ctx.booking.date);
        prompt += `\n📌 ملاحظة: المريض لديه حجز قيد التنفيذ (${parts.join(' — ') || 'الخطوة: ' + ctx.booking.step}). بعد الإجابة على سؤاله الحالي، ارجع لاستكمال الحجز.\n`;
      }
    }

    return prompt;
  }

  /**
   * Get booking sub-step instructions.
   * Branches by patientIdentified for anonymous vs identified booking paths.
   */
  private getBookingStepPrompt(booking?: BookingContext, patientIdentified = true): string {
    if (!booking) return '1. اسألي المريض عن الخدمة المطلوبة';

    switch (booking.step) {
      case 'service':
        return (
          '**الخطوة 1 — تحديد الخدمة، ثم عرض الأيام المتاحة فوراً**\n' +
          '\n' +
          'أ) إذا المريض ما ذكر خدمة بعد:\n' +
          '   اسألي "وش نوع الموعد اللي تحتاجه؟ (مثلاً: تنظيف أسنان، كشف عام، تبييض...)"\n' +
          '   ⛔ لا تعرضي قائمة خدمات مرقمة — اذكري ٣-٤ أمثلة بشكل طبيعي\n' +
          '\n' +
          'ب) إذا المريض ذكر خدمة (مثل "تنظيف أسنان"):\n' +
          '   ١. إذا عندك serviceId للخدمة من "قائمة الخدمات" في السياق → استخدمها\n' +
          '   ٢. إذا ما عندك serviceId → استدعي list_services أولاً للحصول على الـ UUID\n' +
          '   ٣. **ثم استدعي browse_available_dates مع serviceId — فوراً بنفس الدور**\n' +
          '   ٤. **اعرضي كل الأيام اللي رجعت الأداة** (مش يوم واحد فقط) — المريض يبغى يشوف كل الخيارات\n' +
          '   ⛔ لا تسألي "وش الأيام اللي تناسبك؟" — العيادة مفتوحة بأيام معينة، والمريض لا يعرفها. اعرضي الأيام أولاً.\n' +
          '\n' +
          'ج) إذا المريض ذكر شكوى بدلاً من خدمة ("عندي ألم في ظهري"):\n' +
          '   ١. اقترحي الخدمة المناسبة ("أنصحك بكشف عام")\n' +
          '   ٢. انتظري موافقته، ثم تابعي كما في (ب)\n' +
          '\n' +
          'د) إذا المريض سأل "متى أنتم مفتوحين؟" أو "ايش أيام العمل؟":\n' +
          '   استدعي browse_available_dates (بدون فلاتر) — تعرض كل أيام وساعات العمل\n' +
          '\n' +
          'مثال رد صحيح بعد "ابغى تنظيف أسنان":\n' +
          '   "تمام! هذي الأيام المتاحة لتنظيف الأسنان 👇" ثم اعرضي نتيجة browse_available_dates بالكامل ثم "أي يوم وأي دكتور يناسبك؟"'
        );
      case 'provider':
        return (
          `1. ✅ الخدمة: ${booking.serviceName ?? 'تم الاختيار'}\n` +
          '2. ✅ حددي الطبيب:\n' +
          '   استخدمي browse_available_dates (مع serviceId) لعرض الأطباء المتاحين والأيام مباشرة\n' +
          '   مثال: "الأطباء المتاحين لـ ' + (booking.serviceName ?? 'هذه الخدمة') + ':\n' +
          '   📆 الأحد — د. أحمد (٣ مواعيد) | د. سارة (٥ مواعيد)\n' +
          '   أي دكتور ويوم يناسبك؟"\n' +
          '   لا تسألي "عندك دكتور معين؟" بدون ما تعرضي المتاحين'
        );
      case 'date':
        return (
          `1. ✅ الخدمة: ${booking.serviceName ?? 'تم'}\n` +
          `2. ✅ الطبيب: ${booking.providerName ?? 'تم'}\n` +
          '3. ✅ حددي التاريخ:\n' +
          '   - إذا المريض لم يحدد تاريخ: استخدمي browse_available_dates لعرض الأيام المتاحة\n' +
          '   - إذا المريض حدد تاريخ: استخدمي check_availability لعرض الأوقات'
        );
      case 'time':
        if (patientIdentified) {
          return (
            `1. ✅ الخدمة: ${booking.serviceName ?? 'تم'}${booking.serviceId ? ` [serviceId: ${booking.serviceId}]` : ''}\n` +
            `2. ✅ الطبيب: ${booking.providerName ?? 'تم'}${booking.providerId ? ` [providerId: ${booking.providerId}]` : ''}\n` +
            `3. ✅ التاريخ: ${booking.date ?? 'تم'}\n` +
            '4. ✅ اختاري الوقت من المواعيد المتاحة\n' +
            '   بعد اختيار الوقت: استخدمي hold_appointment لحجز الموعد مؤقتاً ثم اعرضي الملخص للتأكيد'
          );
        }
        // Anonymous patient: combined time + guest_info instructions
        return (
          `المريض غير مسجل — مسار الحجز السريع:\n` +
          `الخدمة المختارة: ${booking.serviceName ?? '(ارجعي لسياق المحادثة)'}${booking.serviceId ? ` — serviceId: ${booking.serviceId}` : ''}\n` +
          `الطبيب المختار: ${booking.providerName ?? '(ارجعي لسياق المحادثة)'}${booking.providerId ? ` — providerId: ${booking.providerId}` : ''}\n` +
          `التاريخ: ${booking.date ?? '(ارجعي لسياق المحادثة)'}\n\n` +
          '**الخطوات:**\n' +
          '1. إذا المريض لم يحدد الوقت بعد → اعرضي الأوقات واطلبي منه يختار\n' +
          '2. بعد اختيار الوقت → اطلبي الاسم الأول والأخير فقط (رقم الجوال عندك من الواتساب)\n' +
          '3. **فوراً بعد الحصول على الاسم** → استدعي book_appointment_guest مع:\n' +
          '   - firstName و lastName من رد المريض\n' +
          '   - phone: رقم الواتساب الموجود في قسم "رقم جوال المريض" أعلاه\n' +
          '   - providerId: UUID الطبيب المختار (ابحثي في قسم "الأطباء" أعلاه بالاسم)\n' +
          '   - serviceId: UUID الخدمة المختارة (ابحثي في قسم "الخدمات المتاحة" أعلاه بالاسم)\n' +
          '   - date: التاريخ بصيغة YYYY-MM-DD\n' +
          '   - time: الوقت بصيغة HH:MM (24 ساعة)\n\n' +
          '⚠️ لا تسألي عن رقم الجوال — عندك من الواتساب\n' +
          '⚠️ لا تستخدمي hold_appointment — المريض غير مسجل\n' +
          '⚠️ لا تسألي أسئلة إضافية بعد الحصول على الاسم — احجزي فوراً'
        );
      case 'guest_info':
        return (
          `**⚡ المريض أعطى اسمه — احجزي الموعد الآن فوراً!**\n\n` +
          `الخدمة: ${booking.serviceName ?? '(ارجعي لسياق المحادثة)'}${booking.serviceId ? ` — serviceId: ${booking.serviceId}` : ''}\n` +
          `الطبيب: ${booking.providerName ?? '(ارجعي لسياق المحادثة)'}${booking.providerId ? ` — providerId: ${booking.providerId}` : ''}\n` +
          `التاريخ: ${booking.date ?? '(ارجعي لسياق المحادثة)'}\n` +
          `الوقت: ${booking.time ?? '(ارجعي لسياق المحادثة)'}\n\n` +
          '**استدعي book_appointment_guest الآن** مع:\n' +
          '- firstName و lastName: من آخر رسالة للمريض\n' +
          '- phone: رقم الواتساب من قسم "رقم جوال المريض" أعلاه\n' +
          '- providerId: UUID الطبيب (ابحثي في قسم "الأطباء" أعلاه بالاسم)\n' +
          '- serviceId: UUID الخدمة (ابحثي في قسم "الخدمات المتاحة" أعلاه بالاسم)\n' +
          '- date: التاريخ بصيغة YYYY-MM-DD\n' +
          '- time: الوقت بصيغة HH:MM\n\n' +
          '⚠️ لا تسألي أي سؤال — كل البيانات متوفرة. استدعي الأداة فوراً!'
        );
      case 'hold':
        return (
          `1. ✅ الخدمة: ${booking.serviceName ?? 'تم'}${booking.serviceId ? ` [serviceId: ${booking.serviceId}]` : ''}\n` +
          `2. ✅ الطبيب: ${booking.providerName ?? 'تم'}${booking.providerId ? ` [providerId: ${booking.providerId}]` : ''}\n` +
          `3. ✅ التاريخ: ${booking.date ?? 'تم'}\n` +
          `4. ✅ الوقت: ${booking.time ?? 'تم'}\n` +
          '5. ⏳ استخدمي hold_appointment لحجز الموعد مؤقتاً ثم اعرضي ملخص للتأكيد'
        );
      case 'confirm':
        return (
          `⏳ الموعد محجوز مؤقتاً (10 دقائق — ينتهي تلقائياً)${booking.holdAppointmentId ? ` — appointmentId: ${booking.holdAppointmentId}` : ''}\n` +
          `${booking.serviceName ?? ''}${booking.serviceId ? ` [serviceId: ${booking.serviceId}]` : ''} مع ${booking.providerName ?? ''}${booking.providerId ? ` [providerId: ${booking.providerId}]` : ''} — ${booking.date ?? ''} ${booking.time ?? ''}\n` +
          '   اعرضي ملخص مختصر (3 أسطر كحد أقصى) واسألي "أأكد الحجز؟"\n' +
          '   إذا قال نعم: استخدمي book_appointment مع holdAppointmentId\n' +
          '   إذا قال لا: أخبريه أن الحجز المؤقت سينتهي تلقائياً\n' +
          '   ⚠️ إذا المريض تأخر ورجع بعد انتهاء الـ 10 دقائق:\n' +
          '   أخبريه "عذراً، الحجز المؤقت انتهى" ثم استخدمي check_availability للتأكد من التوفر'
        );
      default:
        return '1. اسألي المريض عن الخدمة المطلوبة';
    }
  }

  /**
   * Persist flow context to the conversation's context JSON field.
   */
  async saveContext(conversationId: string, ctx: FlowContext): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
      select: { context: true },
    });

    const existingContext = (conversation?.context as Record<string, unknown>) ?? {};

    await this.prisma.conversation.update({
      where: { conversationId },
      data: {
        currentStep: ctx.state,
        context: {
          ...existingContext,
          flow: {
            state: ctx.state,
            stateStack: ctx.stateStack,
            booking: ctx.booking ?? null,
            subFlowId: ctx.subFlowId ?? null,
            subFlowHistory: ctx.subFlowHistory ?? [],
            turnCount: ctx.turnCount,
            maxTurns: ctx.maxTurns,
            lastToolCalls: ctx.lastToolCalls,
            patientIdentified: ctx.patientIdentified,
            orgName: ctx.orgName ?? null,
            patientName: ctx.patientName ?? null,
            lastCompletedAction: ctx.lastCompletedAction ?? null,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Load flow context from the conversation's context JSON field.
   */
  async loadContext(conversationId: string): Promise<FlowContext | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
      select: { context: true, currentStep: true, patientId: true },
    });

    if (!conversation) return null;

    const ctx = (conversation.context as Record<string, unknown>)?.flow as Partial<FlowContext> | undefined;

    const state = (ctx?.state ?? conversation.currentStep ?? 'start') as ConversationState;
    const loaded = this.initContext(
      {
        state,
        stateStack: (ctx?.stateStack as ConversationState[] | undefined) ?? [state],
        booking: ctx?.booking,
        subFlowId: (ctx?.subFlowId as string | null) ?? null,
        subFlowHistory: (ctx?.subFlowHistory as SubFlowRecord[] | undefined) ?? [],
        turnCount: ctx?.turnCount ?? 0,
        maxTurns: ctx?.maxTurns ?? DEFAULT_MAX_TURNS,
        lastToolCalls: ctx?.lastToolCalls ?? [],
        patientIdentified: ctx?.patientIdentified ?? !!conversation.patientId,
      },
      !!conversation.patientId,
    );
    loaded.orgName = ctx?.orgName ?? undefined;
    loaded.patientName = ctx?.patientName ?? undefined;
    loaded.lastCompletedAction = ctx?.lastCompletedAction ?? undefined;
    return loaded;
  }

  /**
   * Start a new sub-flow (booking, cancelling).
   * Isolates context from previous completed sub-flows.
   */
  startSubFlow(ctx: FlowContext, type: 'booking' | 'cancelling' | 'rescheduling'): FlowContext {
    const subFlowId = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      ...ctx,
      subFlowId,
      booking: type === 'booking' ? { step: 'service' } : undefined,
    };
  }

  /**
   * Seal a completed sub-flow — record its outcome and clear booking context.
   */
  sealSubFlow(ctx: FlowContext, outcome: string): FlowContext {
    const record: SubFlowRecord = {
      id: ctx.subFlowId || 'unknown',
      type: ctx.state === 'booking' ? 'booking'
        : ctx.state === 'cancelling' ? 'cancelling'
        : 'booking',
      outcome,
      completedAt: new Date().toISOString(),
    };

    return {
      ...ctx,
      subFlowId: null,
      booking: undefined,
      subFlowHistory: [...ctx.subFlowHistory, record],
    };
  }

  /**
   * Create a snapshot of the current flow context for session resumption.
   */
  createSnapshot(ctx: FlowContext): Record<string, unknown> {
    return {
      state: ctx.state,
      booking: ctx.booking ?? null,
      patientIdentified: ctx.patientIdentified,
      orgName: ctx.orgName ?? null,
      patientName: ctx.patientName ?? null,
      snapshotAt: new Date().toISOString(),
    };
  }

  /**
   * Resume a conversation from a session snapshot.
   * Returns a restored FlowContext and a summary string for the system prompt.
   */
  resumeFromSnapshot(
    snapshot: Record<string, unknown>,
    patientIdentified: boolean,
  ): { ctx: FlowContext; resumeSummary: string } {
    const restoredBooking = snapshot.booking as BookingContext | null;
    const wasBooking = snapshot.state === 'booking' && restoredBooking;

    const ctx = this.initContext(
      {
        state: wasBooking ? 'booking' : 'active',
        booking: wasBooking ? restoredBooking : undefined,
        turnCount: 0,
        patientIdentified,
      },
      patientIdentified,
    );
    ctx.orgName = snapshot.orgName as string | undefined;
    ctx.patientName = snapshot.patientName as string | undefined;

    // Build a summary for the system prompt
    let summary = '';
    if (wasBooking && restoredBooking) {
      const parts: string[] = [];
      if (restoredBooking.serviceName) parts.push(`الخدمة: ${restoredBooking.serviceName}`);
      if (restoredBooking.providerName) parts.push(`الطبيب: ${restoredBooking.providerName}`);
      if (restoredBooking.date) parts.push(`التاريخ: ${restoredBooking.date}`);
      if (restoredBooking.time) parts.push(`الوقت: ${restoredBooking.time}`);
      summary = `\n## استكمال محادثة سابقة\nالمريض كان يحجز موعد سابقاً وتوقف عند الخطوة: ${restoredBooking.step}\n${parts.join(' | ')}\nاسأله إذا يبي يكمل الحجز أو يبدأ من جديد.\n`;
    } else if (snapshot.patientName) {
      summary = `\n## استكمال محادثة سابقة\nالمريض ${snapshot.patientName} تواصل معنا سابقاً. رحّب به واسأله عن طلبه.\n`;
    }

    return { ctx, resumeSummary: summary };
  }

  /**
   * Check if conversation has exceeded turn budget.
   */
  isBudgetExceeded(ctx: FlowContext): boolean {
    return ctx.turnCount >= ctx.maxTurns;
  }

  /**
   * Check if budget warning should be shown.
   */
  shouldWarnBudget(ctx: FlowContext): boolean {
    return ctx.turnCount >= HANDOFF_WARNING_TURNS && ctx.turnCount < ctx.maxTurns;
  }
}
