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
    if (currentState === 'active' && FAREWELL_INTENTS.some(kw => msg.includes(kw))) {
      return { ...setActive('closed'), stateStack: ['closed'] };
    }

    // Intent-based transitions with interruption support
    if (HANDOFF_INTENTS.some(kw => msg.includes(kw))) {
      return { ...setActive('handoff'), stateStack: ['handoff'] };
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
            if (args.serviceId && typeof args.serviceId === 'string') {
              newBooking.serviceId = args.serviceId;
            }
            if (args.providerId && typeof args.providerId === 'string') {
              newBooking.providerId = args.providerId;
            }
          }
          if (toolName === 'check_availability') {
            // Extract selected provider/service/date from availability check
            if (args.providerId && typeof args.providerId === 'string') {
              newBooking.providerId = args.providerId;
            }
            if (args.serviceId && typeof args.serviceId === 'string') {
              newBooking.serviceId = args.serviceId;
            }
            if (args.date && typeof args.date === 'string') {
              newBooking.date = args.date;
            }
            newBooking.step = 'time'; // Patient is now picking a time slot
          }
          if (toolName === 'hold_appointment') {
            // Extract hold details and move to confirm step
            if (args.providerId) newBooking.providerId = args.providerId as string;
            if (args.serviceId) newBooking.serviceId = args.serviceId as string;
            if (args.date) newBooking.date = args.date as string;
            if (args.time) newBooking.time = args.time as string;
            newBooking.step = 'confirm';
          }
          if (toolName === 'book_appointment' || toolName === 'book_appointment_guest') {
            // Extract all booking details
            if (args.providerId) newBooking.providerId = args.providerId as string;
            if (args.serviceId) newBooking.serviceId = args.serviceId as string;
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
        prompt += `
## حالة المحادثة: بداية جديدة
- عرّفي نفسك باختصار واذكري اسم العيادة: "${ctx.orgName || 'العيادة'}"
- إذا كان المريض معروف، خاطبيه باسمه${ctx.patientName ? `: "${ctx.patientName}"` : ''}
- اسألي المريض كيف تقدرين تساعدينه — بدون سرد خدمات أو قدرات
  مثال: "حياك الله في ${ctx.orgName || 'العيادة'}! 😊 كيف أقدر أساعدك؟"
- ⛔ لا تذكري قائمة بما تقدرين تسوينه (حجز، استفسارات، إلخ) — خلي الرد قصير وطبيعي
`;
        break;

      case 'greeting':
        prompt += `
## حالة المحادثة: ترحيب
- ردّي بترحيب دافئ واذكري اسم العيادة "${ctx.orgName || 'العيادة'}"
- اسألي المريض كيف تقدرين تساعدينه بسؤال مفتوح وقصير
  مثال: "وعليكم السلام! حياك الله في ${ctx.orgName || 'العيادة'} 😊 كيف أقدر أساعدك؟"
- ⛔ لا تعرضي قائمة خدمات أو قدرات — انتظري المريض يوضح طلبه أولاً
- ⛔ لا تقولي "أقدر أساعدك بالحجز والاستفسارات و..." — هذا أسلوب آلي
`;
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
- إذا المريض لم يحدد تاريخ، استخدمي browse_available_dates لعرض الأيام المتاحة
- إذا المريض حدد تاريخ، استخدمي check_availability لعرض الأوقات المتاحة
- استخدمي أدوات البحث (search_providers, list_services) للعثور على الخيارات
- لا تختلقي مواعيد — استخدمي الأدوات فقط
- إذا غيّر المريض رأيه أو سأل عن شيء آخر، أجيبيه ثم عودي للحجز
- لا تطلبي من المريض تاريخ إذا هو يسأل عن المواعيد المتاحة — اعرضيها مباشرة
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
- اعرضي مواعيد المريض القادمة باستخدام list_patient_appointments
- اسأليه أي موعد يريد إلغاءه
- أكدي قبل الإلغاء
- استخدمي cancel_appointment لتنفيذ الإلغاء
`;
        break;

      case 'rescheduling':
        prompt += `
## حالة المحادثة: إعادة جدولة موعد 🔄
الخطوات:
١. اعرضي مواعيد المريض القادمة باستخدام list_patient_appointments
٢. اسأليه أي موعد يريد تغييره
٣. اسألي عن التاريخ/الوقت الجديد المرغوب
٤. استخدمي check_availability للتحقق من التوفر
٥. استخدمي reschedule_appointment لتنفيذ التغيير
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
- إذا المريض يسأل عن مواعيده، استخدمي list_patient_appointments
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
          '1. ✅ حددي الخدمة المطلوبة\n' +
          '   اسألي المريض عن نوع الموعد أو شكواه، مع ذكر ٣-٤ أمثلة شائعة بشكل طبيعي\n' +
          '   مثال: "وش نوع الموعد اللي تحتاجه؟ عندنا مثلاً كشف عام 🩺، أسنان 🦷، جلدية... أو قولي وش عندك وأساعدك أختار 😊"\n' +
          '   ⛔ لا تعرضي كل الخدمات كقائمة مرقمة — اذكري أمثلة فقط\n' +
          '   إذا المريض طلب القائمة الكاملة: استخدمي list_services مع تقسيمها حسب القسم إذا ممكن\n' +
          '\n' +
          '   إذا المريض ذكر شكوى صحية بدلاً من خدمة:\n' +
          '   - اقترحي الخدمة المناسبة بناءً على شكواه\n' +
          '   - "عندي ألم في ظهري" → "أنصحك بكشف عام"\n' +
          '   - "أبغى تحاليل" → "عندنا تحاليل مخبرية"\n' +
          '   - ثم اعرضي المواعيد المتاحة لهذه الخدمة مباشرة\n' +
          '\n' +
          '   إذا المريض يسأل عن المواعيد المتاحة مباشرة: استخدمي browse_available_dates'
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
