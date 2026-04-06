/**
 * Outbound Voice Handler
 *
 * Manages AI-driven outbound voice conversations.
 * When an outbound call is answered, this handler:
 *   1. Determines the campaign context & type
 *   2. Builds a campaign-specific system prompt
 *   3. Connects the call to the AI voice stream (Gemini or OpenAI)
 *   4. AI introduces itself with the campaign reason
 *   5. Handles the bidirectional conversation
 *   6. Logs outcome (answered, voicemail, no answer, completed, etc.)
 */
import { PrismaClient } from '@prisma/client';
import { buildVoiceSystemPrompt } from '../voicePrompt.js';
import type { ArabicDialect } from '../../types/voice.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutboundCallContext {
  campaignId?: string;
  targetId?: string;
  patientId?: string;
  orgId: string;
  campaignType?: string;
  campaignName?: string;
  scriptAr?: string | null;
  scriptEn?: string | null;
  patientName?: string;
  providerName?: string;
}

export type OutboundCallOutcome =
  | 'answered'
  | 'voicemail'
  | 'no_answer'
  | 'completed'
  | 'booked'
  | 'declined'
  | 'failed';

export interface OutboundVoiceResult {
  callSid: string;
  outcome: OutboundCallOutcome;
  durationSec?: number;
  notes?: string;
  bookedAppointmentId?: string;
}

// ---------------------------------------------------------------------------
// Campaign-specific prompt builders
// ---------------------------------------------------------------------------

const CAMPAIGN_INTRO_AR: Record<string, string> = {
  recall:
    'نتواصل معك لتذكيرك بموعد مراجعتك الطبية الدورية. صحتك تهمنا ونحب نساعدك تحجز موعد في أقرب وقت.',
  preventive:
    'نتواصل معك بخصوص فحوصات وقائية مهمة لصحتك. نود مساعدتك في حجز موعد للفحص.',
  follow_up:
    'نتواصل معك للاطمئنان على صحتك بعد زيارتك الأخيرة ونود التأكد إنك بخير.',
  satisfaction:
    'نتواصل معك للاستماع لرأيك عن تجربتك الأخيرة معنا. ملاحظاتك تساعدنا نتحسن.',
  announcement:
    'نتواصل معك لإبلاغك بمعلومات مهمة من عيادتك.',
};

const CAMPAIGN_INSTRUCTIONS_AR: Record<string, string> = {
  recall: `## هدف المكالمة
أنت تتصل بالمريض لتذكيره بأهمية المراجعة الدورية.
- اسأل عن أحواله الصحية بشكل عام
- ذكّره بأهمية المتابعة الطبية
- اعرض عليه حجز موعد
- إذا وافق، اسأل عن التاريخ والوقت المفضل
- إذا رفض، احترم قراره واشكره على وقته`,

  preventive: `## هدف المكالمة
أنت تتصل بالمريض لتنبيهه بفحوصات وقائية مهمة.
- اشرح أهمية الفحص الوقائي بشكل مبسط
- لا تخوف المريض — كن مطمئناً وإيجابياً
- اعرض حجز موعد للفحص
- إذا كان لديه أسئلة، أجب بشكل عام وانصحه بمناقشة التفاصيل مع الطبيب`,

  follow_up: `## هدف المكالمة
أنت تتصل بالمريض للمتابعة بعد زيارته الأخيرة.
- اسأل كيف حاله وهل تحسنت أعراضه
- اسأل إذا التزم بالأدوية أو التعليمات
- إذا كان يحتاج مراجعة، ساعده بحجز موعد
- إذا كان بخير، أخبره إنك سعيد بتحسنه`,

  satisfaction: `## هدف المكالمة
أنت تتصل بالمريض لاستطلاع رضاه.
- اسأل عن تجربته العامة
- اسأل عن وقت الانتظار والخدمة
- استمع لأي ملاحظات أو شكاوى
- اشكره على وقته وملاحظاته`,

  announcement: `## هدف المكالمة
أنت تتصل بالمريض لإبلاغه بمعلومات مهمة.
- أبلغ الرسالة بوضوح
- تأكد من فهم المريض
- أجب عن أي استفسارات عامة`,
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class OutboundVoiceHandler {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Build the outbound call context from query parameters.
   * Called when TwiML /outbound-response hits with campaign info.
   */
  async buildCallContext(params: {
    campaignId?: string;
    targetId?: string;
    patientId?: string;
    orgId: string;
    lang?: string;
  }): Promise<OutboundCallContext> {
    const ctx: OutboundCallContext = {
      orgId: params.orgId,
      campaignId: params.campaignId,
      targetId: params.targetId,
      patientId: params.patientId,
    };

    // Load campaign details
    if (params.campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { campaignId: params.campaignId },
      });
      if (campaign) {
        ctx.campaignType = campaign.type;
        ctx.campaignName = campaign.nameAr || campaign.name;
        ctx.scriptAr = campaign.scriptAr;
        ctx.scriptEn = campaign.scriptEn;
      }
    }

    // Load patient name
    if (params.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { patientId: params.patientId },
        select: { firstName: true, lastName: true },
      });
      if (patient) {
        ctx.patientName = `${patient.firstName} ${patient.lastName}`;
      }
    }

    return ctx;
  }

  /**
   * Build the system prompt for an outbound AI voice conversation.
   * Includes org-specific info + campaign-specific instructions.
   */
  async buildOutboundSystemPrompt(
    context: OutboundCallContext,
    dialect: ArabicDialect = 'gulf',
  ): Promise<string> {
    // Get the base voice prompt (org info, providers, services, etc.)
    const basePrompt = await buildVoiceSystemPrompt(this.prisma, context.orgId, dialect);

    // Get org name for the intro
    const org = await this.prisma.org.findUnique({
      where: { orgId: context.orgId },
      select: { name: true },
    });
    const orgName = org?.name || 'العيادة';

    // Campaign-specific additions
    const campaignType = context.campaignType || 'announcement';
    const intro = CAMPAIGN_INTRO_AR[campaignType] || CAMPAIGN_INTRO_AR['announcement'];
    const instructions = CAMPAIGN_INSTRUCTIONS_AR[campaignType] || CAMPAIGN_INSTRUCTIONS_AR['announcement'];

    const patientGreeting = context.patientName
      ? `مرحباً ${context.patientName}، معك توافد من ${orgName}.`
      : `مرحباً، معك توافد من ${orgName}.`;

    const outboundPrompt = `
## نوع المكالمة: مكالمة صادرة
هذه مكالمة صادرة — أنت من يتصل بالمريض، وليس العكس.

## التحية الأولى
ابدأ المكالمة بالضبط هكذا:
"${patientGreeting} ${intro}"

${instructions}

## قواعد المكالمات الصادرة
- قدم نفسك فوراً عند الرد (اسمك "توافد" والعيادة)
- كن مختصراً ومحترماً — المريض لم يطلب هذه المكالمة
- إذا كان المريض مشغولاً، اعرض الاتصال في وقت آخر
- لا تضغط على المريض — إذا رفض، اشكره واختم المكالمة
- إذا طلب إزالته من قائمة الاتصال، وافق فوراً واعتذر
- إذا وصلت لبريد صوتي، اترك رسالة قصيرة وواضحة
- سجل نتيجة المكالمة (تم الحجز / رفض / لا يوجد رد / بريد صوتي)
`;

    return basePrompt + '\n' + outboundPrompt;
  }

  /**
   * Build the initial greeting text for the AI to speak when the call connects.
   */
  getInitialGreeting(context: OutboundCallContext): string {
    const orgName = 'العيادة'; // Will be overridden by actual org name in the prompt
    const campaignType = context.campaignType || 'announcement';
    const intro = CAMPAIGN_INTRO_AR[campaignType] || CAMPAIGN_INTRO_AR['announcement'];

    if (context.patientName) {
      return `مرحباً ${context.patientName}، معك توافد من ${orgName}. ${intro}`;
    }
    return `مرحباً، معك توافد من ${orgName}. ${intro}`;
  }

  /**
   * Log the outcome of an outbound call.
   */
  async logCallOutcome(
    callSid: string,
    outcome: OutboundCallOutcome,
    context: OutboundCallContext,
    notes?: string,
  ): Promise<void> {
    // Update VoiceCall record
    const voiceCall = await this.prisma.voiceCall.findUnique({
      where: { twilioCallSid: callSid },
    });

    if (voiceCall) {
      await this.prisma.voiceCall.update({
        where: { callId: voiceCall.callId },
        data: {
          context: {
            ...(voiceCall.context as Record<string, unknown>),
            outcome,
            campaignId: context.campaignId,
            targetId: context.targetId,
            notes,
          },
        },
      });
    }

    // Update campaign target status if applicable
    if (context.targetId) {
      const targetStatus = this.mapOutcomeToTargetStatus(outcome);
      await this.prisma.campaignTarget.update({
        where: { targetId: context.targetId },
        data: {
          status: targetStatus,
          notes: notes || `Outbound call outcome: ${outcome}`,
        },
      });
    }
  }

  /**
   * Map voice call outcome to CampaignTarget status.
   */
  private mapOutcomeToTargetStatus(
    outcome: OutboundCallOutcome,
  ): string {
    switch (outcome) {
      case 'answered':
      case 'completed':
        return 'reached';
      case 'booked':
        return 'booked';
      case 'declined':
        return 'declined';
      case 'voicemail':
      case 'no_answer':
        return 'no_answer';
      case 'failed':
        return 'no_answer';
      default:
        return 'no_answer';
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: OutboundVoiceHandler | null = null;

export function getOutboundVoiceHandler(prisma: PrismaClient): OutboundVoiceHandler {
  if (!_instance) {
    _instance = new OutboundVoiceHandler(prisma);
  }
  return _instance;
}

export function resetOutboundVoiceHandler(): void {
  _instance = null;
}
