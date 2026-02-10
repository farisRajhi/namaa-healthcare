import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { callSessionManager } from '../services/voice/callSession.js';
import { getSTTService, mulawToWav } from '../services/voice/sttService.js';
import { getTTSService, pcmToMulaw } from '../services/voice/ttsService.js';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildVoiceSystemPrompt, getRepeatMessage, getErrorMessage } from '../services/voicePrompt.js';
import { TwilioMediaMessage, TwilioMediaResponse, ArabicDialect } from '../types/voice.js';
import { GuardrailsService, ValidationContext } from '../services/ai/guardrails.js';
import { redactPII } from '../services/security/piiRedactor.js';
import { SmsDeflector } from '../services/messaging/smsDeflector.js';
import { getCallRouter } from '../services/voice/callRouter.js';
import { getSmartRouter } from '../services/routing/smartRouter.js';
import { getContextBuilder } from '../services/patient/contextBuilder.js';

// Silence detection threshold (in bytes of audio that constitute "silence")
const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence triggers processing
const MIN_AUDIO_LENGTH = 1600; // Minimum audio bytes to process (100ms at 8kHz)

export default async function voiceStreamRoutes(app: FastifyInstance) {
  // Initialize shared services
  const callRouter = getCallRouter();
  const smartRouter = getSmartRouter(app.prisma);
  const guardrails = new GuardrailsService(app.prisma);

  // Initialize SMS deflector (Twilio client may be null in dev)
  const twilioClient = (app as any).twilio ?? null;
  const smsDeflector = new SmsDeflector(
    app.prisma,
    twilioClient,
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_WHATSAPP_FROM,
  );

  // Register WebSocket route for Twilio Media Streams
  app.get('/stream', { websocket: true }, (connection, request) => {
    const ws = connection.socket as WebSocket;

    let streamSid: string | null = null;
    let callSid: string | null = null;
    let audioBuffer: Buffer[] = [];
    let silenceTimer: NodeJS.Timeout | null = null;
    let sequenceNumber = 0;

    const sttService = getSTTService();
    const ttsService = getTTSService();
    const llmService = getLLMService();

    app.log.info('Voice WebSocket connection opened');

    // Send audio back to Twilio
    function sendAudio(audioData: Buffer) {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      const message: TwilioMediaResponse = {
        event: 'media',
        streamSid,
        media: {
          payload: audioData.toString('base64'),
        },
      };

      ws.send(JSON.stringify(message));
    }

    // Send mark to track when audio finishes playing
    function sendMark(name: string) {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      const message: TwilioMediaResponse = {
        event: 'mark',
        streamSid,
        mark: { name },
      };

      ws.send(JSON.stringify(message));
    }

    // Clear any pending audio on Twilio side (for interruptions)
    function clearAudio() {
      if (!streamSid || ws.readyState !== WebSocket.OPEN) return;

      const message: TwilioMediaResponse = {
        event: 'clear',
        streamSid,
      };

      ws.send(JSON.stringify(message));
    }

    // Process accumulated audio
    async function processAudio() {
      if (!callSid || audioBuffer.length === 0) return;

      const session = callSessionManager.getSession(callSid);
      if (!session || session.isProcessing) return;

      // Combine audio chunks
      const fullAudio = Buffer.concat(audioBuffer);
      audioBuffer = [];

      // Skip if too short
      if (fullAudio.length < MIN_AUDIO_LENGTH) {
        app.log.debug('Audio too short, skipping');
        return;
      }

      callSessionManager.setProcessing(callSid, true);
      callSessionManager.setSpeaking(callSid, false);

      try {
        // Convert mulaw to WAV for Whisper
        const wavAudio = mulawToWav(fullAudio);

        // Transcribe audio
        app.log.info('Transcribing audio...');
        const sttResult = await sttService.transcribe(wavAudio);

        if (!sttResult.text.trim()) {
          app.log.debug('Empty transcription, skipping');
          callSessionManager.setProcessing(callSid, false);
          return;
        }

        app.log.info(`Transcribed: "${sttResult.text}" (dialect: ${sttResult.dialect})`);

        // Update dialect if detected
        if (sttResult.dialect && sttResult.dialect !== session.detectedDialect) {
          callSessionManager.updateDialect(callSid, sttResult.dialect);
        }

        const dialect = session.detectedDialect || sttResult.dialect || 'msa';

        // ── Call Router: detect intent and track state ──
        try {
          const intentResult = await callRouter.detectIntent(callSid, sttResult.text);
          app.log.info({ intent: intentResult.intent, confidence: intentResult.confidence }, 'Intent detected');

          // Transition state machine based on intent
          const activeCall = callRouter.getCall(callSid);
          if (activeCall) {
            if (activeCall.state === 'greeting' || activeCall.state === 'intent_detection') {
              callRouter.transitionState(callSid, 'intent_detection');
              if (intentResult.confidence >= 0.5) {
                callRouter.transitionState(callSid, 'task_execution');
              }
            }

            // Check smart router for escalation
            const routingDecision = await smartRouter.route(session.orgId, {
              intent: intentResult.intent,
              utterance: sttResult.text,
              confidence: intentResult.confidence,
              patientRequestedHuman: /\b(موظف|بشري|إنسان|agent|human|representative|operator)\b/i.test(sttResult.text),
              failedAttempts: activeCall.retryCount,
            });

            if (routingDecision.action === 'transfer' || routingDecision.action === 'escalate') {
              app.log.info({ decision: routingDecision }, 'Smart router: escalation triggered');
              // Store escalation info — actual Twilio transfer would happen here in production
              callSessionManager.updateContext(callSid!, {
                currentStep: 'escalation',
                collectedInfo: {
                  ...(session.context?.collectedInfo || {}),
                  escalationReason: routingDecision.reason,
                  escalationTarget: routingDecision.targetValue ?? 'unknown',
                },
              });
            }

            // ── SMS Deflection: detect scheduling/directions intent ──
            try {
              if (intentResult.intent === 'scheduling') {
                const baseUrl = process.env.BASE_URL || 'https://namaa.app';
                await smsDeflector.triggerMidCallSms({
                  orgId: session.orgId,
                  intent: 'scheduling',
                  phone: session.callerPhone,
                  vars: {
                    patient_name: '',
                    link: `${baseUrl}/book`,
                  },
                  lang: /[\u0600-\u06FF]/.test(sttResult.text) ? 'ar' : 'en',
                });
                app.log.info('Mid-call SMS sent for scheduling intent');
              }
            } catch (smsErr) {
              app.log.error({ err: smsErr }, 'Mid-call SMS deflection failed');
            }
          }
        } catch (routerErr) {
          app.log.error({ err: routerErr }, 'Call router processing failed — continuing');
        }

        // ── PII Redaction: redact before saving to DB ──
        let redactedUserText = sttResult.text;
        try {
          redactedUserText = redactPII(sttResult.text).redactedText;
        } catch (_) { /* keep original */ }

        // Save user utterance to database
        await app.prisma.voiceUtterance.create({
          data: {
            callId: session.callId,
            speaker: 'caller',
            text: redactedUserText,
            confidence: sttResult.confidence,
            dialect: sttResult.dialect,
          },
        });

        // Save as conversation message (PII-redacted)
        await app.prisma.conversationMessage.create({
          data: {
            conversationId: session.conversationId,
            direction: 'in',
            bodyText: redactedUserText,
            payload: {
              source: 'voice',
              dialect: sttResult.dialect,
              confidence: sttResult.confidence,
            },
          },
        });

        // Get conversation history for LLM
        const historyMessages = await app.prisma.conversationMessage.findMany({
          where: { conversationId: session.conversationId },
          orderBy: { createdAt: 'asc' },
          take: 10, // Keep context short for voice
        });

        const chatMessages: ChatMessage[] = historyMessages.map((m) => ({
          role: m.direction === 'in' ? 'user' : 'assistant',
          content: m.bodyText || '',
        }));

        // Build voice-optimized system prompt
        let systemPrompt = await buildVoiceSystemPrompt(
          app.prisma,
          session.orgId,
          dialect as ArabicDialect
        );

        // ── Patient Context: enrich voice prompt with patient memory ──
        try {
          // Resolve patient from conversation
          const conv = await app.prisma.conversation.findUnique({
            where: { conversationId: session.conversationId },
            select: { patientId: true },
          });
          const voicePatientId = conv?.patientId ?? null;
          if (voicePatientId) {
            const contextBuilder = getContextBuilder(app.prisma);
            const patientContext = await contextBuilder.buildPatientContext(voicePatientId);
            if (patientContext) {
              systemPrompt += '\n' + patientContext;
            }
          }
        } catch (ctxErr) {
          app.log.error({ err: ctxErr }, 'Failed to build voice patient context');
        }

        // Get LLM response
        app.log.info('Getting LLM response...');
        let llmResponse = await llmService.chat(chatMessages, systemPrompt);

        app.log.info(`LLM response: "${llmResponse}"`);

        // ── AI Guardrails: validate response before TTS ──
        try {
          const validationContext: ValidationContext = {
            orgId: session.orgId,
            conversationId: session.conversationId,
            userMessage: sttResult.text,
            aiResponse: llmResponse,
          };
          const guardrailResult = await guardrails.validateResponse(validationContext);

          if (!guardrailResult.approved && guardrailResult.sanitizedResponse) {
            app.log.warn(
              { flags: guardrailResult.flags },
              'Voice guardrails blocked response — using safe replacement',
            );
            llmResponse = guardrailResult.sanitizedResponse;
          }
        } catch (grErr) {
          app.log.error({ err: grErr }, 'Voice guardrails validation failed — using original');
        }

        // ── PII Redaction for AI response logging ──
        let redactedAiResponse = llmResponse;
        try {
          redactedAiResponse = redactPII(llmResponse).redactedText;
        } catch (_) { /* keep original */ }

        // Save AI response (PII-redacted in DB)
        await app.prisma.voiceUtterance.create({
          data: {
            callId: session.callId,
            speaker: 'ai',
            text: redactedAiResponse,
            dialect,
          },
        });

        await app.prisma.conversationMessage.create({
          data: {
            conversationId: session.conversationId,
            direction: 'out',
            bodyText: redactedAiResponse,
            payload: {
              source: 'voice',
              model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
            },
          },
        });

        // Convert response to speech
        callSessionManager.setSpeaking(callSid, true);

        if (ttsService.isConfigured()) {
          app.log.info('Synthesizing speech...');

          // Stream TTS audio back to Twilio
          const ttsStream = ttsService.synthesizeStream(llmResponse, dialect as ArabicDialect);

          for await (const pcmChunk of ttsStream) {
            // Check if we should stop (e.g., caller interrupted)
            const currentSession = callSessionManager.getSession(callSid);
            if (!currentSession?.isSpeaking) {
              app.log.info('Speech interrupted by caller');
              break;
            }

            // Convert PCM to mulaw for Twilio
            const mulawChunk = pcmToMulaw(pcmChunk);
            sendAudio(mulawChunk);
          }

          // Mark end of audio
          sendMark('end-of-response');
        } else {
          app.log.warn('TTS not configured, using Twilio TTS fallback');
          // Note: In production, you'd handle this differently
          // Twilio TTS can only be used via TwiML, not media streams
        }

        callSessionManager.setSpeaking(callSid, false);
      } catch (error) {
        app.log.error(`Voice processing error: ${error}`);

        // Send error message in Arabic
        const session = callSessionManager.getSession(callSid);
        const dialect = (session?.detectedDialect || 'msa') as ArabicDialect;
        const errorMessage = getErrorMessage(dialect);

        if (ttsService.isConfigured()) {
          try {
            const errorAudio = await ttsService.synthesize(errorMessage, dialect);
            const mulawAudio = pcmToMulaw(errorAudio);
            sendAudio(mulawAudio);
          } catch (ttsError) {
            app.log.error(`Failed to send error message: ${ttsError}`);
          }
        }
      } finally {
        callSessionManager.setProcessing(callSid, false);
      }
    }

    // Handle incoming WebSocket messages
    ws.on('message', async (data: Buffer) => {
      try {
        const message: TwilioMediaMessage = JSON.parse(data.toString());

        switch (message.event) {
          case 'connected':
            app.log.info('Twilio Media Stream connected');
            break;

          case 'start':
            streamSid = message.start!.streamSid;
            callSid = message.start!.callSid;
            app.log.info(`Stream started: ${streamSid} for call ${callSid}`);

            // ── Call Router: register call in state machine ──
            try {
              const session = callSessionManager.getSession(callSid);
              if (session) {
                callRouter.startCall(callSid, session.orgId, session.callerPhone, session.conversationId);
                app.log.info('Call router initialized for call');
              }
            } catch (routerErr) {
              app.log.error({ err: routerErr }, 'Failed to initialize call router');
            }
            break;

          case 'media':
            if (!callSid || !message.media) break;

            // Check for interruption (caller speaking while AI is speaking)
            const session = callSessionManager.getSession(callSid);
            if (session?.isSpeaking) {
              // Caller is interrupting - stop AI speech
              callSessionManager.setSpeaking(callSid, false);
              clearAudio();
              app.log.info('Caller interrupted AI speech');
            }

            // Decode base64 audio (mulaw 8kHz)
            const audioChunk = Buffer.from(message.media.payload, 'base64');
            audioBuffer.push(audioChunk);

            // Reset silence timer
            if (silenceTimer) {
              clearTimeout(silenceTimer);
            }

            // Set timer to process audio after silence
            silenceTimer = setTimeout(() => {
              processAudio();
            }, SILENCE_THRESHOLD_MS);
            break;

          case 'mark':
            app.log.debug(`Mark received: ${message.mark?.name}`);
            break;

          case 'stop':
            app.log.info('Stream stopped');
            if (silenceTimer) {
              clearTimeout(silenceTimer);
            }
            // Process any remaining audio
            if (audioBuffer.length > 0) {
              await processAudio();
            }

            // ── Post-call: SMS summary + call router cleanup + memory extraction ──
            try {
              if (callSid) {
                const endedCall = callRouter.endCall(callSid);
                if (endedCall) {
                  const session = callSessionManager.getSession(callSid);
                  if (session?.callerPhone) {
                    // Send post-call follow-up SMS
                    await smsDeflector.triggerPostCallSms({
                      orgId: endedCall.orgId,
                      trigger: 'follow_up',
                      phone: session.callerPhone,
                      patientId: endedCall.patientId ?? undefined,
                      vars: {
                        patient_name: '',
                      },
                    });
                    app.log.info('Post-call SMS triggered');
                  }

                  // ── Memory Extraction: extract memories from voice conversation ──
                  try {
                    const conv = endedCall.conversationId
                      ? await app.prisma.conversation.findUnique({
                          where: { conversationId: endedCall.conversationId },
                          select: { patientId: true },
                        })
                      : null;
                    const voicePatientId = conv?.patientId ?? null;
                    if (voicePatientId && endedCall.conversationId) {
                      const messages = await app.prisma.conversationMessage.findMany({
                        where: { conversationId: endedCall.conversationId },
                        orderBy: { createdAt: 'asc' },
                        select: { direction: true, bodyText: true },
                      });
                      const contextBuilder = getContextBuilder(app.prisma);
                      await contextBuilder.extractMemories(
                        voicePatientId,
                        messages.map(m => ({
                          direction: m.direction as 'in' | 'out',
                          bodyText: m.bodyText,
                        })),
                        endedCall.conversationId,
                      );
                      app.log.info('Post-call memory extraction completed');
                    }
                  } catch (memErr) {
                    app.log.error({ err: memErr }, 'Post-call memory extraction failed');
                  }
                }
              }
            } catch (postCallErr) {
              app.log.error({ err: postCallErr }, 'Post-call processing failed');
            }
            break;
        }
      } catch (error) {
        app.log.error(`Error processing WebSocket message: ${error}`);
      }
    });

    ws.on('close', () => {
      app.log.info('Voice WebSocket connection closed');
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
    });

    ws.on('error', (error: Error) => {
      app.log.error(`Voice WebSocket error: ${error.message}`);
    });
  });
}
