import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';
import { getLLMService, ChatMessage } from '../llm.js';
import { buildWhatsAppSystemPrompt } from '../systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../ai/guardrails.js';
import { ToolRegistry } from '../ai/toolRegistry.js';
import { ConversationFlowManager, FlowContext } from '../ai/conversationFlow.js';
import { SessionCompactor } from '../ai/sessionCompactor.js';
import { redactPII } from '../security/piiRedactor.js';
import { checkAndIncrement, AI_LIMIT_ERROR } from '../usage/aiUsageLimiter.js';
import { ContextBuilder } from '../patient/contextBuilder.js';
import { OfferManager } from '../offers/offerManager.js';
import { MarketingConsentService } from '../compliance/marketingConsent.js';

// ─────────────────────────────────────────────────────────
// WhatsApp Conversational AI Handler
// Processes incoming WhatsApp messages via Twilio,
// generates AI responses with tool calling, conversation
// flow control, and session compaction.
// ─────────────────────────────────────────────────────────

/** Normalize phone number to E.164 format */
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/^whatsapp:/, '');
  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }
  return normalized;
}

/**
 * Phase 5.1: Normalize Arabic text for fuzzy matching.
 * Strips diacritics, normalizes hamza/alef variants, normalizes ta marbuta.
 */
function normalizeArabic(text: string): string {
  return text
    // Strip tashkeel (diacritics)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize alef variants (أ إ آ ٱ) → ا
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize ta marbuta → ha
    .replace(/ة/g, 'ه')
    // Normalize alef maqsura → ya
    .replace(/ى/g, 'ي')
    // Normalize waw hamza
    .replace(/ؤ/g, 'و')
    // Normalize ya hamza
    .replace(/ئ/g, 'ي')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phase 5.1: Fuzzy keyword matching with Levenshtein distance.
 * Returns true if the message contains the keyword (exact or within edit distance 2).
 */
function fuzzyMatch(message: string, keyword: string): boolean {
  const normalizedKw = normalizeArabic(keyword);

  // Exact substring match (fastest path)
  if (message.includes(normalizedKw)) return true;

  // For short keywords (<=3 chars), only allow exact match
  if (normalizedKw.length <= 3) return false;

  // Check words in message against keyword with Levenshtein distance
  const words = message.split(/\s+/);
  for (const word of words) {
    if (levenshtein(word, normalizedKw) <= 2) return true;
  }

  // Check sliding window of keyword length across message
  for (let i = 0; i <= message.length - normalizedKw.length; i++) {
    const substr = message.slice(i, i + normalizedKw.length);
    if (levenshtein(substr, normalizedKw) <= 1) return true;
  }

  return false;
}

/** Simple Levenshtein distance */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

export class WhatsAppHandler {
  private flowManager: ConversationFlowManager;
  private compactor: SessionCompactor;

  constructor(
    private prisma: PrismaClient,
    private twilioClient: Twilio | null,
    private twilioPhoneNumber?: string,
    private log?: { info: Function; warn: Function; error: Function },
  ) {
    this.flowManager = new ConversationFlowManager(prisma);
    this.compactor = new SessionCompactor();
  }

  /**
   * Process an incoming WhatsApp message end-to-end.
   * Returns the AI response text.
   * @param skipSend If true, skip sending the reply (caller handles it — e.g. Baileys).
   */
  async handleIncoming(
    from: string,
    body: string,
    messageSid: string,
    orgId: string,
    skipSend = false,
  ): Promise<string> {
    const phone = normalizePhone(from);

    this.log?.info({ phone: redactPII(phone).redactedText, messageSid }, 'WhatsApp incoming message');

    // 1. Find or create MessagingUser
    let messagingUser = await this.prisma.messagingUser.findFirst({
      where: { orgId, channel: 'whatsapp', phoneE164: phone },
    });

    if (!messagingUser) {
      messagingUser = await this.prisma.messagingUser.create({
        data: {
          orgId,
          channel: 'whatsapp',
          externalUserId: phone,
          phoneE164: phone,
          displayName: phone,
        },
      });
    }

    // 2. Find patient by phone (via PatientContact)
    const patient = await this.findPatientByPhone(phone, orgId);

    // 3. Get or create conversation
    const conversation = await this.getOrCreateConversation(
      orgId,
      messagingUser.messagingUserId,
      phone,
      patient?.patientId ?? null,
    );
    const conversationId = conversation.conversationId;

    // 4. Save incoming message (PII-redacted bodyText)
    let redactedBody = body;
    try {
      redactedBody = redactPII(body).redactedText;
    } catch (_) { /* keep original if redaction fails */ }

    await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        platformMessageId: messageSid,
        direction: 'in',
        bodyText: redactedBody,
        payload: { source: 'whatsapp', twilioSid: messageSid },
      },
    });

    // 4b. Check pre-built WhatsApp templates (fast-path – no LLM needed)
    const templateResponse = await this.matchTemplate(body, orgId);
    if (templateResponse) {
      if (!skipSend) await this.sendMessage(phone, templateResponse);
      await this.prisma.conversationMessage.create({
        data: {
          conversationId,
          direction: 'out',
          bodyText: templateResponse,
          payload: { source: 'whatsapp_template' },
        },
      });
      await this.prisma.conversation.update({
        where: { conversationId },
        data: { lastActivityAt: new Date() },
      });
      return templateResponse;
    }

    // ─── Enhanced AI Pipeline ─────────────────────────────

    // 5. Load conversation flow context (with session resumption)
    let flowCtx = await this.flowManager.loadContext(conversationId);
    let resumeSummary = '';
    if (!flowCtx) {
      // Check for a session snapshot from a previous conversation
      const snapshot = messagingUser.lastSessionSnapshot as Record<string, unknown> | null;
      if (snapshot && snapshot.state) {
        const resumed = this.flowManager.resumeFromSnapshot(snapshot, !!patient);
        flowCtx = resumed.ctx;
        resumeSummary = resumed.resumeSummary;
        // Clear the snapshot so we don't re-use it
        await this.prisma.messagingUser.update({
          where: { messagingUserId: messagingUser.messagingUserId },
          data: { lastSessionSnapshot: null as any },
        });
        this.log?.info({ conversationId }, 'Session resumed from snapshot');
      } else {
        flowCtx = this.flowManager.initContext(undefined, !!patient);
      }
    }
    flowCtx.patientIdentified = !!patient;

    // 6. Check turn budget
    if (this.flowManager.isBudgetExceeded(flowCtx)) {
      const budgetMsg = 'عذراً، المحادثة طويلة جداً. سيتم تحويلك لموظف خدمة العملاء. 🔄';
      if (!skipSend) await this.sendMessage(phone, budgetMsg);
      await this.saveOutgoingMessage(conversationId, budgetMsg, { source: 'budget_exceeded' });
      flowCtx.state = 'handoff';
      await this.flowManager.saveContext(conversationId, flowCtx);
      return budgetMsg;
    }

    // 7. Build AI context (inject resume summary if session was restored)
    let systemPrompt = await this.buildContext(orgId, conversationId, patient?.patientId ?? null, flowCtx, phone);
    if (resumeSummary) {
      systemPrompt += resumeSummary;
    }

    // 8. Load conversation history + session compaction
    const allMessages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    let chatMessages: ChatMessage[] = allMessages.map((m) => ({
      role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
      content: m.bodyText || '',
    }));

    // Session compaction: summarize old messages if conversation is long
    const existingSummary = await this.prisma.conversationSummary.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      select: { summary: true },
    });

    const compactionResult = await this.compactor.compact(chatMessages, existingSummary?.summary);
    if (compactionResult.compacted) {
      chatMessages = compactionResult.messages;
      this.log?.info(
        { conversationId, from: compactionResult.originalCount, to: compactionResult.compactedCount },
        'Session compacted',
      );

      // Save the compaction summary
      if (compactionResult.summary) {
        await this.compactor.saveSummary(
          this.prisma,
          conversationId,
          compactionResult.summary,
          compactionResult.originalCount,
        ).catch(err => this.log?.error({ err }, 'Failed to save compaction summary'));
      }
    }

    // 9. Initialize tool registry with conversation context
    const permissionLevel = patient ? 'identified' : 'anonymous';
    const toolRegistry = new ToolRegistry(
      this.prisma,
      orgId,
      patient?.patientId ?? null,
      conversationId,
    );
    toolRegistry.setPermissionLevel(permissionLevel);
    toolRegistry.setChannel('whatsapp');
    // Detect patient language for tool output formatting
    const isEnglish = /^[a-zA-Z\s.,!?'"\d:;@#$%&*()\-/]+$/.test(body.trim());
    if (isEnglish) {
      toolRegistry.setPatientLanguage('en');
    }
    const tools = toolRegistry.getToolDefinitions(permissionLevel);

    // 10. AI usage limit check
    const usageCheck = await checkAndIncrement(this.prisma, orgId);
    if (!usageCheck.allowed) {
      const limitMsg = `${AI_LIMIT_ERROR.ar}\n\n${AI_LIMIT_ERROR.en}`;
      await this.sendMessage(phone, limitMsg);
      return limitMsg;
    }

    // 11. Call LLM with tools (agentic loop)
    const llmService = getLLMService();
    const llmResult = await llmService.chatWithTools(
      chatMessages,
      systemPrompt,
      tools,
      (name, args) => toolRegistry.executeTool(name, args),
      {
        maxIterations: 6,
        onToolCall: (name, _args) => {
          this.log?.info({ conversationId, tool: name }, 'AI calling tool');
        },
      },
    );

    let response = llmResult.response;

    // 11. Update conversation flow based on tool calls and message
    const toolCallNames = llmResult.toolCalls.map(tc => tc.toolName);
    const previousState = flowCtx.state;
    flowCtx = this.flowManager.detectIntentAndTransition(
      flowCtx.state,
      body,
      toolCallNames,
      flowCtx,
    );
    flowCtx = this.flowManager.updateBookingProgress(
      flowCtx,
      toolCallNames,
      llmResult.toolCalls.map(tc => tc.result),
      llmResult.toolCalls.map(tc => ({ [tc.toolName]: tc.args })),
    );

    // If guest booking just completed, upgrade permission for remaining conversation
    if (toolCallNames.includes('book_appointment_guest') && !patient) {
      const newPatient = await this.findPatientByPhone(phone, orgId);
      if (newPatient) {
        toolRegistry.setPermissionLevel('identified');
        flowCtx.patientIdentified = true;
      }
    }

    // Sub-flow isolation: start a new sub-flow when entering a task state
    const TASK_STATES = ['booking', 'cancelling', 'rescheduling', 'prescription'] as const;
    if (previousState !== flowCtx.state) {
      if ((TASK_STATES as readonly string[]).includes(flowCtx.state) && !flowCtx.subFlowId) {
        flowCtx = this.flowManager.startSubFlow(flowCtx, flowCtx.state as typeof TASK_STATES[number]);
      }
      // Seal sub-flow when returning to active after a task flow
      if (flowCtx.state === 'active' && (TASK_STATES as readonly string[]).includes(previousState) && flowCtx.subFlowId) {
        const outcome = previousState === 'booking'
          ? `حجز ${flowCtx.booking?.serviceName ?? 'موعد'} ${flowCtx.booking?.providerName ? 'مع ' + flowCtx.booking.providerName : ''} ${flowCtx.booking?.date ?? ''}`.trim()
          : previousState === 'cancelling' ? 'إلغاء موعد'
          : previousState === 'rescheduling' ? 'إعادة جدولة موعد'
          : 'استفسار عن أدوية';
        flowCtx = this.flowManager.sealSubFlow(flowCtx, outcome);
      }
    }

    // 12. Guardrails validation
    let guardrailResult = null;
    try {
      const guardrails = new GuardrailsService(this.prisma);
      const validationContext: ValidationContext = {
        orgId,
        conversationId,
        patientId: patient?.patientId,
        userMessage: body,
        aiResponse: response,
      };
      guardrailResult = await guardrails.validateResponse(validationContext);

      if (!guardrailResult.approved && guardrailResult.sanitizedResponse) {
        this.log?.warn(
          { flags: guardrailResult.flags },
          'WhatsApp guardrails blocked AI response — using safe replacement',
        );
        response = guardrailResult.sanitizedResponse;
      }
    } catch (err) {
      this.log?.error({ err }, 'WhatsApp guardrails validation failed — using original response');
    }

    // 13. Send response via WhatsApp
    if (!skipSend) await this.sendMessage(phone, response);

    // 14. Save AI response message with tool call metadata
    await this.saveOutgoingMessage(conversationId, response, {
      source: 'whatsapp',
      model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
      confidence: guardrailResult?.confidence ?? null,
      guardrailFlags: guardrailResult?.flags?.map((f) => f.type) ?? [],
      toolCalls: llmResult.toolCalls.map(tc => ({
        tool: tc.toolName,
        durationMs: tc.durationMs,
      })),
      iterations: llmResult.totalIterations,
      conversationState: flowCtx.state,
    });

    // 15. Update conversation metadata
    await this.prisma.conversation.update({
      where: { conversationId },
      data: { lastActivityAt: new Date() },
    });

    // 16. Persist flow context
    await this.flowManager.saveContext(conversationId, flowCtx);

    return response;
  }

  /**
   * Send a WhatsApp message via Twilio.
   * Splits long messages at paragraph boundaries (WhatsApp limit ~4096 chars).
   */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.twilioClient) {
      this.log?.warn('Twilio not configured — WhatsApp message not sent (dev mode)');
      return;
    }

    const MAX_WA_LENGTH = 4000; // Leave margin from 4096 limit
    if (body.length <= MAX_WA_LENGTH) {
      await this.sendSingle(to, body);
      return;
    }

    // Split at paragraph boundaries for long messages
    const paragraphs = body.split('\n\n');
    let current = '';
    for (const para of paragraphs) {
      if ((current + '\n\n' + para).length > MAX_WA_LENGTH && current) {
        await this.sendSingle(to, current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current) await this.sendSingle(to, current.trim());
  }

  /** Send a single WhatsApp message via Twilio */
  private async sendSingle(to: string, body: string): Promise<void> {
    const fromNumber = this.twilioPhoneNumber;
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER not configured');
    }

    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromFormatted = `whatsapp:${fromNumber}`;

    await this.twilioClient!.messages.create({
      from: fromFormatted,
      to: toFormatted,
      body,
    });
  }

  /**
   * Find patient by phone number via PatientContact table.
   */
  private async findPatientByPhone(
    phone: string,
    orgId: string,
  ): Promise<{ patientId: string; firstName: string; lastName: string } | null> {
    const contact = await this.prisma.patientContact.findFirst({
      where: {
        contactType: 'phone',
        contactValue: phone,
        patient: { orgId },
      },
      include: {
        patient: {
          select: { patientId: true, firstName: true, lastName: true },
        },
      },
    });

    return contact?.patient ?? null;
  }

  /**
   * Get existing active conversation or create a new one.
   * On close: snapshots flow state to MessagingUser for session resumption.
   * On create: links to previous conversation for chaining.
   */
  private async getOrCreateConversation(
    orgId: string,
    messagingUserId: string,
    phone: string,
    patientId: string | null,
  ) {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        orgId,
        messagingUserId,
        channel: 'whatsapp',
        status: 'active',
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    if (existing) {
      const hoursSinceActivity =
        (Date.now() - new Date(existing.lastActivityAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceActivity < 24) {
        return existing;
      }

      // Snapshot flow state before closing for session resumption
      const flowCtx = await this.flowManager.loadContext(existing.conversationId);
      if (flowCtx) {
        const snapshot = this.flowManager.createSnapshot(flowCtx);
        await this.prisma.messagingUser.update({
          where: { messagingUserId },
          data: { lastSessionSnapshot: snapshot as any },
        });
      }

      await this.prisma.conversation.update({
        where: { conversationId: existing.conversationId },
        data: { status: 'closed' },
      });
    }

    return this.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId,
        channel: 'whatsapp',
        externalThreadId: `wa-${phone}-${Date.now()}`,
        patientId: patientId ?? undefined,
        previousConversationId: existing?.conversationId ?? undefined,
        status: 'active',
        currentStep: 'start',
        context: {
          type: 'whatsapp_chat',
          phone,
          flow: {
            state: 'start',
            turnCount: 0,
            maxTurns: 50,
            lastToolCalls: [],
            patientIdentified: !!patientId,
          },
        },
      },
    });
  }

  /**
   * Build the AI system prompt with org context + patient context +
   * conversation flow state (Arabic-first, no separate addendum needed).
   */
  private async buildContext(
    orgId: string,
    conversationId: string,
    patientId: string | null,
    flowCtx: FlowContext,
    whatsappPhone?: string,
  ): Promise<string> {
    let prompt = await buildWhatsAppSystemPrompt(this.prisma, orgId);

    // Fetch org name for greeting context
    const org = await this.prisma.org.findUnique({
      where: { orgId },
      select: { name: true },
    });
    flowCtx.orgName = org?.name ?? undefined;

    // Add patient-specific context if we know who they are
    if (patientId) {
      // Use comprehensive ContextBuilder (includes allergies, conditions, preferences, etc.)
      try {
        const ctxBuilder = new ContextBuilder(this.prisma);
        const patientContext = await ctxBuilder.buildPatientContext(patientId);
        // Budget: max 3000 chars for WhatsApp to stay within token limits
        if (patientContext) {
          prompt += patientContext.length > 3000
            ? patientContext.slice(0, 3000) + '\n'
            : patientContext;
        }
      } catch (_) {
        // Fallback: minimal patient info if ContextBuilder fails
        const patient = await this.prisma.patient.findUnique({
          where: { patientId },
          select: { firstName: true, lastName: true },
        });
        if (patient) {
          prompt += `\n## بيانات المريض الحالي\n`;
          prompt += `- الاسم: ${patient.firstName} ${patient.lastName}\n`;
        }
      }

      // Set patient name for flow context greeting
      const patientForName = await this.prisma.patient.findUnique({
        where: { patientId },
        select: { firstName: true },
      });
      if (patientForName) {
        flowCtx.patientName = patientForName.firstName;
      }
    }

    // Inject WhatsApp phone number so AI can use it for guest bookings
    if (whatsappPhone && !patientId) {
      prompt += `\n## رقم جوال المريض (من الواتساب)
- رقم الجوال: ${whatsappPhone}
- **لا تسألي المريض عن رقم جواله** — عندك رقمه من الواتساب
- عند استخدام book_appointment_guest، استخدمي هذا الرقم مباشرة
- اطلبي فقط الاسم الأول والأخير\n`;
    }

    // Conversation flow state instructions
    prompt += this.flowManager.getStatePrompt(flowCtx);

    return prompt;
  }

  /**
   * Save an outgoing message to the database.
   */
  private async saveOutgoingMessage(
    conversationId: string,
    text: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let redactedText = text;
    try {
      redactedText = redactPII(text).redactedText;
    } catch (_) { /* keep original */ }

    // Cast payload for Prisma JSON compatibility
    const safePayload = JSON.parse(JSON.stringify(payload));

    await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'out',
        bodyText: redactedText,
        payload: safePayload,
      },
    });
  }

  /**
   * Match incoming message against pre-built Arabic templates.
   * Phase 5.1: Uses Arabic normalization and fuzzy matching.
   * Returns a ready response string if matched, null otherwise.
   */
  private async matchTemplate(body: string, orgId: string): Promise<string | null> {
    const msg = normalizeArabic(body.trim().toLowerCase().replace(/[؟?!.]/g, ''));

    // ── Working hours ──────────────────────────────────────────────────────
    // Note: "مواعيد" removed — too ambiguous, false-matches "موعد" (appointment booking)
    const hoursKeywords = [
      'اوقات الدوام', 'أوقات الدوام', 'اوقات العمل', 'أوقات العمل',
      'ساعات العمل', 'ساعات الدوام', 'متى تفتح', 'متى تغلق', 'متى تفتحون', 'متى تقفلون',
      'وقت العمل', 'وقت الدوام', 'دوام العياده', 'دوام العيادة', 'دوام المستشفى',
      'working hours', 'opening hours', 'when do you open', 'when do you close',
    ];
    if (hoursKeywords.some((kw) => fuzzyMatch(msg, kw))) {
      const facilityForConfig = await this.prisma.facility.findFirst({ where: { orgId }, select: { facilityId: true } });
      const config = facilityForConfig ? await this.prisma.facilityConfig.findFirst({
        where: { facilityId: facilityForConfig.facilityId },
        select: { businessHours: true, greetingAr: true },
      }) : null;

      if (config?.businessHours) {
        const hours = config.businessHours as Record<string, any>;
        const lines = Object.entries(hours)
          .map(([day, h]: [string, any]) => `• ${day}: ${h.open ?? ''} – ${h.close ?? ''}`)
          .join('\n');
        return `🕐 ساعات عمل العيادة:\n${lines}\n\nللحجز أرسل "حجز" أو اتصل بنا 📞`;
      }

      // No facility config — let AI pipeline handle with get_facility_info tool
      return null;
    }

    // ── Visit cost ─────────────────────────────────────────────────────────
    // Note: removed bare "كم" — too generic (matches "كم الساعة", "كم عمرك", etc.)
    const costKeywords = [
      'تكلفة', 'سعر الكشف', 'سعر الزيارة', 'رسوم', 'أتعاب',
      'كم يكلف', 'كم السعر', 'كم الكشف', 'بكم الكشف', 'بكم الزيارة', 'بكم',
      'price', 'cost', 'fee', 'how much',
    ];
    if (costKeywords.some((kw) => fuzzyMatch(msg, kw))) {
      // Let LLM handle cost questions — it can use tools to look up actual service data
      // Only short generic queries (e.g., "بكم") get a brief nudge
      if (msg.length < 10) {
        return '💰 تكاليف الزيارة تختلف حسب نوع الخدمة والطبيب.\nوش الخدمة اللي تبي تعرف سعرها؟';
      }
      return null; // Let AI pipeline handle specific cost questions with tools
    }

    // ── Today's availability ───────────────────────────────────────────────
    // Note: removed generic "اليوم" (too broad), "هل في مواعيد"/"فيه مواعيد" (overlaps with booking intent)
    const todayKeywords = [
      'موعد اليوم', 'متاح اليوم', 'مواعيد اليوم', 'مواعيد متاحة اليوم',
      'available today', 'slots today', 'today available',
    ];
    if (todayKeywords.some((kw) => fuzzyMatch(msg, kw))) {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const dayOfWeek = now.getDay();
      const activeProviders = await this.prisma.providerAvailabilityRule.count({
        where: {
          provider: { orgId, active: true },
          dayOfWeek,
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
      });

      if (activeProviders === 0) {
        return '😔 عذراً، لا يوجد مواعيد متاحة اليوم.\nيمكنك الحجز ليوم آخر عبر الرابط أو التواصل معنا 📞';
      }

      return (
        `✅ يوجد مواعيد متاحة اليوم!\n` +
        `عدد الأطباء المتاحين: ${activeProviders}\n\n` +
        `للحجز أرسل "حجز" أو اكتب اسم الخدمة المطلوبة`
      );
    }

    // ── Marketing opt-out ───────────────────────────────────────────────
    const optOutKeywords = [
      'الغاء الاشتراك', 'إلغاء الاشتراك', 'الغاء', 'إلغاء', 'ايقاف', 'إيقاف',
      'لا ارغب', 'لا أرغب', 'وقف الرسائل', 'ما ابي رسائل',
      'stop', 'unsubscribe', 'opt out', 'optout',
    ];
    if (optOutKeywords.some((kw) => fuzzyMatch(msg, kw))) {
      // Check if this is specifically about marketing (not about an appointment)
      const isMarketingContext = msg.length < 30 || msg.includes('تسويق') || msg.includes('عروض') || msg.includes('رسائل');
      if (isMarketingContext) {
        // Find patient and revoke consent
        const patient = await this.findPatientByPhone(normalizePhone(''), orgId);
        if (patient) {
          const consentService = new MarketingConsentService(this.prisma);
          await consentService.revokeConsent(patient.patientId, orgId, {
            whatsappMarketing: false,
          });
        }
        return 'تم إلغاء اشتراكك من الرسائل التسويقية بنجاح ✅\nلن نرسل لك عروض بعد الآن.\nيمكنك إعادة الاشتراك في أي وقت من خلال بوابة المريض.';
      }
    }

    // ── Promo code detection ──────────────────────────────────────────────
    const promoCodeMatch = body.trim().toUpperCase().match(/^(NM[A-Z0-9]{4,6})$/);
    if (promoCodeMatch) {
      const offerManager = new OfferManager(this.prisma, null);
      const patient = await this.findPatientByPhone(normalizePhone(''), orgId);
      const result = await offerManager.validatePromoCode(promoCodeMatch[1], patient?.patientId);

      if (result.valid && result.offer) {
        const offer = result.offer;
        const discount = offer.discountUnit === 'percent'
          ? `${offer.discountValue}%`
          : `${(offer.discountValue || 0) / 100} ريال`;
        return (
          `✅ كود العرض صالح!\n\n` +
          `🎉 ${offer.nameAr || offer.name}\n` +
          `💰 خصم: ${discount}\n` +
          `⏰ صالح حتى: ${new Date(offer.validUntil).toLocaleDateString('ar-SA')}\n\n` +
          `للحجز باستخدام هذا العرض، أرسل "حجز" وسيتم تطبيق الخصم تلقائياً`
        );
      } else if (result.reason === 'expired') {
        return '⏰ عذراً، هذا العرض منتهي الصلاحية.';
      } else if (result.reason === 'max_redemptions_reached') {
        return '😔 عذراً، تم استنفاد عدد الاستخدامات المتاحة لهذا العرض.';
      } else if (result.reason === 'per_patient_limit_reached') {
        return '😔 عذراً، لقد استخدمت هذا العرض مسبقاً.';
      }
      // If invalid code, don't match — let it fall through to AI
    }

    // No template matched — fall through to AI pipeline
    return null;
  }
}
