import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { callSessionManager } from '../services/voice/callSession.js';
import {
  GeminiLiveSession,
  geminiLiveSessionManager,
  mulawToPcm16k,
  pcm16kToMulaw,
} from '../services/voice/geminiLive.js';
import { buildVoiceSystemPrompt } from '../services/voicePrompt.js';
import { TwilioMediaMessage, TwilioMediaResponse, ArabicDialect } from '../types/voice.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { checkAndIncrement, AI_LIMIT_ERROR } from '../services/usage/aiUsageLimiter.js';

/**
 * Voice streaming routes using Gemini Multimodal Live API
 * This provides real-time bidirectional audio conversation with native voice
 */
export default async function voiceStreamGeminiRoutes(app: FastifyInstance) {
  // Check if Gemini is configured
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    app.log.warn('GEMINI_API_KEY not configured - Gemini voice streaming disabled');
    return;
  }

  // Register WebSocket route for Twilio Media Streams with Gemini
  app.get('/stream-gemini', { websocket: true }, (connection, request) => {
    const ws = connection.socket as WebSocket;

    let streamSid: string | null = null;
    let callSid: string | null = null;
    let geminiSession: GeminiLiveSession | null = null;

    app.log.info('Gemini Voice WebSocket connection opened');

    // Send audio back to Twilio
    function sendAudioToTwilio(audioData: Buffer) {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      // Convert Gemini PCM 16kHz to Twilio mulaw 8kHz
      const mulawAudio = pcm16kToMulaw(audioData);

      const message: TwilioMediaResponse = {
        event: 'media',
        streamSid,
        media: {
          payload: mulawAudio.toString('base64'),
        },
      };

      ws.send(JSON.stringify(message));
    }

    // Send mark to track when audio finishes
    function sendMark(name: string) {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      const message: TwilioMediaResponse = {
        event: 'mark',
        streamSid,
        mark: { name },
      };

      ws.send(JSON.stringify(message));
    }

    // Clear pending audio (for interruptions)
    function clearAudio() {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      const message: TwilioMediaResponse = {
        event: 'clear',
        streamSid,
      };

      ws.send(JSON.stringify(message));
    }

    // Initialize Gemini session for a call
    async function initializeGeminiSession(twilioCallSid: string) {
      const session = callSessionManager.getSession(twilioCallSid);
      if (!session) {
        app.log.error(`No call session found for ${twilioCallSid}`);
        return null;
      }

      // Build system prompt for voice conversation
      const dialect = (session.detectedDialect || 'msa') as ArabicDialect;
      const basePrompt = await buildVoiceSystemPrompt(app.prisma, session.orgId, dialect);

      // Add strong Arabic language instruction (same as voice test)
      const dialectNames: Record<ArabicDialect, string> = {
        gulf: 'اللهجة الخليجية',
        egyptian: 'اللهجة المصرية',
        levantine: 'اللهجة الشامية',
        msa: 'العربية الفصحى',
      };

      // Get org name for greeting
      const org = await app.prisma.org.findUnique({
        where: { orgId: session.orgId },
      });

      const systemPrompt = `## تعليمات اللغة (مهم جداً):
يجب أن ترد بالعربية فقط. يجب أن ترد بـ${dialectNames[dialect]}.
RESPOND IN ARABIC. YOU MUST RESPOND UNMISTAKABLY IN ARABIC.
لا ترد بالإنجليزية أبداً. كل ردودك يجب أن تكون بالعربية.

## تعليمات المكالمة الصادرة (CRITICAL):
هذه مكالمة صادرة - يجب أن تبدأ أنت المحادثة فوراً!
عند بداية المكالمة، قل مباشرة: "السلام عليكم، مساعد ${org?.name || 'العيادة'} الذكي، كيف يمكنني مساعدتك؟"
لا تنتظر المتصل ليتكلم أولاً!

${basePrompt}`;

      // Define function declarations for Gemini
      const tools = [{
        functionDeclarations: [
          {
            name: 'check_availability',
            description: 'Check available appointment slots for a provider, service, and date',
            parameters: {
              type: 'object',
              properties: {
                providerId: { type: 'string', description: 'Provider ID (optional)' },
                serviceId: { type: 'string', description: 'Service ID (optional)' },
                date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional, defaults to today)' },
              },
            },
          },
          {
            name: 'book_appointment',
            description: 'Book an appointment for a patient',
            parameters: {
              type: 'object',
              properties: {
                providerId: { type: 'string', description: 'Provider ID' },
                serviceId: { type: 'string', description: 'Service ID' },
                patientName: { type: 'string', description: 'Patient full name' },
                patientPhone: { type: 'string', description: 'Patient phone number in E.164 format' },
                dateTime: { type: 'string', description: 'Appointment date and time in ISO format' },
              },
              required: ['providerId', 'serviceId', 'patientName', 'patientPhone', 'dateTime'],
            },
          },
          {
            name: 'get_patient_appointments',
            description: 'Get upcoming appointments for a patient by phone number',
            parameters: {
              type: 'object',
              properties: {
                patientPhone: { type: 'string', description: 'Patient phone number in E.164 format' },
              },
              required: ['patientPhone'],
            },
          },
          {
            name: 'cancel_appointment',
            description: 'Cancel an existing appointment',
            parameters: {
              type: 'object',
              properties: {
                appointmentId: { type: 'string', description: 'Appointment ID to cancel' },
                patientPhone: { type: 'string', description: 'Patient phone number for verification' },
              },
              required: ['appointmentId', 'patientPhone'],
            },
          },
        ],
      }];

      // ── AI usage limit check ──
      const usageCheck = await checkAndIncrement(app.prisma, session.orgId);
      if (!usageCheck.allowed) {
        app.log.warn({ orgId: session.orgId, usage: usageCheck.current }, 'AI usage limit exceeded for Gemini voice call');
        return null;
      }

      // Create Gemini Live session
      const gemini = geminiLiveSessionManager.createSession(twilioCallSid, {
        apiKey: geminiApiKey,
        systemPrompt,
        dialect,
        tools,
      });

      // Handle audio output from Gemini
      gemini.on('audio', (audioData: Buffer) => {
        sendAudioToTwilio(audioData);
      });

      // Handle text responses (for logging/saving)
      gemini.on('text', async (text: string) => {
        app.log.info(`Gemini text: ${text}`);

        let finalText = text;

        // ── AI Guardrails: validate Gemini response ──
        try {
          const guardrailsSvc = new GuardrailsService(app.prisma);
          const validationCtx: ValidationContext = {
            orgId: session.orgId,
            conversationId: session.conversationId,
            userMessage: '', // Gemini handles STT internally, no separate user text here
            aiResponse: text,
          };
          const result = await guardrailsSvc.validateResponse(validationCtx);

          if (!result.approved && result.sanitizedResponse) {
            app.log.warn(
              { flags: result.flags },
              'Gemini voice guardrails blocked response',
            );
            finalText = result.sanitizedResponse;
            // Note: audio was already streamed by Gemini. The text log reflects the flag.
            // In production, you'd intercept the audio stream before sending to Twilio.
          }
        } catch (grErr) {
          app.log.error({ err: grErr }, 'Gemini guardrails validation failed');
        }

        // ── PII Redaction: redact before saving to DB ──
        let redactedText = finalText;
        try {
          redactedText = redactPII(finalText).redactedText;
        } catch (_) { /* keep original */ }

        // Save AI response to conversation
        if (session.conversationId) {
          await app.prisma.conversationMessage.create({
            data: {
              conversationId: session.conversationId,
              direction: 'out',
              bodyText: redactedText,
              payload: {
                source: 'voice',
                model: 'gemini-2.0-flash',
                provider: 'google',
              },
            },
          });

          // Save as voice utterance
          await app.prisma.voiceUtterance.create({
            data: {
              callId: session.callId,
              speaker: 'ai',
              text: redactedText,
              dialect: session.detectedDialect,
            },
          });
        }
      });

      // Handle function calls from Gemini
      gemini.on('functionCall', async (name: string, args: Record<string, unknown>) => {
        app.log.info(`Gemini function call: ${name} ${JSON.stringify(args)}`);

        try {
          const result = await handleFunctionCall(app, session.orgId, name, args);
          gemini.sendFunctionResponse(name, result);
        } catch (error) {
          app.log.error(`Function call error: ${name} ${error}`);
          gemini.sendFunctionResponse(name, { error: 'Failed to execute function' });
        }
      });

      // Handle interruption
      gemini.on('interrupted', () => {
        app.log.info('Gemini response interrupted by user');
        clearAudio();
      });

      // Handle errors
      gemini.on('error', (error: Error) => {
        app.log.error(`Gemini session error: ${error}`);
      });

      // Connect to Gemini
      try {
        await gemini.connect();
        app.log.info(`Gemini session connected for call ${twilioCallSid}`);
        return gemini;
      } catch (error) {
        app.log.error(`Failed to connect to Gemini: ${error}`);
        geminiLiveSessionManager.removeSession(twilioCallSid);
        return null;
      }
    }

    // Handle incoming WebSocket messages from Twilio
    ws.on('message', async (data: Buffer) => {
      try {
        const message: TwilioMediaMessage = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            app.log.info('Twilio Media Stream connected (Gemini mode)');
            break;

          case 'start':
            streamSid = message.start!.streamSid;
            callSid = message.start!.callSid;
            app.log.info(`Stream started: ${streamSid} for call ${callSid}`);

            // Initialize Gemini session
            geminiSession = await initializeGeminiSession(callSid);

            // Trigger Gemini to start speaking by sending a start signal
            if (geminiSession) {
              // Wait a moment for setup to complete
              setTimeout(async () => {
                if (geminiSession && geminiSession.isReady()) {
                  app.log.info('Triggering Gemini to start greeting...');
                  // Send explicit instruction to start the conversation
                  geminiSession.sendText('[CALL CONNECTED - START GREETING NOW]');
                } else {
                  app.log.warn('Gemini session not ready after timeout');
                }
              }, 500);
            }
            break;

          case 'media':
            if (!callSid || !message.media || !geminiSession) break;

            // Decode base64 audio (mulaw 8kHz from Twilio)
            const mulawAudio = Buffer.from(message.media.payload, 'base64');

            // Convert to PCM 16kHz for Gemini
            const pcmAudio = mulawToPcm16k(mulawAudio);

            // Send to Gemini
            geminiSession.sendAudio(pcmAudio);

            // Save user audio transcription (Gemini handles this internally)
            // We'll get the transcript via the text event
            break;

          case 'mark':
            app.log.debug(`Mark received: ${message.mark?.name}`);
            break;

          case 'stop':
            app.log.info('Stream stopped');
            if (callSid) {
              geminiLiveSessionManager.removeSession(callSid);
            }
            break;
        }
      } catch (error) {
        app.log.error(`Error processing WebSocket message: ${error}`);
      }
    });

    ws.on('close', () => {
      app.log.info('Gemini Voice WebSocket connection closed');
      if (callSid) {
        geminiLiveSessionManager.removeSession(callSid);
      }
    });

    ws.on('error', (error: Error) => {
      app.log.error(`Gemini Voice WebSocket error: ${error.message}`);
    });
  });
}

/**
 * Handle function calls from Gemini for appointment booking
 */
async function handleFunctionCall(
  app: FastifyInstance,
  orgId: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'check_availability': {
      const { providerId, serviceId, date } = args as {
        providerId?: string;
        serviceId?: string;
        date?: string;
      };

      // Get available slots
      const targetDate = date ? new Date(date) : new Date();
      const dayOfWeek = targetDate.getDay();

      const whereClause: Record<string, unknown> = { orgId };
      if (providerId) whereClause.providerId = providerId;

      const availabilityRules = await app.prisma.providerAvailabilityRule.findMany({
        where: {
          ...whereClause,
          dayOfWeek,
        },
        include: {
          provider: true,
        },
      });

      // Get existing appointments for the date
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const existingAppointments = await app.prisma.appointment.findMany({
        where: {
          orgId,
          startTs: { gte: startOfDay, lte: endOfDay },
          status: { in: ['held', 'booked', 'confirmed'] },
        },
      });

      // Calculate available slots
      const availableSlots = availabilityRules.map((rule: any) => ({
        providerId: rule.providerId,
        providerName: rule.provider.displayName,
        date: targetDate.toISOString().split('T')[0],
        startTime: rule.startLocal.toISOString().slice(11, 16),
        endTime: rule.endLocal.toISOString().slice(11, 16),
      }));

      return {
        success: true,
        date: targetDate.toISOString().split('T')[0],
        availableSlots,
        existingAppointmentsCount: existingAppointments.length,
      };
    }

    case 'book_appointment': {
      const { providerId, serviceId, patientName, patientPhone, dateTime } = args as {
        providerId: string;
        serviceId: string;
        patientName: string;
        patientPhone: string;
        dateTime: string;
      };

      // Find or create patient by phone via PatientContact
      const contact = await app.prisma.patientContact.findFirst({
        where: { contactType: 'phone', contactValue: patientPhone },
      });
      let patient = contact
        ? await app.prisma.patient.findFirst({ where: { patientId: contact.patientId, orgId } })
        : null;

      if (!patient) {
        const nameParts = patientName.split(' ');
        patient = await app.prisma.patient.create({
          data: {
            orgId,
            firstName: nameParts[0] || 'Unknown',
            lastName: nameParts.slice(1).join(' ') || 'Unknown',
            contacts: {
              create: {
                contactType: 'phone',
                contactValue: patientPhone,
                isPrimary: true,
              },
            },
          },
        });
      }

      // Get service for duration
      const service = await app.prisma.service.findUnique({
        where: { serviceId },
      });

      const startTs = new Date(dateTime);
      const endTs = new Date(startTs.getTime() + (service?.durationMin || 30) * 60000);

      // Create appointment
      const appointment = await app.prisma.appointment.create({
        data: {
          orgId,
          patientId: patient.patientId,
          providerId,
          serviceId,
          startTs,
          endTs,
          status: 'booked',
          bookedVia: 'phone',
        },
        include: {
          provider: true,
          service: true,
        },
      });

      return {
        success: true,
        appointmentId: appointment.appointmentId,
        providerName: appointment.provider.displayName,
        serviceName: appointment.service?.name,
        dateTime: startTs.toISOString(),
        message: `Appointment booked successfully for ${patientName}`,
      };
    }

    case 'cancel_appointment': {
      const { appointmentId, patientPhone } = args as {
        appointmentId: string;
        patientPhone: string;
      };

      // Find appointment - verify patient phone via PatientContact
      const cancelContact = await app.prisma.patientContact.findFirst({
        where: { contactType: 'phone', contactValue: patientPhone },
      });
      const appointment = cancelContact
        ? await app.prisma.appointment.findFirst({
            where: {
              appointmentId,
              patientId: cancelContact.patientId,
              orgId,
            },
          })
        : null;

      if (!appointment) {
        return {
          success: false,
          error: 'Appointment not found or phone number does not match',
        };
      }

      // Cancel appointment
      await app.prisma.appointment.update({
        where: { appointmentId },
        data: { status: 'cancelled' },
      });

      return {
        success: true,
        message: 'Appointment cancelled successfully',
      };
    }

    case 'get_patient_appointments': {
      const { patientPhone } = args as { patientPhone: string };

      // Find patient by phone via PatientContact
      const patientContact = await app.prisma.patientContact.findFirst({
        where: { contactType: 'phone', contactValue: patientPhone },
      });
      const patient = patientContact
        ? await app.prisma.patient.findFirst({ where: { patientId: patientContact.patientId, orgId } })
        : null;

      if (!patient) {
        return {
          success: true,
          appointments: [],
          message: 'No appointments found for this phone number',
        };
      }

      const appointments = await app.prisma.appointment.findMany({
        where: {
          patientId: patient.patientId,
          status: { in: ['booked', 'confirmed'] },
          startTs: { gte: new Date() },
        },
        include: {
          provider: true,
          service: true,
        },
        orderBy: { startTs: 'asc' },
        take: 5,
      });

      return {
        success: true,
        appointments: appointments.map((apt) => ({
          appointmentId: apt.appointmentId,
          providerName: apt.provider.displayName,
          serviceName: apt.service?.name,
          dateTime: apt.startTs.toISOString(),
          status: apt.status,
        })),
      };
    }

    default:
      return { error: `Unknown function: ${name}` };
  }
}
