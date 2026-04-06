import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import twilio from 'twilio';
import { WhatsAppHandler } from '../services/messaging/whatsappHandler.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { classifyError, formatErrorMessage } from '../services/ai/errorClassifier.js';

// ─────────────────────────────────────────────────────────
// WhatsApp Conversational AI Routes
// Receives Twilio WhatsApp webhooks, processes messages
// through AI, and responds via WhatsApp.
// ─────────────────────────────────────────────────────────

const VoiceResponse = twilio.twiml.MessagingResponse;

/** Twilio WhatsApp webhook payload fields */
interface TwilioWhatsAppBody {
  MessageSid: string;
  AccountSid: string;
  From: string;       // "whatsapp:+966XXXXXXXXX"
  To: string;         // "whatsapp:+17078745670"
  Body: string;
  NumMedia: string;
  ProfileName?: string;
  WaId?: string;       // WhatsApp ID (phone without +)
}

/** Verify Twilio webhook signature */
async function verifyTwilioWebhook(request: FastifyRequest, reply: FastifyReply) {
  // Skip verification in development
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_TWILIO_VERIFY === 'true') {
    return;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    request.log.warn('TWILIO_AUTH_TOKEN not configured');
    return reply.code(500).send({ error: 'Twilio not configured' });
  }

  const signature = request.headers['x-twilio-signature'] as string;
  if (!signature) {
    return reply.code(403).send({ error: 'Missing Twilio signature' });
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const url = `${baseUrl}${request.url}`;
  const params = request.body as Record<string, string>;

  const isValid = twilio.validateRequest(authToken, signature, url, params);
  if (!isValid) {
    request.log.warn('Invalid Twilio WhatsApp webhook signature');
    return reply.code(403).send({ error: 'Invalid signature' });
  }
}

/** Resolve orgId from the Twilio phone number receiving the message */
async function resolveOrgId(app: FastifyInstance, toNumber: string): Promise<string | null> {
  // Strip whatsapp: prefix to get raw phone
  const phone = toNumber.replace(/^whatsapp:/, '');

  // Look up in OrgPhoneNumber table
  const phoneMapping = await app.prisma.orgPhoneNumber.findFirst({
    where: {
      twilioNumber: phone,
      isActive: true,
    },
  });

  if (phoneMapping) {
    return phoneMapping.orgId;
  }

  // Fallback to DEFAULT_ORG_ID env
  return process.env.DEFAULT_ORG_ID || null;
}

export default async function whatsappChatRoutes(app: FastifyInstance) {
  // Phase 4.1: Rate limiting — 20 messages per phone number per 5 minutes
  await app.register(rateLimit, {
    max: 20,
    timeWindow: '5 minutes',
    keyGenerator: (request: FastifyRequest) => {
      const body = request.body as TwilioWhatsAppBody | undefined;
      return body?.From ?? request.ip;
    },
    errorResponseBuilder: () => ({
      error: 'Rate limit exceeded',
    }),
  });

  // Build the handler
  const handler = new WhatsAppHandler(
    app.prisma,
    app.twilio ?? null,
    process.env.TWILIO_PHONE_NUMBER,
    app.log,
  );

  // ──── POST /api/whatsapp/webhook — Twilio WhatsApp incoming ────
  app.post('/webhook', {
    preHandler: verifyTwilioWebhook,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TwilioWhatsAppBody;
    const { From, Body, MessageSid, To, ProfileName } = body;

    try {
      // Resolve which org this message is for
      const orgId = await resolveOrgId(app, To);
      if (!orgId) {
        request.log.error({ To }, 'Could not resolve orgId for WhatsApp number');
        // Return empty TwiML — don't crash
        reply.header('Content-Type', 'text/xml');
        return reply.send('<Response></Response>');
      }

      request.log.info(
        {
          from: redactPII(From).redactedText,
          messageSid: MessageSid,
          profileName: ProfileName,
          orgId,
        },
        'WhatsApp message received',
      );

      // Process the message through AI
      await handler.handleIncoming(From, Body, MessageSid, orgId);

      // Return empty TwiML (we send the reply via API, not TwiML)
      reply.header('Content-Type', 'text/xml');
      return reply.send('<Response></Response>');
    } catch (err: any) {
      const classified = classifyError(err);
      request.log.error(
        { err, messageSid: MessageSid, errorCategory: classified.category },
        'WhatsApp webhook processing failed',
      );

      // Send context-aware error message back to the user
      try {
        const phone = From.replace(/^whatsapp:/, '');
        await handler.sendMessage(phone, formatErrorMessage(classified));
      } catch (sendErr) {
        request.log.error({ sendErr }, 'Failed to send WhatsApp error message');
      }

      // Still return 200 with empty TwiML so Twilio doesn't retry
      reply.header('Content-Type', 'text/xml');
      return reply.send('<Response></Response>');
    }
  });

  // ──── POST /api/whatsapp/status — Twilio status callback ────
  app.post('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string>;
    const { MessageSid, MessageStatus, To } = body;

    request.log.info(
      { messageSid: MessageSid, status: MessageStatus },
      'WhatsApp status callback',
    );

    // Update message status in SmsLog if we tracked it
    // (For now, just log it — the main conversational flow uses ConversationMessage)

    return { success: true };
  });

  // ──── GET /api/whatsapp/health — Health check ────
  app.get('/health', async () => {
    return {
      status: 'ok',
      twilioConfigured: app.twilioConfigured,
      whatsappNumber: process.env.TWILIO_PHONE_NUMBER
        ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`
        : null,
    };
  });
}
