import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import twilio from 'twilio';
import { callSessionManager } from '../services/voice/callSession.js';
import { TwilioVoiceWebhook, TwilioStatusCallback } from '../types/voice.js';
import { getGreetingMessage } from '../services/voicePrompt.js';
import { getOutboundVoiceHandler } from '../services/outbound/outboundVoiceHandler.js';
import { validateTwilioSignature } from '../lib/twilioVerify.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

// Map Twilio phone number to org from database
async function getOrgByPhone(app: FastifyInstance, phoneNumber: string): Promise<string | null> {
  // Look up the phone number in the database
  const phoneMapping = await app.prisma.orgPhoneNumber.findFirst({
    where: {
      twilioNumber: phoneNumber,
      isActive: true,
    },
  });

  if (phoneMapping) {
    return phoneMapping.orgId;
  }

  return null;
}

export default async function voiceRoutes(app: FastifyInstance) {
  /**
   * POST /api/voice/incoming
   * Twilio calls this when someone calls your phone number
   */
  app.post('/incoming', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TwilioVoiceWebhook;

    app.log.info(`Incoming call: ${body.CallSid} from ${body.From} to ${body.To}`);

    // Get org by phone number
    const orgId = await getOrgByPhone(app, body.To);
    if (!orgId) {
      app.log.error(`No org configured for phone number: ${body.To}`);
      const response = new VoiceResponse();
      response.say({
        language: 'ar-AE',
        voice: 'Google.ar-XA-Standard-A',
      }, 'عذراً، هذا الرقم غير مفعل. مع السلامة.');
      response.hangup();

      reply.type('text/xml');
      return response.toString();
    }

    // Create call session
    const session = callSessionManager.createSession(body.CallSid, orgId, body.From);

    // Create messaging user
    const messagingUser = await app.prisma.messagingUser.upsert({
      where: {
        orgId_channel_externalUserId: {
          orgId,
          channel: 'phone',
          externalUserId: body.From,
        },
      },
      create: {
        orgId,
        channel: 'phone',
        externalUserId: body.From,
        phoneE164: body.From,
      },
      update: {},
    });

    // Create conversation
    const conversation = await app.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'phone',
        externalThreadId: body.CallSid,
        status: 'active',
        currentStep: 'voice_greeting',
        context: {
          callSid: body.CallSid,
          callerPhone: body.From,
        },
      },
    });

    // Update session with conversation ID
    callSessionManager.setConversationId(body.CallSid, conversation.conversationId);

    // Create VoiceCall record
    await app.prisma.voiceCall.create({
      data: {
        callId: session.callId,
        orgId,
        conversationId: conversation.conversationId,
        twilioCallSid: body.CallSid,
        callerPhone: body.From,
        calledPhone: body.To,
        direction: 'inbound',
        status: 'ringing',
      },
    });

    // Get org name for greeting
    const org = await app.prisma.org.findUnique({
      where: { orgId },
    });

    // Generate TwiML response
    const response = new VoiceResponse();

    // Connect directly to WebSocket for bidirectional media streaming
    // Gemini will handle the entire conversation including the greeting
    // Use Gemini endpoint if configured, otherwise use OpenAI + ElevenLabs
    const useGemini = process.env.USE_GEMINI_VOICE === 'true' && process.env.GEMINI_API_KEY;
    const streamPath = useGemini ? '/api/voice/stream-gemini' : '/api/voice/stream';
    const wsUrl = process.env.VOICE_WS_URL || `wss://${request.hostname}${streamPath}`;

    const connect = response.connect();
    connect.stream({
      url: wsUrl,
      name: body.CallSid,
    });

    // Update call status to in_progress
    await app.prisma.voiceCall.update({
      where: { twilioCallSid: body.CallSid },
      data: { status: 'in_progress' },
    });

    reply.type('text/xml');
    return response.toString();
  });

  /**
   * POST /api/voice/status
   * Twilio calls this when call status changes
   */
  app.post('/status', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest) => {
    const body = request.body as TwilioStatusCallback;

    app.log.info(`Call status update: ${body.CallSid} -> ${body.CallStatus}`);

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'queued': 'ringing',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'failed': 'failed',
      'no-answer': 'no_answer',
      'busy': 'busy',
    };

    const newStatus = statusMap[body.CallStatus] || 'completed';
    const isEnded = ['completed', 'failed', 'no-answer', 'busy'].includes(body.CallStatus);

    // Validate recording URL — only accept URLs from Twilio's API domain
    const recordingUrl = body.RecordingUrl && /^https:\/\/api\.twilio\.com\//.test(body.RecordingUrl)
      ? body.RecordingUrl
      : null;

    // Update VoiceCall record
    await app.prisma.voiceCall.update({
      where: { twilioCallSid: body.CallSid },
      data: {
        status: newStatus as 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer' | 'busy',
        durationSec: body.CallDuration ? parseInt(body.CallDuration) : null,
        recordingUrl,
        endedAt: isEnded ? new Date() : undefined,
      },
    });

    // End session and close conversation if call ended
    if (isEnded) {
      const session = callSessionManager.endSession(body.CallSid);

      if (session?.conversationId) {
        await app.prisma.conversation.update({
          where: { conversationId: session.conversationId },
          data: { status: 'closed' },
        });
      }

      app.log.info(`Call ended: ${body.CallSid}, duration: ${body.CallDuration}s`);
    }

    return { success: true };
  });

  /**
   * POST /api/voice/fallback
   * Twilio calls this if there's an error with the primary webhook
   */
  app.post('/fallback', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TwilioVoiceWebhook;

    app.log.error(`Voice fallback triggered for call: ${body.CallSid}`);

    const response = new VoiceResponse();
    response.say({
      language: 'ar-AE',
      voice: 'Google.ar-XA-Standard-A',
    }, 'عذراً، حدث خطأ تقني. يرجى الاتصال مرة أخرى لاحقاً. شكراً لك.');
    response.hangup();

    reply.type('text/xml');
    return response.toString();
  });

  /**
   * POST /api/voice/make-call
   * Make an outbound AI call
   */
  app.post('/make-call', {
    preHandler: [app.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!app.twilioConfigured || !app.twilio) {
      return reply.code(500).send({ error: 'Twilio not configured' });
    }

    const body = request.body as {
      to: string;
      from?: string;
      message?: string;
      orgId?: string;
    };

    if (!body.to) {
      return reply.code(400).send({ error: 'Missing required field: to' });
    }

    try {
      // Get orgId from request, env, or use first available org
      let orgId = body.orgId || process.env.DEFAULT_ORG_ID;

      if (!orgId) {
        // Find first available organization
        const firstOrg = await app.prisma.org.findFirst();
        if (!firstOrg) {
          return reply.code(400).send({ error: 'No organizations found. Please create an organization first.' });
        }
        orgId = firstOrg.orgId;
        app.log.info(`Using first available organization: ${orgId}`);
      }

      // Get a phone number for this org, or use the provided 'from' number
      let fromNumber = body.from;

      if (!fromNumber) {
        const orgPhone = await app.prisma.orgPhoneNumber.findFirst({
          where: {
            orgId,
            isActive: true,
          },
        });

        if (!orgPhone) {
          return reply.code(400).send({
            error: 'No active phone number found for organization. Please provide a "from" number.',
          });
        }

        fromNumber = orgPhone.twilioNumber;
      }

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

      // Create the call
      const call = await app.twilio.calls.create({
        to: body.to,
        from: fromNumber,
        url: `${baseUrl}/api/voice/outbound-response`,
        statusCallback: `${baseUrl}/api/voice/status`,
        statusCallbackMethod: 'POST',
      });

      app.log.info(`Outbound call initiated: ${call.sid} from ${fromNumber} to ${body.to}`);

      return {
        success: true,
        callSid: call.sid,
        from: fromNumber,
        to: body.to,
        status: call.status,
      };
    } catch (error: any) {
      app.log.error('Error making outbound call:', error);
      return reply.code(500).send({
        error: 'Failed to make call',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/voice/outbound-response
   * TwiML response for outbound calls — connects to AI voice stream
   * for bidirectional conversation (similar to inbound calls).
   */
  app.post('/outbound-response', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TwilioVoiceWebhook;

    app.log.info(`Outbound call answered: ${body.CallSid}`);

    // Get org by the 'From' number (the Twilio number making the call)
    const orgId = await getOrgByPhone(app, body.From);
    if (!orgId) {
      app.log.error(`No org configured for phone number: ${body.From}`);
      const response = new VoiceResponse();
      response.say({
        language: 'ar-AE',
        voice: 'Google.ar-XA-Standard-A',
      }, 'عذراً، حدث خطأ تقني.');
      response.hangup();

      reply.type('text/xml');
      return response.toString();
    }

    // Extract campaign context from query params (set by outboundCaller)
    const query = request.query as Record<string, string>;
    const campaignId = query.campaignId;
    const targetId = query.targetId;
    const patientId = query.patientId;

    // Build outbound call context
    const outboundHandler = getOutboundVoiceHandler(app.prisma);
    const callContext = await outboundHandler.buildCallContext({
      campaignId,
      targetId,
      patientId,
      orgId,
      lang: query.lang,
    });

    // Create messaging user for the recipient
    const messagingUser = await app.prisma.messagingUser.upsert({
      where: {
        orgId_channel_externalUserId: {
          orgId,
          channel: 'phone',
          externalUserId: body.To,
        },
      },
      create: {
        orgId,
        channel: 'phone',
        externalUserId: body.To,
        phoneE164: body.To,
      },
      update: {},
    });

    // Create conversation with campaign context
    const conversation = await app.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'phone',
        externalThreadId: body.CallSid,
        status: 'active',
        currentStep: 'voice_greeting',
        context: {
          callSid: body.CallSid,
          callerPhone: body.To,
          direction: 'outbound',
          campaignId: callContext.campaignId,
          campaignType: callContext.campaignType,
          targetId: callContext.targetId,
          patientId: callContext.patientId,
        },
      },
    });

    // Create session
    const session = callSessionManager.createSession(body.CallSid, orgId, body.To);
    callSessionManager.setConversationId(body.CallSid, conversation.conversationId);

    // Create VoiceCall record with campaign context
    await app.prisma.voiceCall.create({
      data: {
        callId: session.callId,
        orgId,
        conversationId: conversation.conversationId,
        twilioCallSid: body.CallSid,
        callerPhone: body.From,
        calledPhone: body.To,
        direction: 'outbound',
        status: 'in_progress',
        context: {
          campaignId: callContext.campaignId,
          targetId: callContext.targetId,
          patientId: callContext.patientId,
          campaignType: callContext.campaignType,
        },
      },
    });

    // Generate TwiML — connect to AI voice stream (same as inbound)
    const response = new VoiceResponse();

    const useGemini = process.env.USE_GEMINI_VOICE === 'true' && process.env.GEMINI_API_KEY;
    const streamPath = useGemini ? '/api/voice/stream-gemini' : '/api/voice/stream';
    const wsUrl = process.env.VOICE_WS_URL || `wss://${request.hostname}${streamPath}`;

    // Pass outbound context via custom parameters so the WS handler
    // can build the right system prompt
    const connect = response.connect();
    const stream = connect.stream({
      url: wsUrl,
      name: body.CallSid,
    });
    stream.parameter({ name: 'direction', value: 'outbound' });
    stream.parameter({ name: 'orgId', value: orgId });
    if (campaignId) stream.parameter({ name: 'campaignId', value: campaignId });
    if (targetId) stream.parameter({ name: 'targetId', value: targetId });
    if (patientId) stream.parameter({ name: 'patientId', value: patientId });
    if (callContext.campaignType) stream.parameter({ name: 'campaignType', value: callContext.campaignType });

    // Log the outcome as 'answered'
    await outboundHandler.logCallOutcome(body.CallSid, 'answered', callContext);

    reply.type('text/xml');
    return response.toString();
  });

  /**
   * POST /api/voice/outbound-script
   * TwiML handler for campaign-initiated outbound calls via OutboundCaller.
   * Connects to AI voice stream with campaign-specific context.
   */
  app.post('/outbound-script', {
    preHandler: validateTwilioSignature,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as TwilioVoiceWebhook;
    const query = request.query as Record<string, string>;

    app.log.info(`Outbound script call answered: ${body.CallSid}`);

    const orgId = query.orgId || await getOrgByPhone(app, body.From);
    if (!orgId) {
      const response = new VoiceResponse();
      response.say({ language: 'ar-AE', voice: 'Google.ar-XA-Standard-A' }, 'عذراً، حدث خطأ تقني.');
      response.hangup();
      reply.type('text/xml');
      return response.toString();
    }

    // Build context from query params
    const outboundHandler = getOutboundVoiceHandler(app.prisma);
    const callContext = await outboundHandler.buildCallContext({
      campaignId: query.campaignId,
      targetId: query.targetId,
      patientId: query.patientId,
      orgId,
      lang: query.lang,
    });

    // Create messaging user
    const messagingUser = await app.prisma.messagingUser.upsert({
      where: {
        orgId_channel_externalUserId: {
          orgId,
          channel: 'phone',
          externalUserId: body.To,
        },
      },
      create: { orgId, channel: 'phone', externalUserId: body.To, phoneE164: body.To },
      update: {},
    });

    // Create conversation
    const conversation = await app.prisma.conversation.create({
      data: {
        orgId,
        messagingUserId: messagingUser.messagingUserId,
        channel: 'phone',
        externalThreadId: body.CallSid,
        status: 'active',
        currentStep: 'voice_greeting',
        context: {
          callSid: body.CallSid,
          callerPhone: body.To,
          direction: 'outbound',
          campaignId: callContext.campaignId,
          campaignType: callContext.campaignType,
          targetId: callContext.targetId,
        },
      },
    });

    const session = callSessionManager.createSession(body.CallSid, orgId, body.To);
    callSessionManager.setConversationId(body.CallSid, conversation.conversationId);

    await app.prisma.voiceCall.create({
      data: {
        callId: session.callId,
        orgId,
        conversationId: conversation.conversationId,
        twilioCallSid: body.CallSid,
        callerPhone: body.From,
        calledPhone: body.To,
        direction: 'outbound',
        status: 'in_progress',
        context: {
          campaignId: callContext.campaignId,
          targetId: callContext.targetId,
          patientId: callContext.patientId,
          campaignType: callContext.campaignType,
        },
      },
    });

    // Connect to AI voice stream
    const response = new VoiceResponse();
    const useGemini = process.env.USE_GEMINI_VOICE === 'true' && process.env.GEMINI_API_KEY;
    const streamPath = useGemini ? '/api/voice/stream-gemini' : '/api/voice/stream';
    const wsUrl = process.env.VOICE_WS_URL || `wss://${request.hostname}${streamPath}`;

    const connect = response.connect();
    const stream = connect.stream({ url: wsUrl, name: body.CallSid });
    stream.parameter({ name: 'direction', value: 'outbound' });
    stream.parameter({ name: 'orgId', value: orgId });
    if (query.campaignId) stream.parameter({ name: 'campaignId', value: query.campaignId });
    if (query.targetId) stream.parameter({ name: 'targetId', value: query.targetId });
    if (query.patientId) stream.parameter({ name: 'patientId', value: query.patientId });
    if (callContext.campaignType) stream.parameter({ name: 'campaignType', value: callContext.campaignType });

    await outboundHandler.logCallOutcome(body.CallSid, 'answered', callContext);

    reply.type('text/xml');
    return response.toString();
  });

  /**
   * GET /api/voice/health
   * Health check for voice service
   */
  app.get('/health', async () => {
    const activeCallCount = callSessionManager.getActiveSessionCount();

    return {
      status: 'ok',
      twilioConfigured: app.twilioConfigured || false,
      activeCalls: activeCallCount,
    };
  });
}
