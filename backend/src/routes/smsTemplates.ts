import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SmsDeflector, SmsChannel, TriggerType } from '../services/messaging/smsDeflector.js';

// ─────────────────────────────────────────────────────────
// SMS Template & Messaging API Routes
// ─────────────────────────────────────────────────────────

const TRIGGERS = ['post_booking', 'reminder', 'mid_call_link', 'survey', 'custom', 'follow_up'] as const;
const CHANNELS = ['sms', 'whatsapp', 'both'] as const;

const createTemplateSchema = z.object({
  orgId: z.string().uuid().optional(),
  name: z.string().min(1),
  trigger: z.enum(TRIGGERS),
  bodyEn: z.string().min(1),
  bodyAr: z.string().min(1),
  variables: z.array(z.string()).default([]),
  channel: z.enum(CHANNELS).default('sms'),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  trigger: z.enum(TRIGGERS).optional(),
  bodyEn: z.string().min(1).optional(),
  bodyAr: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  channel: z.enum(CHANNELS).optional(),
  isActive: z.boolean().optional(),
});

const sendSchema = z.object({
  phone: z.string().min(1),
  patientId: z.string().uuid().optional(),
  variables: z.record(z.string()).default({}),
  lang: z.enum(['en', 'ar']).default('ar'),
  channel: z.enum(['sms', 'whatsapp']).optional(),
});

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  channel: z.enum(['sms', 'whatsapp']).optional(),
  status: z.enum(['sent', 'delivered', 'failed', 'read']).optional(),
  patientId: z.string().uuid().optional(),
});

export default async function smsTemplatesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Build the deflector with Twilio client from the app
  const deflector = new SmsDeflector(
    app.prisma,
    app.twilio ?? null,
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_WHATSAPP_NUMBER,
  );

  // ──── GET /api/sms-templates/:orgId — List templates ────
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const templates = await deflector.listTemplates(orgId);

    return { data: templates };
  });

  // ──── POST /api/sms-templates — Create template ────
  app.post('/', async (request: FastifyRequest) => {
    const { orgId: userOrgId } = request.user;
    const body = createTemplateSchema.parse(request.body);

    const template = await deflector.createTemplate({
      orgId: body.orgId ?? userOrgId,
      name: body.name,
      trigger: body.trigger as TriggerType,
      bodyEn: body.bodyEn,
      bodyAr: body.bodyAr,
      variables: body.variables,
      channel: body.channel as SmsChannel | 'both',
    });

    return { data: template };
  });

  // ──── PATCH /api/sms-templates/:id — Update template ────
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const body = updateTemplateSchema.parse(request.body);

    // Verify template belongs to user's org
    const existing = await app.prisma.smsTemplate.findUnique({ where: { templateId: id } });
    if (!existing || existing.orgId !== request.user.orgId) {
      return reply.code(404).send({ error: 'Template not found' });
    }

    try {
      const updated = await deflector.updateTemplate(id, body as any);
      return { data: updated };
    } catch {
      return { error: 'Template not found' };
    }
  });

  // ──── POST /api/sms-templates/:id/send — Send template to patient ────
  app.post<{ Params: { id: string } }>('/:id/send', async (request) => {
    const { id } = request.params;
    const body = sendSchema.parse(request.body);

    const result = await deflector.sendTemplate(id, body.phone, body.variables, {
      channel: body.channel as SmsChannel | undefined,
      lang: body.lang as 'en' | 'ar',
      patientId: body.patientId,
      triggeredBy: 'manual',
    });

    if (!result.success) {
      return { error: result.error, channel: result.channel };
    }

    return {
      data: {
        logId: result.logId,
        twilioSid: result.twilioSid,
        channel: result.channel,
      },
    };
  });

  // ──── DELETE /api/sms-templates/:id — Soft-delete (deactivate) ────
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    // Verify template belongs to user's org
    const existing = await app.prisma.smsTemplate.findUnique({ where: { templateId: id } });
    if (!existing || existing.orgId !== request.user.orgId) {
      return reply.code(404).send({ error: 'Template not found' });
    }

    try {
      await deflector.updateTemplate(id, { isActive: false });
      return { success: true };
    } catch {
      return { error: 'Template not found' };
    }
  });

  // ──── POST /api/sms-templates/send-raw — Send ad-hoc message (no template) ────
  app.post('/send-raw', async (request: FastifyRequest) => {
    const { orgId } = request.user;
    const body = z.object({
      phone: z.string().min(1),
      body: z.string().min(1),
      channel: z.enum(['sms', 'whatsapp']).default('sms'),
      patientId: z.string().uuid().optional(),
    }).parse(request.body);

    const result = await deflector.send({
      orgId,
      phone: body.phone,
      channel: body.channel as SmsChannel,
      body: body.body,
      patientId: body.patientId,
      triggeredBy: 'manual',
    });

    if (!result.success) {
      return { error: result.error };
    }

    return {
      data: {
        logId: result.logId,
        twilioSid: result.twilioSid,
        channel: result.channel,
      },
    };
  });
}

// ─────────────────────────────────────────────────────────
// SMS Logs — separate route plugin
// ─────────────────────────────────────────────────────────
export async function smsLogsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  const deflector = new SmsDeflector(
    app.prisma,
    app.twilio ?? null,
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_WHATSAPP_NUMBER,
  );

  // ──── GET /api/sms-logs/:orgId — View sent message logs ────
  app.get<{ Params: { orgId: string } }>('/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    if (request.user.orgId !== orgId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const query = logQuerySchema.parse(request.query);

    return deflector.getLogs(orgId, {
      page: query.page,
      limit: query.limit,
      channel: query.channel as SmsChannel | undefined,
      status: query.status,
      patientId: query.patientId,
    });
  });
}
