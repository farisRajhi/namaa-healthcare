import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getSTTService } from '../services/voice/sttService.js';
import { getTTSService } from '../services/voice/ttsService.js';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { detectDialect } from '../services/voice/dialectDetector.js';
import { ArabicDialect } from '../types/voice.js';

// Schema for demo request
const voiceDemoSchema = z.object({
  audio: z.string().optional(), // Base64 encoded audio
  text: z.string().optional(), // Or direct text input
  dialect: z.enum(['gulf', 'egyptian', 'levantine', 'msa']).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

// Dialect-specific instructions
const DIALECT_INSTRUCTIONS: Record<string, string> = {
  gulf: `
## تعليمات اللهجة الخليجية
- استخدم اللهجة الخليجية في الردود
- استخدم عبارات مثل: إن شاء الله، زين، حياك الله، تفضل، شلونك، وش تبي
- كن ودوداً ومضيافاً
- مثال: "زين، خلني أشوف المواعيد المتاحة"`,

  egyptian: `
## تعليمات اللهجة المصرية
- استخدم اللهجة المصرية في الردود
- استخدم عبارات مثل: تمام، ماشي، إن شاء الله، أهلاً، ازيك، عايز إيه
- كن ودوداً وقريباً
- مثال: "تمام، خليني أشوف المواعيد"`,

  levantine: `
## تعليمات اللهجة الشامية
- استخدم اللهجة الشامية في الردود
- استخدم عبارات مثل: منيح، هلق، إن شاء الله، أهلين، كيفك، شو بدك
- كن مهذباً ولطيفاً
- مثال: "منيح، خليني شوف المواعيد"`,

  msa: `
## تعليمات اللغة الفصحى
- استخدم اللغة العربية الفصحى الواضحة
- كن مهنياً ورسمياً
- تجنب العبارات العامية
- مثال: "حسناً، دعني أتحقق من المواعيد المتاحة"`,
};

// Build system prompt with dialect
function buildDemoSystemPrompt(dialect: ArabicDialect): string {
  return `أنت مساعد ذكي لحجز المواعيد الطبية. هذه نسخة تجريبية.

## قواعد المحادثة
- اجعل ردودك قصيرة ومباشرة (جملة إلى جملتين)
- تحدث بشكل طبيعي وودود
- هذه نسخة تجريبية، لا يمكنك حجز مواعيد فعلية

${DIALECT_INSTRUCTIONS[dialect] || DIALECT_INSTRUCTIONS.msa}

## الخدمات المتاحة (للعرض فقط)
- الكشف العام (30 دقيقة)
- كشف الأسنان (45 دقيقة)
- الأشعة (15 دقيقة)

## الأطباء المتاحون (للعرض فقط)
- د. أحمد الخالدي - طب عام
- د. سارة المحمد - طب أسنان

أجب على استفسارات المستخدم بشكل ودود ومختصر باللهجة المطلوبة.`;
}

export default async function voiceDemoRoutes(app: FastifyInstance) {
  /**
   * POST /api/voice/demo
   * Demo endpoint for testing voice AI without real phone call
   */
  app.post('/demo', async (request: FastifyRequest) => {
    const body = voiceDemoSchema.parse(request.body);

    let userText = body.text || '';
    // Use selected dialect from request, or detect from text
    let selectedDialect: ArabicDialect = body.dialect || 'msa';

    // If audio is provided, transcribe it
    if (body.audio) {
      try {
        // Decode base64 audio
        const audioBuffer = Buffer.from(body.audio, 'base64');

        // For web audio (webm), we need to convert or use a different approach
        // For simplicity in demo, we'll use the text if provided, or simulate
        const sttService = getSTTService();

        // Note: WebM from browser needs conversion for Whisper
        // In production, you'd convert webm to wav here
        // For demo, we'll simulate with text input or a simple response

        // Try to transcribe (may fail with webm format)
        try {
          const result = await sttService.transcribe(audioBuffer);
          userText = result.text;
          // Keep user's selected dialect, don't override from detection
        } catch (sttError) {
          app.log.warn('STT failed, using fallback:', sttError);
          // Fallback - just acknowledge we received audio
          userText = 'مرحبا';
        }
      } catch (err) {
        app.log.error('Error processing audio:', err);
        userText = body.text || 'مرحبا';
      }
    }

    // If still no text, return error
    if (!userText.trim()) {
      return {
        error: 'No audio or text provided',
        transcription: '',
        response: 'عذراً، لم أستطع فهم ما قلته. هل يمكنك المحاولة مرة أخرى؟',
        dialect: selectedDialect,
      };
    }

    // Build conversation history for LLM
    const history: ChatMessage[] = (body.conversationHistory || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add current user message
    history.push({ role: 'user', content: userText });

    // Get LLM response with dialect-specific system prompt
    const llmService = getLLMService();
    const systemPrompt = buildDemoSystemPrompt(selectedDialect);
    const response = await llmService.chat(history, systemPrompt);

    // Try to generate TTS audio
    let audioBase64: string | null = null;
    const ttsService = getTTSService();

    if (ttsService.isConfigured()) {
      try {
        const audioBuffer = await ttsService.synthesize(response, selectedDialect);
        audioBase64 = audioBuffer.toString('base64');
      } catch (ttsError) {
        app.log.warn('TTS failed:', ttsError);
      }
    }

    return {
      transcription: userText,
      response,
      dialect: selectedDialect,
      audioBase64,
    };
  });

  /**
   * POST /api/voice/demo/text
   * Text-only demo (no audio processing)
   */
  app.post('/demo/text', async (request: FastifyRequest) => {
    const body = z.object({
      text: z.string(),
      conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
    }).parse(request.body);

    const userText = body.text;
    const detectedDialect = detectDialect(userText);

    // Build conversation history
    const history: ChatMessage[] = (body.conversationHistory || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    history.push({ role: 'user', content: userText });

    // Get LLM response
    const llmService = getLLMService();
    const response = await llmService.chat(history, DEMO_SYSTEM_PROMPT);

    return {
      transcription: userText,
      response,
      dialect: detectedDialect,
    };
  });

  /**
   * GET /api/voice/demo/health
   * Check demo service health
   */
  app.get('/demo/health', async () => {
    const ttsService = getTTSService();

    return {
      status: 'ok',
      sttConfigured: !!process.env.OPENAI_API_KEY,
      ttsConfigured: ttsService.isConfigured(),
      llmConfigured: !!process.env.OPENAI_API_KEY,
    };
  });
}
