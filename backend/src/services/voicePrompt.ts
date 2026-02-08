import { PrismaClient } from '@prisma/client';
import { ArabicDialect } from '../types/voice.js';

// Days of week in Arabic
const DAYS_OF_WEEK_AR: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

// Dialect-specific instructions and phrases
const DIALECT_INSTRUCTIONS: Record<ArabicDialect, string> = {
  gulf: `## تعليمات اللهجة
- استخدم اللهجة الخليجية في الردود
- استخدم عبارات مثل: إن شاء الله، زين، حياك الله، تفضل
- خاطب المتصل بشكل رسمي ومحترم
- كن ودوداً ومضيافاً في أسلوبك
- أمثلة على العبارات:
  - "شلونك؟ كيف أقدر أساعدك اليوم؟"
  - "تمام، خلني أشوف المواعيد المتاحة"
  - "إن شاء الله، موعدك مؤكد"`,

  egyptian: `## تعليمات اللهجة
- استخدم اللهجة المصرية في الردود
- استخدم عبارات مثل: تمام، ماشي، إن شاء الله، أهلاً
- كن ودوداً وقريباً في أسلوبك
- أمثلة على العبارات:
  - "أهلاً بيك، إزيك؟ عايز تحجز موعد؟"
  - "تمام، خليني أشوف المواعيد"
  - "كده تمام، الموعد اتأكد"`,

  levantine: `## تعليمات اللهجة
- استخدم اللهجة الشامية في الردود
- استخدم عبارات مثل: منيح، هلق، إن شاء الله، أهلين
- كن مهذباً ولطيفاً في أسلوبك
- أمثلة على العبارات:
  - "أهلين، كيفك؟ شو بتحب تساعدك؟"
  - "منيح، خليني شوف المواعيد"
  - "تمام هيك، موعدك مأكد"`,

  msa: `## تعليمات اللغة
- استخدم اللغة العربية الفصحى الواضحة
- كن مهنياً ورسمياً في أسلوبك
- تجنب العبارات العامية
- أمثلة على العبارات:
  - "أهلاً وسهلاً، كيف يمكنني مساعدتك اليوم؟"
  - "حسناً، دعني أتحقق من المواعيد المتاحة"
  - "تم تأكيد موعدك بنجاح"`,
};

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

/**
 * Build a voice-optimized system prompt for phone conversations
 * Shorter, more conversational, with dialect-specific instructions
 */
export async function buildVoiceSystemPrompt(
  prisma: PrismaClient,
  orgId: string,
  dialect: ArabicDialect = 'msa'
): Promise<string> {
  // Fetch org info
  const org = await prisma.org.findUnique({
    where: { orgId },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  // Fetch all data in parallel for performance
  const [departments, facilities, providers, services] = await Promise.all([
    prisma.department.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    prisma.facility.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    prisma.provider.findMany({
      where: { orgId, active: true },
      include: {
        department: true,
        services: { include: { service: true } },
        availabilityRules: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { displayName: 'asc' },
    }),
    prisma.service.findMany({ where: { orgId, active: true }, orderBy: { name: 'asc' } }),
  ]);

  // Build voice-optimized prompt
  let prompt = `أنت مساعد ذكي لحجز المواعيد الطبية في ${org.name}.
أنت تتحدث مع المتصل عبر الهاتف.

## قواعد المحادثة الصوتية
- اجعل ردودك قصيرة ومباشرة (جملة إلى جملتين كحد أقصى)
- تحدث بشكل طبيعي كما في المكالمات الهاتفية
- أكد المعلومات بتكرارها للمتصل
- استخدم عبارات الإقرار: "تمام"، "حسناً"، "إن شاء الله"
- إذا قاطعك المتصل، توقف واستمع
- عند سرد الخيارات، اذكر 3 خيارات كحد أقصى في المرة الواحدة

${DIALECT_INSTRUCTIONS[dialect]}

## خطوات المحادثة
1. رحب بالمتصل واسأل كيف يمكنك مساعدته
2. حدد حاجة المتصل (حجز، إلغاء، تغيير موعد، استفسار)
3. اجمع المعلومات المطلوبة خطوة بخطوة:
   - نوع الخدمة
   - الطبيب المفضل (إن وجد)
   - التاريخ والوقت المفضل
   - اسم المريض ورقم الجوال
4. أكد جميع التفاصيل قبل الحجز
5. قدم التأكيد وودع المتصل بلطف

## قواعد مهمة
- لا تختلق مواعيد غير موجودة في البيانات
- إذا لم تكن متأكداً، اطرح أسئلة توضيحية
- للحالات الطبية الطارئة، انصح بالذهاب للطوارئ
- حافظ على خصوصية المريض

`;

  // Add services (brief for voice)
  if (services.length > 0) {
    prompt += `## الخدمات المتاحة\n`;
    services.forEach(s => {
      prompt += `- ${s.name} (${s.durationMin} دقيقة)\n`;
    });
    prompt += `\n`;
  }

  // Add providers (brief for voice)
  if (providers.length > 0) {
    prompt += `## الأطباء\n`;
    providers.forEach(p => {
      const servicesStr = p.services.map(ps => ps.service.name).join('، ');
      let info = `- ${p.displayName}`;
      if (p.credentials) info += ` (${p.credentials})`;
      if (servicesStr) info += `: ${servicesStr}`;
      prompt += info + `\n`;

      // Add availability in Arabic
      if (p.availabilityRules.length > 0) {
        const availabilityByDay: Record<number, string[]> = {};
        p.availabilityRules.forEach(rule => {
          if (!availabilityByDay[rule.dayOfWeek]) {
            availabilityByDay[rule.dayOfWeek] = [];
          }
          availabilityByDay[rule.dayOfWeek].push(`${formatTime(rule.startLocal)}-${formatTime(rule.endLocal)}`);
        });

        const days = Object.entries(availabilityByDay)
          .map(([day, times]) => `${DAYS_OF_WEEK_AR[parseInt(day)]}: ${times.join('، ')}`)
          .join(' | ');
        prompt += `  متاح: ${days}\n`;
      }
    });
    prompt += `\n`;
  }

  // Add facilities
  if (facilities.length > 0) {
    prompt += `## الفروع\n`;
    facilities.forEach(f => {
      let info = `- ${f.name}`;
      if (f.city) info += ` في ${f.city}`;
      prompt += info + `\n`;
    });
    prompt += `\n`;
  }

  return prompt;
}

/**
 * Get a greeting message based on dialect
 */
export function getGreetingMessage(dialect: ArabicDialect, orgName: string): string {
  switch (dialect) {
    case 'gulf':
      return `السلام عليكم، حياك الله في ${orgName}. كيف أقدر أساعدك اليوم؟`;
    case 'egyptian':
      return `أهلاً وسهلاً في ${orgName}. إزيك؟ عايز تحجز موعد ولا عندك استفسار؟`;
    case 'levantine':
      return `أهلين فيك في ${orgName}. كيفك؟ شو بتحب أساعدك؟`;
    case 'msa':
    default:
      return `أهلاً وسهلاً بك في ${orgName}. كيف يمكنني مساعدتك اليوم؟`;
  }
}

/**
 * Get a goodbye message based on dialect
 */
export function getGoodbyeMessage(dialect: ArabicDialect): string {
  switch (dialect) {
    case 'gulf':
      return 'شكراً لك، الله يعطيك العافية. في أمان الله!';
    case 'egyptian':
      return 'شكراً ليك، سلام!';
    case 'levantine':
      return 'شكراً كتير، الله معك!';
    case 'msa':
    default:
      return 'شكراً لاتصالك. مع السلامة!';
  }
}

/**
 * Get a "please repeat" message based on dialect
 */
export function getRepeatMessage(dialect: ArabicDialect): string {
  switch (dialect) {
    case 'gulf':
      return 'عذراً، ما فهمت. ممكن تعيد؟';
    case 'egyptian':
      return 'معلش، ما فهمتش. ممكن تقول تاني؟';
    case 'levantine':
      return 'عفواً، ما فهمت منيح. فيك تعيد؟';
    case 'msa':
    default:
      return 'عذراً، لم أفهم. هل يمكنك الإعادة؟';
  }
}

/**
 * Get a fallback error message based on dialect
 */
export function getErrorMessage(dialect: ArabicDialect): string {
  switch (dialect) {
    case 'gulf':
      return 'عذراً، صار عندنا مشكلة تقنية. ممكن تتصل مرة ثانية؟';
    case 'egyptian':
      return 'معلش، في مشكلة تقنية. ممكن تتصل تاني؟';
    case 'levantine':
      return 'عفواً، صار في مشكلة. فيك تتصل بعدين؟';
    case 'msa':
    default:
      return 'عذراً، حدثت مشكلة تقنية. يرجى الاتصال مرة أخرى.';
  }
}
