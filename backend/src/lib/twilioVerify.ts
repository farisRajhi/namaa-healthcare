import { FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';

/**
 * Shared Twilio webhook signature verification middleware.
 * Use as `preHandler` on any Twilio webhook route.
 *
 * Verification is skipped ONLY in development when
 * SKIP_TWILIO_VERIFY=true is explicitly set. In every other
 * environment (staging, production) the signature is always checked.
 */
export async function validateTwilioSignature(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Allow opt-out in local dev only
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_TWILIO_VERIFY === 'true') {
    return;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    request.log.warn('[twilioVerify] TWILIO_AUTH_TOKEN not configured');
    return reply.code(500).send({ error: 'Twilio not configured' });
  }

  const signature = request.headers['x-twilio-signature'] as string | undefined;
  if (!signature) {
    request.log.warn('[twilioVerify] Missing x-twilio-signature header');
    return reply.code(403).send({ error: 'Missing Twilio signature' });
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  // request.url already includes query string; use originalUrl when behind a proxy
  const url = `${baseUrl}${request.url}`;
  const params = (request.body as Record<string, string>) || {};

  const isValid = twilio.validateRequest(authToken, signature, url, params);
  if (!isValid) {
    request.log.warn(`[twilioVerify] Invalid Twilio signature for ${request.url}`);
    return reply.code(403).send({ error: 'Invalid signature' });
  }
}
