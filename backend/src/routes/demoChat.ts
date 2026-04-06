import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getLLMService, ChatMessage } from '../services/llm.js';
import { buildSystemPrompt } from '../services/systemPrompt.js';

// Schemas
const sendMessageSchema = z.object({
  sessionId: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).max(20).optional(),
  dialect: z.enum(['gulf', 'egyptian', 'levantine', 'msa']).optional(),
});

const newSessionSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

// Rate limiting storage (in-memory)
interface RateLimitEntry {
  sessionMessages: number;
  dailyMessages: number;
  lastReset: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

// Rate limit constants
const MAX_MESSAGES_PER_SESSION = 15;
const MAX_MESSAGES_PER_DAY = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function getClientIP(request: FastifyRequest): string {
  return request.ip;
}

function checkRateLimit(ip: string, sessionId: string): { allowed: boolean; reason?: string } {
  const key = `${ip}:${sessionId}`;
  const ipKey = ip;
  const now = Date.now();

  // Get or create rate limit entry for session
  let entry = rateLimits.get(key);
  if (!entry) {
    entry = { sessionMessages: 0, dailyMessages: 0, lastReset: now };
    rateLimits.set(key, entry);
  }

  // Get or create rate limit entry for IP (daily)
  let ipEntry = rateLimits.get(ipKey);
  if (!ipEntry) {
    ipEntry = { sessionMessages: 0, dailyMessages: 0, lastReset: now };
    rateLimits.set(ipKey, ipEntry);
  }

  // Reset daily counter if needed
  if (now - ipEntry.lastReset > DAY_MS) {
    ipEntry.dailyMessages = 0;
    ipEntry.lastReset = now;
  }

  // Check limits
  if (entry.sessionMessages >= MAX_MESSAGES_PER_SESSION) {
    return {
      allowed: false,
      reason: 'You have reached the message limit for this demo session. Please sign up for unlimited access!'
    };
  }

  if (ipEntry.dailyMessages >= MAX_MESSAGES_PER_DAY) {
    return {
      allowed: false,
      reason: 'You have reached the daily demo limit. Please sign up for unlimited access!'
    };
  }

  return { allowed: true };
}

function incrementRateLimit(ip: string, sessionId: string): void {
  const key = `${ip}:${sessionId}`;
  const ipKey = ip;

  const entry = rateLimits.get(key);
  if (entry) {
    entry.sessionMessages++;
  }

  const ipEntry = rateLimits.get(ipKey);
  if (ipEntry) {
    ipEntry.dailyMessages++;
  }
}

// Dialect-specific instructions
const DIALECT_INSTRUCTIONS: Record<string, string> = {
  gulf: `## لهجة الرد
أنت تتحدث باللهجة الخليجية (السعودية/الإماراتية). استخدم العبارات التالية:
- "شلونك" بدلاً من "كيف حالك"
- "وش تبي" بدلاً من "ماذا تريد"
- "إن شاء الله" و "الله يعطيك العافية"
- "حياك الله" للترحيب
- "أبي" بدلاً من "أريد"
- "وين" بدلاً من "أين"
- "شنو/شنهو" بدلاً من "ماذا"`,

  egyptian: `## لهجة الرد
أنت تتحدث باللهجة المصرية. استخدم العبارات التالية:
- "إزيك" بدلاً من "كيف حالك"
- "عايز إيه" بدلاً من "ماذا تريد"
- "تمام" و "حاضر"
- "أهلاً وسهلاً" للترحيب
- "عايز" بدلاً من "أريد"
- "فين" بدلاً من "أين"
- "إيه" بدلاً من "ماذا"`,

  levantine: `## لهجة الرد
أنت تتحدث باللهجة الشامية (اللبنانية/السورية). استخدم العبارات التالية:
- "كيفك" بدلاً من "كيف حالك"
- "شو بدك" بدلاً من "ماذا تريد"
- "إن شاء الله" و "الله يعطيك العافية"
- "أهلين" للترحيب
- "بدي" بدلاً من "أريد"
- "وين" بدلاً من "أين"
- "شو" بدلاً من "ماذا"`,

  msa: `## لهجة الرد
أنت تتحدث بالعربية الفصحى الحديثة. استخدم لغة رسمية ومهذبة:
- استخدم "كيف حالك" و "ماذا تريد"
- كن رسمياً ومهنياً
- استخدم "أهلاً وسهلاً" للترحيب`,
};

// System prompt for chat
function buildDemoSystemPrompt(dialect: string = 'msa'): string {
  const dialectInstruction = DIALECT_INSTRUCTIONS[dialect] || DIALECT_INSTRUCTIONS.msa;

  return `أنت تمثل مستشفى توافد وتساعد في حجز المواعيد الطبية.
تساعد المرضى في فهم الخدمات المتاحة والعثور على الأطباء المناسبين والإجابة على استفساراتهم.

${dialectInstruction}

## الأقسام المتاحة
- الطب العام
- طب الأطفال
- طب الأسنان
- طب العيون
- الجلدية والتجميل
- العظام والمفاصل
- القلب والأوعية الدموية
- الأنف والأذن والحنجرة
- النساء والولادة
- الباطنية
- المسالك البولية
- العلاج الطبيعي

## الموقع
- مستشفى توافد، الرياض
  العنوان: 123 طريق الملك فهد، الرياض

## الخدمات المتاحة

### الطب العام
- الكشف العام (30 دقيقة) - 150 ريال
- التطعيم (15 دقيقة) - 100 ريال
- زيارة متابعة (15 دقيقة) - 100 ريال
- الفحص الشامل (60 دقيقة) - 500 ريال

### طب الأطفال
- استشارة أطفال (30 دقيقة) - 200 ريال
- تطعيمات الأطفال (15 دقيقة) - 150 ريال
- فحص النمو والتطور (45 دقيقة) - 300 ريال

### طب الأسنان
- تنظيف الأسنان (45 دقيقة) - 200 ريال
- تقويم الأسنان - استشارة (30 دقيقة) - 300 ريال
- حشو الأسنان (30 دقيقة) - 250 ريال
- خلع الأسنان (30 دقيقة) - 200 ريال
- تبييض الأسنان (60 دقيقة) - 800 ريال
- زراعة الأسنان - استشارة (45 دقيقة) - 500 ريال

### طب العيون
- فحص النظر (30 دقيقة) - 150 ريال
- فحص قاع العين (30 دقيقة) - 200 ريال
- استشارة الليزك (45 دقيقة) - 300 ريال
- علاج جفاف العين (20 دقيقة) - 150 ريال

### الجلدية والتجميل
- استشارة جلدية (30 دقيقة) - 200 ريال
- علاج حب الشباب (30 دقيقة) - 250 ريال
- البوتوكس (30 دقيقة) - 1500 ريال
- الفيلر (45 دقيقة) - 2000 ريال
- إزالة الشعر بالليزر (30 دقيقة) - 500 ريال
- علاج التصبغات (30 دقيقة) - 400 ريال

### العظام والمفاصل
- استشارة عظام (30 دقيقة) - 250 ريال
- علاج آلام الظهر (30 دقيقة) - 300 ريال
- علاج الإصابات الرياضية (45 دقيقة) - 350 ريال
- حقن المفاصل (30 دقيقة) - 500 ريال

### القلب والأوعية الدموية
- استشارة قلب (30 دقيقة) - 300 ريال
- تخطيط القلب (20 دقيقة) - 150 ريال
- إيكو القلب (45 دقيقة) - 400 ريال
- فحص الشرايين (30 دقيقة) - 350 ريال

### الأنف والأذن والحنجرة
- استشارة أنف وأذن (30 دقيقة) - 200 ريال
- فحص السمع (30 دقيقة) - 200 ريال
- علاج الجيوب الأنفية (30 دقيقة) - 250 ريال
- تنظيف الأذن (15 دقيقة) - 100 ريال

### النساء والولادة
- استشارة نسائية (30 دقيقة) - 250 ريال
- متابعة الحمل (30 دقيقة) - 200 ريال
- السونار (30 دقيقة) - 300 ريال
- فحص ما قبل الزواج (45 دقيقة) - 400 ريال

### الباطنية
- استشارة باطنية (30 دقيقة) - 250 ريال
- علاج السكري (30 دقيقة) - 200 ريال
- علاج الضغط (30 دقيقة) - 200 ريال
- فحص الغدة الدرقية (30 دقيقة) - 250 ريال

### المسالك البولية
- استشارة مسالك (30 دقيقة) - 250 ريال
- فحص البروستاتا (30 دقيقة) - 300 ريال
- علاج حصوات الكلى (45 دقيقة) - 400 ريال

### العلاج الطبيعي
- جلسة علاج طبيعي (45 دقيقة) - 200 ريال
- تأهيل ما بعد العمليات (60 دقيقة) - 300 ريال
- علاج آلام الرقبة والظهر (45 دقيقة) - 250 ريال

## الأطباء

### الطب العام
- د. أحمد الراشد - متاح: الأحد-الأربعاء 9:00-17:00، الخميس 9:00-13:00
- د. سارة القحطاني - متاح: الأحد-الأربعاء 14:00-20:00

### طب الأطفال
- د. محمد الحربي - متاح: الأحد-الثلاثاء 9:00-14:00، الخميس 9:00-14:00
- د. نورة العتيبي - متاح: الأحد-الأربعاء 16:00-21:00

### طب الأسنان
- د. فاطمة الدوسري - متاح: الأحد، الاثنين، الأربعاء 10:00-18:00
- د. خالد المالكي - متاح: الأحد-الخميس 9:00-15:00
- د. ريم الشمري - أخصائية تقويم - متاح: الاثنين، الأربعاء 14:00-20:00

### طب العيون
- د. عبدالله السبيعي - متاح: الأحد-الأربعاء 9:00-17:00
- د. منى الغامدي - متاح: الأحد، الثلاثاء، الخميس 10:00-18:00

### الجلدية والتجميل
- د. لينا الزهراني - متاح: الأحد-الأربعاء 10:00-18:00
- د. فيصل العمري - متاح: الاثنين-الخميس 14:00-21:00

### العظام والمفاصل
- د. سلطان الشهري - متاح: الأحد-الأربعاء 9:00-17:00
- د. هند القرني - متاح: الأحد، الثلاثاء، الخميس 14:00-20:00

### القلب والأوعية الدموية
- د. ماجد الدوسري - استشاري قلب - متاح: الأحد-الأربعاء 9:00-15:00
- د. عائشة البلوي - متاح: الاثنين، الأربعاء، الخميس 16:00-21:00

### الأنف والأذن والحنجرة
- د. طارق الحربي - متاح: الأحد-الخميس 9:00-17:00

### النساء والولادة
- د. سمية الرشيد - متاح: الأحد-الأربعاء 9:00-17:00
- د. هدى المطيري - متاح: الأحد-الخميس 14:00-21:00

### الباطنية
- د. ناصر العنزي - متاح: الأحد-الأربعاء 9:00-17:00
- د. أمل الخالدي - متاح: الأحد، الثلاثاء، الخميس 14:00-20:00

### المسالك البولية
- د. بندر الحارثي - متاح: الأحد-الأربعاء 10:00-18:00

### العلاج الطبيعي
- أ. سعود الفهد - متاح: الأحد-الخميس 9:00-21:00
- أ. رنا السالم - متاح: الأحد-الأربعاء 10:00-18:00

## إرشادات مهمة جداً
- كن ودوداً ومهنياً
- قدم معلومات دقيقة بناءً على البيانات أعلاه
- اجعل ردودك مختصرة ومفيدة
- لا تختلق معلومات غير موجودة أعلاه

## قواعد الرد (مهم جداً):
1. إذا قال المستخدم "السلام عليكم" أو "مرحبا" فقط بدون طلب: رد بـ "وعليكم السلام، كيف أقدر أساعدك؟ هل تريد حجز موعد؟"
2. إذا طلب المستخدم خدمة أو سأل سؤال: أجب مباشرة على طلبه. مثال:
   - "ابي تقويم" -> "نعم عندنا خدمة تقويم الأسنان مع د. ريم الشمري. تبي أحجز لك موعد؟"
   - "عندكم عيون؟" -> "نعم عندنا قسم طب العيون. عندنا فحص النظر وفحص قاع العين واستشارة الليزك."
3. ممنوع تسأل "شلونك" أو "كيف حالك" - أجب مباشرة على الطلب
4. ممنوع تقول "وعليكم السلام" إلا إذا قال المستخدم "السلام عليكم"
`;
}

export default async function demoChatRoutes(app: FastifyInstance) {
  // No authentication hook - this is public

  /**
   * POST /api/demo-chat/message
   * Send a demo message and get AI response
   */
  app.post('/message', async (request: FastifyRequest) => {
    const body = sendMessageSchema.parse(request.body);
    const clientIP = getClientIP(request);

    // Check rate limit
    const rateCheck = checkRateLimit(clientIP, body.sessionId);
    if (!rateCheck.allowed) {
      return {
        error: 'rate_limit',
        message: rateCheck.reason,
        limitReached: true,
      };
    }

    // Build conversation history for LLM
    const history: ChatMessage[] = (body.conversationHistory || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add current user message
    history.push({ role: 'user', content: body.message });

    try {
      // Build dialect-specific system prompt
      const systemPrompt = buildDemoSystemPrompt(body.dialect || 'msa');

      // Get LLM response
      const llmService = getLLMService();
      const response = await llmService.chat(history, systemPrompt);

      // Increment rate limit counter
      incrementRateLimit(clientIP, body.sessionId);

      // Get remaining messages
      const entry = rateLimits.get(`${clientIP}:${body.sessionId}`);
      const remaining = entry ? MAX_MESSAGES_PER_SESSION - entry.sessionMessages : MAX_MESSAGES_PER_SESSION;

      return {
        response,
        sessionId: body.sessionId,
        remainingMessages: remaining,
      };
    } catch (error) {
      app.log.error(`Demo chat error: ${error}`);
      return {
        error: 'ai_error',
        message: 'Sorry, I encountered an error. Please try again.',
      };
    }
  });

  /**
   * POST /api/demo-chat/new
   * Start a new demo session (just validates and returns session info)
   */
  app.post('/new', async (request: FastifyRequest) => {
    const body = newSessionSchema.parse(request.body);
    const clientIP = getClientIP(request);

    // Reset session message count for this new session
    const key = `${clientIP}:${body.sessionId}`;
    rateLimits.set(key, {
      sessionMessages: 0,
      dailyMessages: rateLimits.get(clientIP)?.dailyMessages || 0,
      lastReset: Date.now(),
    });

    return {
      sessionId: body.sessionId,
      remainingMessages: MAX_MESSAGES_PER_SESSION,
    };
  });

  /**
   * GET /api/demo-chat/health
   * Check if demo chat service is available
   */
  app.get('/health', async () => {
    const llmConfigured = !!process.env.OPENAI_API_KEY;

    return {
      status: llmConfigured ? 'ok' : 'degraded',
      llmConfigured,
    };
  });
}
