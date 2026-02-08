import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { callSessionManager } from '../services/voice/callSession.js';
import { getSTTService, mulawToWav } from '../services/voice/sttService.js';
import { getTTSService, pcmToMulaw } from '../services/voice/ttsService.js';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildVoiceSystemPrompt, getRepeatMessage, getErrorMessage } from '../services/voicePrompt.js';
import { TwilioMediaMessage, TwilioMediaResponse, ArabicDialect } from '../types/voice.js';

// Silence detection threshold (in bytes of audio that constitute "silence")
const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence triggers processing
const MIN_AUDIO_LENGTH = 1600; // Minimum audio bytes to process (100ms at 8kHz)

export default async function voiceStreamRoutes(app: FastifyInstance) {
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

        // Save user utterance to database
        await app.prisma.voiceUtterance.create({
          data: {
            callId: session.callId,
            speaker: 'caller',
            text: sttResult.text,
            confidence: sttResult.confidence,
            dialect: sttResult.dialect,
          },
        });

        // Save as conversation message
        await app.prisma.conversationMessage.create({
          data: {
            conversationId: session.conversationId,
            direction: 'in',
            bodyText: sttResult.text,
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
        const systemPrompt = await buildVoiceSystemPrompt(
          app.prisma,
          session.orgId,
          dialect as ArabicDialect
        );

        // Get LLM response
        app.log.info('Getting LLM response...');
        const llmResponse = await llmService.chat(chatMessages, systemPrompt);

        app.log.info(`LLM response: "${llmResponse}"`);

        // Save AI response
        await app.prisma.voiceUtterance.create({
          data: {
            callId: session.callId,
            speaker: 'ai',
            text: llmResponse,
            dialect,
          },
        });

        await app.prisma.conversationMessage.create({
          data: {
            conversationId: session.conversationId,
            direction: 'out',
            bodyText: llmResponse,
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
        app.log.error('Voice processing error:', error);

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
            app.log.error('Failed to send error message:', ttsError);
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
            break;
        }
      } catch (error) {
        app.log.error('Error processing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      app.log.info('Voice WebSocket connection closed');
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
    });

    ws.on('error', (error) => {
      app.log.error('Voice WebSocket error:', error);
    });
  });
}
