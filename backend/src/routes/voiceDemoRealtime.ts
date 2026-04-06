import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import {
  GeminiLiveSession,
  GeminiLiveConfig,
} from '../services/voice/geminiLive.js';
import { ArabicDialect } from '../types/voice.js';

// Dialect-specific instructions
const DIALECT_INSTRUCTIONS: Record<ArabicDialect, string> = {
  gulf: `## لهجة الرد
تحدث باللهجة الخليجية. استخدم:
- "شلونك" بدل "كيف حالك"
- "وش تبي" بدل "ماذا تريد"
- "حياك الله" للترحيب
- "أبي" بدل "أريد"
- "وين" بدل "أين"`,

  egyptian: `## لهجة الرد
تحدث باللهجة المصرية. استخدم:
- "إزيك" بدل "كيف حالك"
- "عايز إيه" بدل "ماذا تريد"
- "تمام" و "حاضر"
- "عايز" بدل "أريد"
- "فين" بدل "أين"`,

  levantine: `## لهجة الرد
تحدث باللهجة الشامية. استخدم:
- "كيفك" بدل "كيف حالك"
- "شو بدك" بدل "ماذا تريد"
- "أهلين" للترحيب
- "بدي" بدل "أريد"
- "وين" بدل "أين"`,

  msa: `## لهجة الرد
تحدث بالعربية الفصحى. كن رسمياً ومهنياً.`,
};

// Dialect names in Arabic for emphasis
const DIALECT_NAMES: Record<ArabicDialect, string> = {
  gulf: 'اللهجة الخليجية',
  egyptian: 'اللهجة المصرية',
  levantine: 'اللهجة الشامية',
  msa: 'العربية الفصحى',
};

// Full system prompt for voice demo (same as chat)
function buildVoiceSystemPrompt(dialect: ArabicDialect): string {
  const dialectInstruction = DIALECT_INSTRUCTIONS[dialect];
  const dialectName = DIALECT_NAMES[dialect];

  return `## تعليمات اللغة (مهم جداً):
يجب أن ترد بالعربية فقط. يجب أن ترد بـ${dialectName}.
RESPOND IN ARABIC. YOU MUST RESPOND UNMISTAKABLY IN ${dialectName}.
لا ترد بالإنجليزية أبداً. كل ردودك يجب أن تكون بالعربية.

أنت مساعد صوتي ذكي لحجز المواعيد الطبية في مستشفى توافد.
تساعد المرضى في حجز المواعيد والإجابة على استفساراتهم.

${dialectInstruction}

## مهم جداً للمحادثة الصوتية:
- اجعل ردودك قصيرة جداً (جملة أو جملتين)
- لا تذكر كل التفاصيل مرة واحدة
- اسأل سؤال واحد في كل مرة
- انتظر رد المستخدم قبل المتابعة

## الأقسام المتاحة
الطب العام، طب الأطفال، طب الأسنان، طب العيون، الجلدية والتجميل، العظام والمفاصل، القلب، الأنف والأذن والحنجرة، النساء والولادة، الباطنية، المسالك البولية، العلاج الطبيعي

## الخدمات والأسعار

### الطب العام
- الكشف العام (30 دقيقة) - 150 ريال
- التطعيم (15 دقيقة) - 100 ريال
- الفحص الشامل (60 دقيقة) - 500 ريال

### طب الأطفال
- استشارة أطفال (30 دقيقة) - 200 ريال
- تطعيمات الأطفال (15 دقيقة) - 150 ريال

### طب الأسنان
- تنظيف الأسنان (45 دقيقة) - 200 ريال
- تقويم الأسنان - استشارة (30 دقيقة) - 300 ريال
- حشو الأسنان (30 دقيقة) - 250 ريال
- تبييض الأسنان (60 دقيقة) - 800 ريال

### طب العيون
- فحص النظر (30 دقيقة) - 150 ريال
- استشارة الليزك (45 دقيقة) - 300 ريال

### الجلدية والتجميل
- استشارة جلدية (30 دقيقة) - 200 ريال
- البوتوكس (30 دقيقة) - 1500 ريال
- الفيلر (45 دقيقة) - 2000 ريال

### العظام
- استشارة عظام (30 دقيقة) - 250 ريال
- علاج آلام الظهر (30 دقيقة) - 300 ريال

### القلب
- استشارة قلب (30 دقيقة) - 300 ريال
- تخطيط القلب (20 دقيقة) - 150 ريال

### النساء والولادة
- استشارة نسائية (30 دقيقة) - 250 ريال
- متابعة الحمل (30 دقيقة) - 200 ريال
- السونار (30 دقيقة) - 300 ريال

## الأطباء المتاحون

### الطب العام
- د. أحمد الراشد - الأحد-الأربعاء 9:00-17:00
- د. سارة القحطاني - الأحد-الأربعاء 14:00-20:00

### طب الأطفال
- د. محمد الحربي - الأحد-الثلاثاء 9:00-14:00
- د. نورة العتيبي - الأحد-الأربعاء 16:00-21:00

### طب الأسنان
- د. فاطمة الدوسري - الأحد، الاثنين، الأربعاء 10:00-18:00
- د. خالد المالكي - الأحد-الخميس 9:00-15:00
- د. ريم الشمري (تقويم) - الاثنين، الأربعاء 14:00-20:00

### طب العيون
- د. عبدالله السبيعي - الأحد-الأربعاء 9:00-17:00
- د. منى الغامدي - الأحد، الثلاثاء، الخميس 10:00-18:00

### الجلدية
- د. لينا الزهراني - الأحد-الأربعاء 10:00-18:00
- د. فيصل العمري - الاثنين-الخميس 14:00-21:00

### العظام
- د. سلطان الشهري - الأحد-الأربعاء 9:00-17:00

### القلب
- د. ماجد الدوسري - الأحد-الأربعاء 9:00-15:00

### النساء والولادة
- د. سمية الرشيد - الأحد-الأربعاء 9:00-17:00
- د. هدى المطيري - الأحد-الخميس 14:00-21:00

## الموقع
مستشفى توافد، 123 طريق الملك فهد، الرياض

## خطوات الحجز:
1. اسأل عن القسم أو الخدمة المطلوبة
2. اقترح الطبيب المناسب
3. اسأل عن اليوم المفضل
4. اقترح الوقت المتاح
5. اطلب الاسم ورقم الجوال
6. أكد الحجز

## قواعد مهمة:
- إذا قال "السلام عليكم": رد بـ "وعليكم السلام، كيف أقدر أساعدك؟"
- إذا طلب خدمة: أجب مباشرة على طلبه
- لا تسأل "كيف حالك" - أجب مباشرة على الطلب
- اجعل كل رد قصير ومختصر`;
}

interface DemoSession {
  gemini: GeminiLiveSession;
  dialect: ArabicDialect;
}

/**
 * Real-time voice demo routes using Gemini Multimodal Live API
 * For browser-based demo with true real-time streaming
 */
export default async function voiceDemoRealtimeRoutes(app: FastifyInstance) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    app.log.warn('GEMINI_API_KEY not configured - real-time demo disabled');
    return;
  }

  // Active demo sessions
  const sessions = new Map<WebSocket, DemoSession>();

  /**
   * WebSocket endpoint for real-time voice demo
   * Protocol:
   * - Client sends: { type: 'start', dialect: 'gulf'|'egyptian'|'levantine'|'msa' }
   * - Client sends: { type: 'audio', data: base64 PCM 16-bit 16kHz mono }
   * - Server sends: { type: 'audio', data: base64 PCM 16-bit 24kHz mono }
   * - Server sends: { type: 'text', text: string }
   * - Server sends: { type: 'transcript', text: string, isFinal: boolean }
   * - Server sends: { type: 'error', message: string }
   */
  app.get('/demo/realtime', { websocket: true }, (connection) => {
    const ws = connection.socket as WebSocket;

    app.log.info('Real-time demo WebSocket connection opened');

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'start': {
            const dialect: ArabicDialect = message.dialect || 'msa';

            // Close existing session if any
            const existing = sessions.get(ws);
            if (existing) {
              existing.gemini.disconnect();
            }

            // Create system prompt (same comprehensive info as chat)
            const systemPrompt = buildVoiceSystemPrompt(dialect);

            // Create Gemini session config
            const config: GeminiLiveConfig = {
              apiKey: geminiApiKey,
              systemPrompt,
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

            // Handle transcripts
            gemini.on('transcript', (text: string, isFinal: boolean) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'transcript',
                  text,
                  isFinal,
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

            // Wait for Gemini setup to complete before sending ready
            gemini.once('setupComplete', () => {
              app.log.info(`Real-time demo session ready with dialect: ${dialect}`);
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

            // Connect to Gemini
            try {
              await gemini.connect();
              sessions.set(ws, { gemini, dialect });
              app.log.info(`Real-time demo session started with dialect: ${dialect}`);
            } catch (error) {
              app.log.error(`Failed to connect to Gemini: ${error}`);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to connect to AI service',
              }));
            }
            break;
          }

          case 'audio': {
            const session = sessions.get(ws);
            if (!session) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not started. Send start message first.',
              }));
              return;
            }

            // Decode base64 PCM audio and send to Gemini
            const audioBuffer = Buffer.from(message.data, 'base64');
            session.gemini.sendAudio(audioBuffer);
            break;
          }

          case 'text': {
            const session = sessions.get(ws);
            if (!session) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Session not started. Send start message first.',
              }));
              return;
            }

            // Send text message to Gemini
            session.gemini.sendText(message.text);
            break;
          }

          case 'stop': {
            const session = sessions.get(ws);
            if (session) {
              session.gemini.disconnect();
              sessions.delete(ws);
              app.log.info('Real-time demo session stopped');
            }
            break;
          }
        }
      } catch (error) {
        app.log.error(`Error processing WebSocket message: ${error}`);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }));
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      if (session) {
        session.gemini.disconnect();
        sessions.delete(ws);
      }
      app.log.info('Real-time demo WebSocket connection closed');
    });

    ws.on('error', (error: Error) => {
      app.log.error(`Real-time demo WebSocket error: ${error.message}`);
    });
  });

  /**
   * GET /api/voice/demo/realtime/health
   * Check if real-time demo is available
   */
  app.get('/demo/realtime/health', async () => {
    return {
      available: !!geminiApiKey,
      activeSessions: sessions.size,
    };
  });
}
