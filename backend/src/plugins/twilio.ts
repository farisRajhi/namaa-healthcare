import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import twilio from 'twilio';

declare module 'fastify' {
  interface FastifyInstance {
    twilio: twilio.Twilio | null;
    twilioConfigured: boolean;
  }
}

const twilioPlugin: FastifyPluginAsync = async (fastify) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken || !accountSid.startsWith('AC') || accountSid.includes('your-')) {
    fastify.log.warn('Twilio credentials not configured - voice features disabled');
    fastify.decorate('twilio', null);
    fastify.decorate('twilioConfigured', false);
    return;
  }

  const client = twilio(accountSid, authToken);
  fastify.decorate('twilio', client);
  fastify.decorate('twilioConfigured', true);

  fastify.log.info('Twilio client initialized');
};

export default fp(twilioPlugin, {
  name: 'twilio',
});

export { twilioPlugin };

// Helper to verify Twilio webhook signatures
export function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}
