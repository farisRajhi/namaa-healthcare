import { PrismaClient } from '@prisma/client';
import type { Twilio } from 'twilio';

// ─────────────────────────────────────────────────────────
// SMS Deflection Service
// Mid-call SMS triggers, post-call SMS, template engine,
// WhatsApp rich messages, Twilio SMS/WhatsApp sending
// ─────────────────────────────────────────────────────────

/** Intent → default trigger mapping for mid-call deflection */
const MID_CALL_TRIGGERS: Record<string, string> = {
  scheduling:     'mid_call_link',
  password_reset: 'mid_call_link',
  directions:     'mid_call_link',
  forms:          'mid_call_link',
  results:        'mid_call_link',
};

/** Post-call trigger types */
const POST_CALL_TRIGGERS = ['post_booking', 'survey', 'reminder', 'follow_up'] as const;

export type SmsChannel = 'sms' | 'whatsapp';
export type TriggerType = 'post_booking' | 'reminder' | 'mid_call_link' | 'survey' | 'custom' | 'follow_up';

export interface TemplateVariables {
  patient_name?: string;
  patient_name_ar?: string;
  doctor_name?: string;
  date?: string;
  time?: string;
  facility?: string;
  facility_ar?: string;
  link?: string;
  booking_id?: string;
  medication?: string;
  phone?: string;
  [key: string]: string | undefined;
}

export interface SendResult {
  success: boolean;
  logId?: string;
  twilioSid?: string;
  error?: string;
  channel: SmsChannel;
}

// ─────────────────────────────────────────────────────────
export class SmsDeflector {
  constructor(
    private prisma: PrismaClient,
    private twilioClient: Twilio | null,
    private twilioFromNumber?: string,
    private twilioWhatsAppFrom?: string,
  ) {}

  // ───── Template CRUD ─────
  async listTemplates(orgId: string, opts?: { trigger?: TriggerType; channel?: SmsChannel }) {
    return this.prisma.smsTemplate.findMany({
      where: {
        orgId,
        isActive: true,
        ...(opts?.trigger && { trigger: opts.trigger }),
        ...(opts?.channel && {
          OR: [{ channel: opts.channel }, { channel: 'both' }],
        }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(data: {
    orgId: string;
    name: string;
    trigger: TriggerType;
    bodyEn: string;
    bodyAr: string;
    variables: string[];
    channel?: SmsChannel | 'both';
  }) {
    return this.prisma.smsTemplate.create({
      data: {
        orgId: data.orgId,
        name: data.name,
        trigger: data.trigger,
        bodyEn: data.bodyEn,
        bodyAr: data.bodyAr,
        variables: data.variables,
        channel: data.channel ?? 'sms',
        isActive: true,
      },
    });
  }

  async updateTemplate(templateId: string, data: {
    name?: string;
    trigger?: TriggerType;
    bodyEn?: string;
    bodyAr?: string;
    variables?: string[];
    channel?: SmsChannel | 'both';
    isActive?: boolean;
  }) {
    return this.prisma.smsTemplate.update({
      where: { templateId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.trigger !== undefined && { trigger: data.trigger }),
        ...(data.bodyEn !== undefined && { bodyEn: data.bodyEn }),
        ...(data.bodyAr !== undefined && { bodyAr: data.bodyAr }),
        ...(data.variables !== undefined && { variables: data.variables }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  // ───── Template rendering ─────
  renderTemplate(template: string, vars: TemplateVariables): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return vars[key] ?? match;
    });
  }

  // ───── Core send method ─────
  async send(opts: {
    orgId: string;
    templateId?: string;
    patientId?: string;
    phone: string;
    channel: SmsChannel;
    body: string;
    triggeredBy: string; // ai_call | ai_chat | scheduled | manual
  }): Promise<SendResult> {
    const { orgId, templateId, patientId, phone, channel, body, triggeredBy } = opts;

    let twilioSid: string | undefined;
    let status = 'sent';

    // Send via Twilio
    if (this.twilioClient) {
      try {
        const to = channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
        const from = channel === 'whatsapp'
          ? (this.twilioWhatsAppFrom ?? `whatsapp:${this.twilioFromNumber}`)
          : this.twilioFromNumber;

        if (!from) {
          throw new Error('Twilio from number not configured');
        }

        const message = await this.twilioClient.messages.create({
          body,
          to,
          from,
        });

        twilioSid = message.sid;
        status = 'sent';
      } catch (err: any) {
        status = 'failed';

        // Log the failure but still create the log record
        const log = await this.prisma.smsLog.create({
          data: {
            orgId,
            templateId: templateId ?? null,
            patientId: patientId ?? null,
            phone,
            channel,
            body,
            status: 'failed',
            twilioSid: null,
            triggeredBy,
          },
        });

        return {
          success: false,
          logId: log.logId,
          error: err.message ?? 'Failed to send message',
          channel,
        };
      }
    } else {
      // No Twilio configured — log only (dev/testing mode)
      status = 'sent';
    }

    // Create log entry
    const log = await this.prisma.smsLog.create({
      data: {
        orgId,
        templateId: templateId ?? null,
        patientId: patientId ?? null,
        phone,
        channel,
        body,
        status,
        twilioSid: twilioSid ?? null,
        triggeredBy,
      },
    });

    return {
      success: true,
      logId: log.logId,
      twilioSid,
      channel,
    };
  }

  // ───── Send template by ID ─────
  async sendTemplate(templateId: string, phone: string, vars: TemplateVariables, opts: {
    channel?: SmsChannel;
    lang?: 'en' | 'ar';
    patientId?: string;
    triggeredBy?: string;
  } = {}): Promise<SendResult> {
    const template = await this.prisma.smsTemplate.findUnique({
      where: { templateId },
    });

    if (!template) {
      return { success: false, error: 'Template not found', channel: opts.channel ?? 'sms' };
    }

    if (!template.isActive) {
      return { success: false, error: 'Template is inactive', channel: opts.channel ?? 'sms' };
    }

    const lang = opts.lang ?? 'ar'; // default Arabic for Saudi market
    const bodyTemplate = lang === 'ar' ? template.bodyAr : template.bodyEn;
    const body = this.renderTemplate(bodyTemplate, vars);
    const channel = opts.channel ?? (template.channel === 'both' ? 'sms' : template.channel as SmsChannel);

    return this.send({
      orgId: template.orgId,
      templateId: template.templateId,
      patientId: opts.patientId,
      phone,
      channel,
      body,
      triggeredBy: opts.triggeredBy ?? 'manual',
    });
  }

  // ───── Mid-call SMS deflection ─────
  async triggerMidCallSms(opts: {
    orgId: string;
    intent: string;
    phone: string;
    patientId?: string;
    vars: TemplateVariables;
    lang?: 'en' | 'ar';
  }): Promise<SendResult | null> {
    const triggerName = MID_CALL_TRIGGERS[opts.intent];
    if (!triggerName) return null;

    // Find the best matching template for this org + trigger
    const template = await this.prisma.smsTemplate.findFirst({
      where: {
        orgId: opts.orgId,
        trigger: triggerName,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!template) return null;

    const lang = opts.lang ?? 'ar';
    const bodyTemplate = lang === 'ar' ? template.bodyAr : template.bodyEn;
    const body = this.renderTemplate(bodyTemplate, opts.vars);

    return this.send({
      orgId: opts.orgId,
      templateId: template.templateId,
      patientId: opts.patientId,
      phone: opts.phone,
      channel: 'sms', // mid-call always SMS (faster delivery)
      body,
      triggeredBy: 'ai_call',
    });
  }

  // ───── Post-call SMS ─────
  async triggerPostCallSms(opts: {
    orgId: string;
    trigger: typeof POST_CALL_TRIGGERS[number];
    phone: string;
    patientId?: string;
    vars: TemplateVariables;
    lang?: 'en' | 'ar';
    channel?: SmsChannel;
  }): Promise<SendResult | null> {
    const template = await this.prisma.smsTemplate.findFirst({
      where: {
        orgId: opts.orgId,
        trigger: opts.trigger,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!template) return null;

    const lang = opts.lang ?? 'ar';
    const bodyTemplate = lang === 'ar' ? template.bodyAr : template.bodyEn;
    const body = this.renderTemplate(bodyTemplate, opts.vars);
    const channel = opts.channel ?? (template.channel === 'both' ? 'whatsapp' : template.channel as SmsChannel);

    return this.send({
      orgId: opts.orgId,
      templateId: template.templateId,
      patientId: opts.patientId,
      phone: opts.phone,
      channel,
      body,
      triggeredBy: 'ai_call',
    });
  }

  // ───── WhatsApp rich message (with buttons) ─────
  async sendWhatsAppRich(opts: {
    orgId: string;
    phone: string;
    body: string;
    patientId?: string;
    triggeredBy?: string;
    // Twilio Content API would handle buttons/templates natively;
    // here we append clickable links as a pragmatic approach.
    buttons?: Array<{ label: string; url: string }>;
  }): Promise<SendResult> {
    let richBody = opts.body;

    if (opts.buttons && opts.buttons.length > 0) {
      richBody += '\n\n';
      for (const btn of opts.buttons) {
        richBody += `▸ ${btn.label}: ${btn.url}\n`;
      }
    }

    return this.send({
      orgId: opts.orgId,
      phone: opts.phone,
      channel: 'whatsapp',
      body: richBody,
      patientId: opts.patientId,
      triggeredBy: opts.triggeredBy ?? 'manual',
    });
  }

  // ───── View logs ─────
  async getLogs(orgId: string, opts?: {
    page?: number;
    limit?: number;
    channel?: SmsChannel;
    status?: string;
    patientId?: string;
  }) {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = {
      orgId,
      ...(opts?.channel && { channel: opts.channel }),
      ...(opts?.status && { status: opts.status }),
      ...(opts?.patientId && { patientId: opts.patientId }),
    };

    const [logs, total] = await Promise.all([
      this.prisma.smsLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.smsLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
