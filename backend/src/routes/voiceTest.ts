import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import {
  GeminiLiveSession,
  GeminiLiveConfig,
} from '../services/voice/geminiLive.js';
import { buildVoiceSystemPrompt } from '../services/voicePrompt.js';
import { ArabicDialect } from '../types/voice.js';

interface TestSession {
  gemini: GeminiLiveSession;
  dialect: ArabicDialect;
  orgId: string;
}

/**
 * Authenticated voice test routes for management dashboard
 * Allows business owners to test the AI with their real data
 */
export default async function voiceTestRoutes(app: FastifyInstance) {
  // Active test sessions
  const sessions = new Map<WebSocket, TestSession>();

  /**
   * GET /api/voice/test/config
   * Get voice test configuration for the organization
   * This needs authentication, so we register it separately with the hook
   */
  app.get('/test/config', { preHandler: [app.authenticate] }, async (request: FastifyRequest) => {
    const user = (request as any).user;
    if (!user?.orgId) {
      return { error: 'Authentication required' };
    }

    // Check if org has data configured
    const [departments, providers, services, allProviders, allServices] = await Promise.all([
      app.prisma.department.count({ where: { orgId: user.orgId } }),
      app.prisma.provider.count({ where: { orgId: user.orgId, active: true } }),
      app.prisma.service.count({ where: { orgId: user.orgId, active: true } }),
      app.prisma.provider.count({ where: { orgId: user.orgId } }),
      app.prisma.service.count({ where: { orgId: user.orgId } }),
    ]);

    app.log.info(`Voice test config for org ${user.orgId}: departments=${departments}, providers=${providers}/${allProviders}, services=${services}/${allServices}`);

    return {
      available: true,
      configured: departments > 0 && providers > 0 && services > 0,
      stats: {
        departments,
        providers,
        services,
        allProviders,
        allServices,
      },
      dialects: [
        { value: 'gulf', label: 'خليجي', labelEn: 'Gulf' },
        { value: 'egyptian', label: 'مصري', labelEn: 'Egyptian' },
        { value: 'levantine', label: 'شامي', labelEn: 'Levantine' },
        { value: 'msa', label: 'فصحى', labelEn: 'MSA' },
      ],
    };
  });

  /**
   * WebSocket endpoint for authenticated voice testing
   * Uses real organization data from database
   */
  app.get('/test', { websocket: true }, async (connection, request: FastifyRequest) => {
    const ws = connection.socket as WebSocket;

    // Get token from query parameter for WebSocket auth
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');
    
    let user = (request as any).user;
    
    // If no user from middleware, try to verify token from query
    if (!user?.orgId && token) {
      try {
        const jwt = await import('jsonwebtoken') as any;
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET!) as any;
        user = { orgId: decoded.orgId, userId: decoded.userId };
      } catch (e) {
        app.log.error(`Token verification failed: ${e}`);
      }
    }
    
    if (!user?.orgId) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Authentication required',
      }));
      ws.close();
      return;
    }

    const orgId = user.orgId;
    app.log.info(`Voice test WebSocket opened for org: ${orgId}, user: ${user.userId}`);

    ws.on('message', async (data: Buffer) => {
      app.log.info(`[Voice Test] Received WebSocket message, length: ${data.length}, type: ${typeof data}`);
      try {
        const messageStr = data.toString();
        app.log.info(`[Voice Test] Message string: ${messageStr.substring(0, 200)}`);
        const message = JSON.parse(messageStr);
        app.log.info(`[Voice Test] Parsed message type: ${message.type}`);

        switch (message.type) {
          case 'start': {
            const dialect: ArabicDialect = message.dialect || 'gulf';

            // Check Google Cloud configuration first
            if (!process.env.GOOGLE_CLOUD_PROJECT) {
              app.log.error('GOOGLE_CLOUD_PROJECT not configured');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Server configuration error: GOOGLE_CLOUD_PROJECT not set',
              }));
              return;
            }

            // Close existing session if any
            const existing = sessions.get(ws);
            if (existing) {
              existing.gemini.disconnect();
            }

            // Build system prompt from REAL organization data
            let systemPrompt: string;
            try {
              systemPrompt = await buildVoiceSystemPrompt(
                app.prisma,
                orgId,
                dialect
              );
            } catch (error: any) {
              const errorMsg = error?.message || 'Failed to load organization data';
              app.log.error(`Failed to build voice system prompt for org ${orgId}:`, errorMsg);
              ws.send(JSON.stringify({
                type: 'error',
                message: `فشل في تحميل بيانات المنظمة: ${errorMsg}`,
              }));
              return;
            }

            // Add strong Arabic language instruction
            const dialectNames: Record<ArabicDialect, string> = {
              gulf: 'اللهجة الخليجية',
              egyptian: 'اللهجة المصرية',
              levantine: 'اللهجة الشامية',
              msa: 'العربية الفصحى',
            };

            const fullPrompt = `## تعليمات اللغة (مهم جداً):
يجب أن ترد بالعربية فقط. يجب أن ترد بـ${dialectNames[dialect]}.
RESPOND IN ARABIC. YOU MUST RESPOND UNMISTAKABLY IN ARABIC.
لا ترد بالإنجليزية أبداً. كل ردودك يجب أن تكون بالعربية.

${systemPrompt}`;

            app.log.info(`Built voice prompt for org ${orgId}, dialect: ${dialect}, prompt length: ${fullPrompt.length} chars`);

            // Create Gemini session config
            const config: GeminiLiveConfig = {
              systemPrompt: fullPrompt,
              dialect,
            };

            const gemini = new GeminiLiveSession(config);

            // Handle audio from Gemini
            gemini.on('audio', (audioData: Buffer) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'audio',
                  data: audioData.toString('base64'),
                }));
              }
            });

            // Handle text responses
            gemini.on('text', (text: string) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'text',
                  text,
                }));
              }
            });

            // Handle interruption
            gemini.on('interrupted', () => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'interrupted',
                }));
              }
            });

            // Handle errors
            gemini.on('error', (error: Error) => {
              app.log.error(`Gemini error: ${error.message}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'error',
                  message: error.message,
                }));
              }
            });

            // Wait for Gemini setup to complete with timeout
            let setupCompleted = false;
            gemini.once('setupComplete', () => {
              setupCompleted = true;
              app.log.info(`Voice test session ready for org ${orgId}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'ready',
                  dialect,
                }));
                // Trigger initial greeting from AI
                setTimeout(() => {
                  gemini.sendText('ابدأ المحادثة بتحية المستخدم');
                }, 500);
              }
            });

            // Set timeout for setup completion
            setTimeout(() => {
              if (!setupCompleted && ws.readyState === WebSocket.OPEN) {
                app.log.error(`Setup timeout for org ${orgId} - setupComplete event never fired`);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'انتهت مهلة الاتصال بالذكاء الاصطناعي',
                }));
                gemini.disconnect();
              }
            }, 20000); // 20 second timeout

            // Connect to Gemini
            try {
              app.log.info(`Attempting to connect to Gemini for org ${orgId}...`);
              await gemini.connect();
              sessions.set(ws, { gemini, dialect, orgId });
              app.log.info(`Voice test session connected for org ${orgId}, waiting for setupComplete...`);
            } catch (error: any) {
              const errorMsg = error?.message || 'Unknown error';
              app.log.error(`Failed to connect to Gemini for org ${orgId}:`, errorMsg, error);
              ws.send(JSON.stringify({
                type: 'error',
                message: `فشل الاتصال بخدمة الذكاء الاصطناعي: ${errorMsg}`,
              }));
            }
            break;
          }

          case 'audio': {
            const session = sessions.get(ws);
            if (!session) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not started',
              }));
              return;
            }
            const audioBuffer = Buffer.from(message.data, 'base64');
            session.gemini.sendAudio(audioBuffer);
            break;
          }

          case 'text': {
            const session = sessions.get(ws);
            if (!session) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not started',
              }));
              return;
            }
            session.gemini.sendText(message.text);
            break;
          }

          case 'stop': {
            const session = sessions.get(ws);
            if (session) {
              session.gemini.disconnect();
              sessions.delete(ws);
              app.log.info(`Voice test session stopped for org ${session.orgId}`);
            }
            break;
          }
        }
      } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error';
        app.log.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: `خطأ في المعالجة: ${errorMsg}`,
        }));
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      if (session) {
        session.gemini.disconnect();
        sessions.delete(ws);
      }
      app.log.info('Voice test WebSocket closed');
    });

    ws.on('error', (error: Error) => {
      app.log.error(`Voice test WebSocket error: ${error.message}`);
    });

    // Send connected message to signal backend is ready
    app.log.info(`Sending connected message to client for org: ${orgId}`);
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Backend ready to receive messages',
    }));
  });
}
