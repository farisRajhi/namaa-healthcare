import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GeminiLiveSession } from '../services/voice/geminiLive.js';

/**
 * Test routes for Gemini Multimodal Live API
 * Use these endpoints to test Gemini without Twilio/phone
 */
export default async function geminiTestRoutes(app: FastifyInstance) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  /**
   * GET /api/gemini-test/status
   * Check if Gemini is configured
   */
  app.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      configured: !!geminiApiKey,
      model: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash-exp',
      useGeminiVoice: process.env.USE_GEMINI_VOICE === 'true',
    };
  });

  /**
   * POST /api/gemini-test/chat
   * Test text chat with Gemini (no voice)
   */
  app.post('/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!geminiApiKey) {
      return reply.code(400).send({
        error: 'GEMINI_API_KEY not configured',
        hint: 'Add GEMINI_API_KEY to your .env file',
      });
    }

    const { message, systemPrompt } = request.body as {
      message: string;
      systemPrompt?: string;
    };

    if (!message) {
      return reply.code(400).send({ error: 'Message is required' });
    }

    const defaultPrompt = `أنت مساعد ذكي لحجز المواعيد الطبية.
تحدث بالعربية بشكل ودود ومختصر.
ساعد المستخدم في حجز موعد أو الإجابة عن استفساراته.`;

    // Create a Gemini session
    const session = new GeminiLiveSession({
      apiKey: geminiApiKey,
      systemPrompt: systemPrompt || defaultPrompt,
      dialect: 'msa',
    });

    let responseText = '';

    return new Promise(async (resolve, reject) => {
      // Collect text responses
      session.on('text', (text: string) => {
        responseText += text;
      });

      session.on('error', (error: Error) => {
        app.log.error(`Gemini error: ${error.message}`);
        resolve({
          success: false,
          error: error.message,
        });
      });

      try {
        await session.connect();
        app.log.info('Gemini session connected for test');

        // Send user message
        session.sendText(message);

        // Wait for response (with timeout)
        setTimeout(() => {
          session.disconnect();
          resolve({
            success: true,
            userMessage: message,
            response: responseText || 'No response received (session may need more time)',
          });
        }, 10000); // 10 second timeout

      } catch (error) {
        app.log.error(`Gemini connection error: ${error}`);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  });

  /**
   * POST /api/gemini-test/voice-simulation
   * Simulate a voice conversation flow (text-based)
   */
  app.post('/voice-simulation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!geminiApiKey) {
      return reply.code(400).send({
        error: 'GEMINI_API_KEY not configured',
      });
    }

    const { messages } = request.body as {
      messages: string[];
    };

    if (!messages || messages.length === 0) {
      return reply.code(400).send({
        error: 'Messages array is required',
        example: { messages: ['مرحبا', 'أريد حجز موعد'] }
      });
    }

    // Get org data for realistic prompt
    const org = await app.prisma.org.findFirst();
    const providers = await app.prisma.provider.findMany({
      where: { active: true },
      take: 5,
    });
    const services = await app.prisma.service.findMany({
      where: { active: true },
      take: 5,
    });

    const systemPrompt = `أنت مساعد ذكي لحجز المواعيد الطبية في ${org?.name || 'العيادة'}.

## الخدمات المتاحة:
${services.map(s => `- ${s.name}`).join('\n') || '- فحص عام\n- استشارة'}

## الأطباء:
${providers.map(p => `- ${p.displayName}`).join('\n') || '- د. أحمد\n- د. سارة'}

## قواعد المحادثة:
- اجعل ردودك قصيرة ومباشرة
- استخدم اللغة العربية الفصحى
- اسأل عن المعلومات خطوة بخطوة
- أكد التفاصيل قبل الحجز`;

    const session = new GeminiLiveSession({
      apiKey: geminiApiKey,
      systemPrompt,
      dialect: 'msa',
    });

    const conversation: { role: string; text: string }[] = [];

    return new Promise(async (resolve) => {
      session.on('text', (text: string) => {
        conversation.push({ role: 'assistant', text });
      });

      session.on('error', (error: Error) => {
        resolve({
          success: false,
          error: error.message,
          conversation,
        });
      });

      try {
        await session.connect();

        // Send each message with delay
        for (const msg of messages) {
          conversation.push({ role: 'user', text: msg });
          session.sendText(msg);
          await new Promise(r => setTimeout(r, 3000)); // Wait for response
        }

        // Final wait for last response
        setTimeout(() => {
          session.disconnect();
          resolve({
            success: true,
            conversation,
          });
        }, 5000);

      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          conversation,
        });
      }
    });
  });

  /**
   * GET /api/gemini-test/connection
   * Test basic WebSocket connection to Gemini
   */
  app.get('/connection', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!geminiApiKey) {
      return reply.code(400).send({
        error: 'GEMINI_API_KEY not configured',
        steps: [
          '1. Go to https://aistudio.google.com/apikey',
          '2. Create an API key',
          '3. Add GEMINI_API_KEY=your-key to .env',
          '4. Restart the server',
        ],
      });
    }

    const session = new GeminiLiveSession({
      apiKey: geminiApiKey,
      systemPrompt: 'Test connection',
      dialect: 'msa',
    });

    try {
      await session.connect();
      session.disconnect();

      return {
        success: true,
        message: 'Successfully connected to Gemini Multimodal Live API',
        model: process.env.GEMINI_MODEL || 'models/gemini-2.0-flash-exp',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check if your API key is valid and has access to Gemini 2.0',
      };
    }
  });
}
