import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';
import { getLLMService, ChatMessage } from '../llm.js';
import { buildSystemPrompt } from '../systemPrompt.js';
import { GuardrailsService, ValidationContext } from '../ai/guardrails.js';
import { redactPII } from '../security/piiRedactor.js';

// ─────────────────────────────────────────────────────────
// WhatsApp Conversational AI Handler
// Processes incoming WhatsApp messages via Twilio,
// generates AI responses, and sends replies.
// ─────────────────────────────────────────────────────────

/** WhatsApp-specific system prompt addendum for concise, Arabic-first messaging */
const WHATSAPP_PROMPT_ADDENDUM = `

## قناة المحادثة: واتساب 📱

### تعليمات خاصة بالواتساب:
- أجب بالعربية (اللهجة الخليجية) بشكل افتراضي. إذا كتب المريض بالإنجليزية، أجب بالإنجليزية.
- كن مختصراً ومباشراً — رسائل الواتساب يجب أن تكون قصيرة وواضحة.
- استخدم الإيموجي بشكل طبيعي ومعتدل (✅ 📅 💊 🏥 ⏰).
- لا ترسل جدران نصية — استخدم نقاط مختصرة إذا لزم الأمر.
- إذا كان المريض يحتاج إلى مكالمة، أعطه رقم العيادة.
- أنت مساعد ذكي للعيادة — تساعد في:
  • حجز المواعيد 📅
  • الاستفسار عن المواعيد القادمة
  • طلب إعادة صرف الأدوية 💊
  • الأسئلة الشائعة والاستفسارات العامة
  • توجيه المريض للقسم المناسب
- لا تقدم أي استشارات طبية أو تشخيصات.
- إذا كان الطلب طارئاً، وجّه المريض للطوارئ فوراً 🚨.

### أسلوب الرد:
- ابدأ بالترحيب فقط في أول رسالة (مثال: "أهلاً وسهلاً! 👋")
- في الرسائل التالية، ادخل في الموضوع مباشرة
- استخدم "حياك الله" أو "تفضل" بدلاً من عبارات رسمية طويلة
`;

/** Normalize phone number to E.164 format */
function normalizePhone(phone: string): string {
  // Strip the whatsapp: prefix if present
  let normalized = phone.replace(/^whatsapp:/, '');
  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }
  return normalized;
}

export class WhatsAppHandler {
  constructor(
    private prisma: PrismaClient,
    private twilioClient: Twilio | null,
    private twilioPhoneNumber?: string,
    private log?: { info: Function; warn: Function; error: Function },
  ) {}

  /**
   * Process an incoming WhatsApp message end-to-end.
   * Returns the AI response text.
   */
  async handleIncoming(
    from: string,
    body: string,
    messageSid: string,
    orgId: string,
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

    // 5. Build AI context
    const systemPrompt = await this.buildContext(orgId, conversationId, patient?.patientId ?? null);

    // 6. Load last 10 messages for conversation history
    const historyMessages = await this.prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    const chatMessages: ChatMessage[] = historyMessages.map((m) => ({
      role: m.direction === 'in' ? 'user' as const : 'assistant' as const,
      content: m.bodyText || '',
    }));

    // 7. Call LLM
    const llmService = getLLMService();
    let response = await llmService.chat(chatMessages, systemPrompt);

    // 8. Guardrails validation
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

    // 9. PII-redact the response for logging
    let redactedResponse = response;
    try {
      redactedResponse = redactPII(response).redactedText;
    } catch (_) { /* keep original */ }

    // 10. Send response via Twilio WhatsApp
    await this.sendMessage(phone, response);

    // 11. Save AI response message
    await this.prisma.conversationMessage.create({
      data: {
        conversationId,
        direction: 'out',
        bodyText: redactedResponse,
        payload: {
          source: 'whatsapp',
          model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
          confidence: guardrailResult?.confidence ?? null,
          guardrailFlags: guardrailResult?.flags?.map((f) => f.type) ?? [],
        },
      },
    });

    // 12. Update conversation last activity
    await this.prisma.conversation.update({
      where: { conversationId },
      data: { lastActivityAt: new Date() },
    });

    return response;
  }

  /**
   * Send a WhatsApp message via Twilio.
   */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.twilioClient) {
      this.log?.warn('Twilio not configured — WhatsApp message not sent (dev mode)');
      return;
    }

    const fromNumber = this.twilioPhoneNumber;
    if (!fromNumber) {
      throw new Error('TWILIO_PHONE_NUMBER not configured');
    }

    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromFormatted = `whatsapp:${fromNumber}`;

    await this.twilioClient.messages.create({
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
   */
  private async getOrCreateConversation(
    orgId: string,
    messagingUserId: string,
    phone: string,
    patientId: string | null,
  ) {
    // Look for an active conversation on this WhatsApp thread
    const existing = await this.prisma.conversation.findFirst({
      where: {
        orgId,
        messagingUserId,
        channel: 'whatsapp',
        status: 'active',
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    // If found and last activity within 24h, reuse it
    if (existing) {
      const hoursSinceActivity =
        (Date.now() - new Date(existing.lastActivityAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceActivity < 24) {
        return existing;
      }

      // Close stale conversation
      await this.prisma.conversation.update({
        where: { conversationId: existing.conversationId },
        data: { status: 'closed' },
      });
    }

    // Create new conversation
    return this.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId,
        channel: 'whatsapp',
        externalThreadId: `wa-${phone}-${Date.now()}`,
        patientId: patientId ?? undefined,
        status: 'active',
        currentStep: 'whatsapp_chat',
        context: { type: 'whatsapp_chat', phone },
      },
    });
  }

  /**
   * Build the AI system prompt with org context + patient context + WhatsApp addendum.
   */
  private async buildContext(
    orgId: string,
    conversationId: string,
    patientId: string | null,
  ): Promise<string> {
    // Base system prompt with org data (departments, providers, services, etc.)
    let prompt = await buildSystemPrompt(this.prisma, orgId);

    // Add patient-specific context if we know who they are
    if (patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { patientId },
        select: { firstName: true, lastName: true },
      });

      if (patient) {
        prompt += `\n## بيانات المريض الحالي\n`;
        prompt += `- الاسم: ${patient.firstName} ${patient.lastName}\n`;
      }

      // Upcoming appointments
      const upcomingAppointments = await this.prisma.appointment.findMany({
        where: {
          patientId,
          startTs: { gte: new Date() },
          status: { in: ['booked', 'confirmed'] },
        },
        include: {
          provider: { select: { displayName: true } },
          service: { select: { name: true } },
          facility: { select: { name: true } },
        },
        orderBy: { startTs: 'asc' },
        take: 5,
      });

      if (upcomingAppointments.length > 0) {
        prompt += `\n### المواعيد القادمة:\n`;
        for (const apt of upcomingAppointments) {
          const date = apt.startTs.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          const time = apt.startTs.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
          });
          prompt += `- ${apt.service.name} مع ${apt.provider.displayName}`;
          if (apt.facility) prompt += ` في ${apt.facility.name}`;
          prompt += ` — ${date} الساعة ${time}\n`;
        }
      }

      // Active prescriptions
      const prescriptions = await this.prisma.prescription.findMany({
        where: { patientId, status: 'active' },
        select: {
          medicationName: true,
          medicationNameAr: true,
          dosage: true,
          refillsRemaining: true,
        },
        take: 5,
      });

      if (prescriptions.length > 0) {
        prompt += `\n### الأدوية الحالية:\n`;
        for (const rx of prescriptions) {
          const name = rx.medicationNameAr || rx.medicationName;
          prompt += `- ${name} (${rx.dosage}) — إعادة صرف متبقية: ${rx.refillsRemaining}\n`;
        }
      }
    }

    // Append WhatsApp-specific instructions
    prompt += WHATSAPP_PROMPT_ADDENDUM;

    return prompt;
  }
}
