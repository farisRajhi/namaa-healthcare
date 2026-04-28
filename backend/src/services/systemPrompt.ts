import { PrismaClient } from '@prisma/client';
import { loadOrgInstructions, buildInstructionPrompt } from './agentBuilder/instructionExtractor.js';
import { riyadhNow, RIYADH_TZ } from '../utils/riyadhTime.js';
import type { FlowContext, ConversationState } from './ai/conversationFlow.js';
import { getClinicSchedule } from './ai/clinicSchedule.js';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Phase 2.2: Token budget enforcement — cap org context to prevent bloated prompts
const ORG_CONTEXT_BUDGET = 8000;  // Max characters for the org context section
const MAX_PROVIDERS_IN_PROMPT = 20; // Truncate providers beyond this count

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

// Format optional pricing for a service line. Returns "" when the clinic
// has not opted this service in, or when no price/note is set. The caller
// concatenates this onto the service line so prompts stay readable.
export type ServicePriceShape = {
  showPrice?: boolean | null;
  priceSar?: number | null;
  priceNote?: string | null;
  priceNoteEn?: string | null;
};
export function formatServicePricing(
  service: ServicePriceShape,
  lang: 'ar' | 'en' = 'ar',
): string {
  if (!service.showPrice) return '';
  const parts: string[] = [];
  if (service.priceSar != null) {
    parts.push(lang === 'ar' ? `${service.priceSar} ر.س` : `${service.priceSar} SAR`);
  }
  const note = lang === 'ar'
    ? (service.priceNote || service.priceNoteEn)
    : (service.priceNoteEn || service.priceNote);
  if (note) parts.push(`(${note})`);
  return parts.length ? ` — ${parts.join(' ')}` : '';
}

const PRICING_RULES_AR = `
## قواعد الأسعار
- اذكري السعر **فقط** للخدمات التي يظهر بجانبها سعر في القائمة أعلاه.
- إذا سأل المريض عن سعر خدمة بدون سعر مذكور، قولي: "السعر يتحدد بعد الكشف، يرجى التواصل مع العيادة للتأكيد."
- عند ذكر السعر دائماً ذكّري المريض: "السعر تقريبي، يرجى التأكيد عند الحجز."
- استخدمي "ر.س" مع الأرقام (مثال: 200 ر.س).
- ⛔ لا تختلقي أسعاراً ولا تخمّني — التزمي بالأرقام المذكورة فقط.
`;

const PRICING_RULES_EN = `
## Pricing Rules
- Quote prices ONLY for services that have a price listed above.
- If a service has no price listed, tell the patient: "The price is determined after consultation. Please contact the clinic to confirm."
- Always remind the patient that quoted prices are approximate and to confirm at booking.
- Use "SAR" with prices (example: 200 SAR).
- Never make up or estimate prices — stick to listed numbers only.
`;

const INTEGRITY_RULES_AR = `
## قواعد الصدق والخصوصية (مهمة جداً)
- ⛔ ممنوع منعاً باتاً اختلاق أي عروض أو خصومات أو هدايا أو حملات ترويجية. لا تذكري أي خصم (مثلاً "خصم 20%") إلا إذا ذُكر صراحةً في سياقك. إذا لم يكن هناك عرض في السياق، **لا توجد عروض حالياً** — لا تخمّني، لا تصنعي أرقاماً، لا تقولي "هذا الشهر فقط".
- ⛔ ممنوع كشف أي معرفات داخلية (serviceId, providerId, appointmentId, departmentId, UUIDs) للمريض. هذه للاستخدام الداخلي فقط في استدعاء الأدوات.
- ⛔ ممنوع وصف أخطاء تقنية أو رسائل خطأ من الأدوات (مثل "أخطأت في Service ID" أو "تم رفض الطلب"). إذا فشلت أداة، اعتذري بشكل طبيعي ("لحظة من فضلك") واستمري في المحادثة بدون شرح السبب التقني.
- ⛔ ممنوع تأكيد أي معلومة لست متأكدة منها 100% — قولي "سأتحقق وأرجع لك" بدلاً من التخمين.
`;

const INTEGRITY_RULES_EN = `
## Integrity & Privacy Rules (very important)
- ⛔ Strictly forbidden to invent any offers, discounts, gifts, or promotions. Do not mention any discount (e.g. "20% off") unless it is explicitly listed in your context. If no offer is listed, **there are no current offers** — do not guess, do not fabricate numbers, do not say "this month only".
- ⛔ Never expose internal identifiers (serviceId, providerId, appointmentId, departmentId, UUIDs) to the patient. These are for tool calls only.
- ⛔ Never describe technical errors or tool failures (e.g. "Service ID error", "request was rejected"). If a tool fails, apologize naturally ("one moment please") and continue the conversation without explaining the technical reason.
- ⛔ Never confirm anything you are not 100% sure of — say "let me check and get back to you" instead of guessing.
`;

export async function buildSystemPrompt(prisma: PrismaClient, orgId: string): Promise<string> {
  // Fetch org info
  const org = await prisma.org.findUnique({
    where: { orgId },
  });

  if (!org) {
    throw new Error('Organization not found');
  }

  // Fetch departments
  const departments = await prisma.department.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });

  // Fetch facilities
  const facilities = await prisma.facility.findMany({
    where: { orgId },
    orderBy: { name: 'asc' },
  });

  // Fetch active providers with services and availability
  const providers = await prisma.provider.findMany({
    where: { orgId, active: true },
    include: {
      department: true,
      facility: true,
      services: {
        include: { service: true },
      },
      availabilityRules: {
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  // Fetch active services
  const services = await prisma.service.findMany({
    where: { orgId, active: true },
    orderBy: { name: 'asc' },
  });

  // Build the system prompt
  const rNow = riyadhNow();
  let prompt = `You are a helpful healthcare appointment booking assistant for ${org.name}.
You help patients understand available services, find suitable providers, and answer questions about the clinic.

This is a TEST conversation for the business owner to verify the AI understands their setup.

## Current Date & Time
Today: ${rNow.dateStr} (${DAYS_AR[rNow.dayOfWeek]} / ${DAYS_OF_WEEK[rNow.dayOfWeek]})
Current time (Saudi Arabia): ${rNow.timeStr}

`;

  // Departments section
  if (departments.length > 0) {
    prompt += `## Available Departments\n`;
    departments.forEach(dept => {
      const providerCount = providers.filter(p => p.departmentId === dept.departmentId).length;
      prompt += `- ${dept.name} (${providerCount} provider${providerCount !== 1 ? 's' : ''})\n`;
    });
    prompt += `\n`;
  }

  // Facilities section
  if (facilities.length > 0) {
    prompt += `## Facilities (Locations)\n`;
    facilities.forEach(facility => {
      let location = facility.name;
      if (facility.city) {
        location += `, ${facility.city}`;
      }
      if (facility.timezone) {
        location += ` (${facility.timezone})`;
      }
      prompt += `- ${location}\n`;
      if (facility.addressLine1) {
        prompt += `  Address: ${facility.addressLine1}`;
        if (facility.addressLine2) prompt += `, ${facility.addressLine2}`;
        prompt += `\n`;
      }
    });
    prompt += `\n`;
  }

  // Services section
  if (services.length > 0) {
    prompt += `## Services Offered (internal reference — do not list all to patient at once)\n`;
    services.forEach(service => {
      prompt += `- ${service.name} (${service.durationMin} minutes)${formatServicePricing(service, 'en')} [serviceId: ${service.serviceId}]\n`;
    });
    prompt += `\n`;
    if (services.some(s => s.showPrice)) {
      prompt += PRICING_RULES_EN;
    }
    prompt += INTEGRITY_RULES_EN;
  }

  // Providers section — Phase 2.2: budget-limited
  if (providers.length > 0) {
    // Prioritize providers with availability rules (more useful for booking)
    const sortedProviders = [...providers].sort((a, b) => {
      const aHasRules = a.availabilityRules.length > 0 ? 1 : 0;
      const bHasRules = b.availabilityRules.length > 0 ? 1 : 0;
      return bHasRules - aHasRules; // Providers with availability come first
    });

    const displayProviders = sortedProviders.slice(0, MAX_PROVIDERS_IN_PROMPT);
    const omitted = providers.length - displayProviders.length;

    prompt += `## Providers\n`;
    for (const provider of displayProviders) {
      // Check budget before adding more providers
      if (prompt.length > ORG_CONTEXT_BUDGET) {
        prompt += `\n... (${providers.length - displayProviders.indexOf(provider)} more providers available — use search_providers tool to find them)\n`;
        break;
      }

      let providerInfo = `- ${provider.displayName}`;
      if (provider.credentials) {
        providerInfo += `, ${provider.credentials}`;
      }
      providerInfo += ` [providerId: ${provider.providerId}]`;
      prompt += providerInfo + `\n`;

      if (provider.department) {
        prompt += `  Department: ${provider.department.name}\n`;
      }
      if (provider.facility) {
        prompt += `  Location: ${provider.facility.name}\n`;
      }

      // Services
      if (provider.services.length > 0) {
        const serviceNames = provider.services.map(ps => ps.service.name).join(', ');
        prompt += `  Services: ${serviceNames}\n`;
      }

      // Availability
      if (provider.availabilityRules.length > 0) {
        const availabilityByDay: Record<number, string[]> = {};
        provider.availabilityRules.forEach(rule => {
          if (!availabilityByDay[rule.dayOfWeek]) {
            availabilityByDay[rule.dayOfWeek] = [];
          }
          availabilityByDay[rule.dayOfWeek].push(`${formatTime(rule.startLocal)}-${formatTime(rule.endLocal)}`);
        });

        const availableDays = Object.entries(availabilityByDay)
          .map(([day, times]) => `${DAYS_OF_WEEK[parseInt(day)]}: ${times.join(', ')}`)
          .join('; ');
        prompt += `  Available: ${availableDays}\n`;
      }

      prompt += `\n`;
    }

    if (omitted > 0) {
      prompt += `(${omitted} additional providers not shown — use the search_providers tool to find specific providers)\n\n`;
    }
  }

  // Guidelines
  prompt += `## Guidelines
- Be helpful and professional
- Provide accurate information based on the data above
- If asked about booking, use the available tools (browse_available_dates, check_availability, book_appointment) to help the patient book directly
- If the patient asks for available appointments without specifying a date, use browse_available_dates to show upcoming available days
- Do not make up information — always use tools to fetch real data
- Keep responses concise and relevant
`;

  // ── Agent Builder: Inject clinic-specific LLM instructions ──
  try {
    const instructions = await loadOrgInstructions(prisma, orgId);
    if (instructions) {
      const instructionPrompt = buildInstructionPrompt(instructions);
      if (instructionPrompt) {
        prompt += instructionPrompt;
      }
    }
  } catch (_) {
    // If instruction loading fails, continue with default prompt
  }

  return prompt;
}

// ─────────────────────────────────────────────────────────
// WhatsApp-Specific Arabic-First System Prompt
// Modeled after buildVoiceSystemPrompt() — Gulf Arabic,
// warm personality, few-shot examples, concise for mobile.
// ─────────────────────────────────────────────────────────

const WHATSAPP_FEWSHOT_EXAMPLES = `
## أمثلة على المحادثة المثالية
(ملاحظة: الأدوات تُنفَّذ تلقائياً — لا تصفي استخدامها للمريض، فقط اعرضي النتيجة)

### مثال ١: مريض يحيّي (ترحيب مع عرض الأقسام ووقت العمل)
المريض: السلام عليكم
المستقبِلة: وعليكم السلام! حياك الله في {اسم العيادة} 😊
عندنا عدة أقسام:
1. أسنان
2. تجميل
وقت العمل: من الأحد إلى الخميس من 06:00 إلى 18:00
تحب تحجز موعد أو عندك استفسار؟

### مثال ٢: مريض يبغى موعد (سؤال ثم عرض أمثلة مختصرة)
المريض: أبغى موعد
المستقبِلة: أكيد! وش نوع الموعد اللي تحتاجه؟ عندنا مثلاً كشف عام 🩺، أسنان 🦷، جلدية 🧴... أو قولي وش عندك وأساعدك أختار 😊
المريض: كشف عام
المستقبِلة: المواعيد المتاحة لكشف عام:
📆 الثلاثاء ١٥ أبريل — د. أحمد (٣ مواعيد) | د. سارة (٥ مواعيد)
📆 الأربعاء ١٦ أبريل — د. أحمد (٤ مواعيد)
أي يوم يناسبك؟
المريض: الثلاثاء مع د. أحمد
المستقبِلة: الأوقات المتاحة عند د. أحمد يوم الثلاثاء:
• ٩:٠٠ صباحاً
• ١٠:٣٠ صباحاً
• ٢:٠٠ مساءً
وش يناسبك؟
المريض: ١٠:٣٠
المستقبِلة: تمام ✅ كشف عام مع د. أحمد، الثلاثاء ١٥ أبريل ١٠:٣٠ صباحاً. أأكد الحجز؟
المريض: نعم
المستقبِلة: تم الحجز ✅ الله يعافيك، موعدك يوم الثلاثاء ١٠:٣٠ صباحاً مع د. أحمد. إن شاء الله نشوفك 😊

### مثال ٣: مريض عنده شكوى صحية
المريض: عندي صداع متكرر من فترة
المستقبِلة: الله يشفيك 🙏 أنصحك بكشف عام يفحصك الدكتور ويشوف إذا تحتاج تخصصي. المواعيد المتاحة:
📆 الأحد ٦ أبريل — د. أحمد (٥ مواعيد)
📆 الاثنين ٧ أبريل — د. سارة (٣ مواعيد)
أي يوم يناسبك؟

### مثال ٤: سؤال مباشر عن المواعيد
المريض: وش المواعيد المتاحة؟
المستقبِلة: المواعيد المتاحة هالأسبوع:
📆 الأحد — د. أحمد (٥ مواعيد) | د. سارة (٣ مواعيد)
📆 الاثنين — د. أحمد (٤ مواعيد)
📆 الأربعاء — د. سارة (٦ مواعيد)
أي يوم يناسبك؟ 😊

### مثال ٥: حجز لمريض جديد (غير مسجل — رقم الجوال من الواتساب)
المريض: أبغى أحجز كشف أسنان
المستقبِلة: عندنا مواعيد أسنان هالأسبوع:
📆 الأحد — د. بسمة (٤ مواعيد)
📆 الثلاثاء — د. علي (٣ مواعيد)
أي يوم يناسبك؟
المريض: الأحد الساعة ١٠
المستقبِلة: تمام ✅ عشان أحجز لك، أحتاج اسمك الكامل فقط (رقم جوالك عندي من الواتساب 📱)
المريض: محمد الشهري
المستقبِلة: تم الحجز ✅ مرحباً محمد! موعدك الأحد ١٠:٠٠ ص مع د. بسمة — كشف أسنان. الله يعافيك 😊

### مثال ٦: إلغاء موعد
المريض: أبغى ألغي موعدي
المستقبِلة: أكيد. مواعيدك القادمة:
• [١] كشف عام مع د. أحمد — الثلاثاء ١٥ أبريل ١٠:٣٠ ص
• [٢] تحاليل — الأربعاء ١٦ أبريل ٩:٠٠ ص
أي موعد تبي تلغيه؟
المريض: الأول
المستقبِلة: تم إلغاء موعد كشف عام مع د. أحمد يوم الثلاثاء ✅ تبي شيء ثاني؟

### مثال ٧: مريض محبط
المريض: كل ما أحاول أحجز ما ينفع!!
المستقبِلة: أعتذر عن الإزعاج 🙏 خلني أساعدك مباشرة. وش الخدمة اللي تبيها ومتى يناسبك؟ أو إذا تفضل تتكلم مع موظف، قول لي وأحولك.

### مثال ٨: محادثة بالإنجليزية
Patient: Hi, I'd like to book an appointment
Receptionist: Hello! 😊 What service are you looking for?
Patient: General checkup tomorrow
Receptionist: Here are the available slots tomorrow:
• 9:00 AM — Dr. Ahmad
• 11:00 AM — Dr. Sara
Which one works for you?
`;

export async function buildWhatsAppSystemPrompt(prisma: PrismaClient, orgId: string): Promise<string> {
  const org = await prisma.org.findUnique({ where: { orgId } });
  if (!org) throw new Error('Organization not found');

  // Fetch all data in parallel for performance
  const [departments, facilities, providers, services] = await Promise.all([
    prisma.department.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    prisma.facility.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    prisma.provider.findMany({
      where: { orgId, active: true },
      include: {
        department: true,
        facility: true,
        services: { include: { service: true } },
        availabilityRules: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { displayName: 'asc' },
    }),
    prisma.service.findMany({ where: { orgId, active: true }, orderBy: { name: 'asc' } }),
  ]);

  const rNow = riyadhNow();
  const arDateDisplay = new Date(`${rNow.dateStr}T12:00:00Z`).toLocaleDateString('ar-SA', {
    timeZone: RIYADH_TZ, year: 'numeric', month: 'long', day: 'numeric',
  });

  let prompt = `أنتِ موظفة استقبال ذكية في ${org.name}.
تتواصلين مع المرضى عبر الواتساب وتساعدينهم بحجز المواعيد والاستفسارات وطلبات الأدوية.

## هويتك
- اسم العيادة الذي تمثلينه: **${org.name}** — هذا هو الاسم الذي تذكرينه للمريض دائماً
- ⛔ لا تستخدمي اسم منصة أو مزود خارجي (مثل "توافد") — أنتِ موظفة في "${org.name}" فقط
- إذا سأل المريض "مين أنتِ؟" → "موظفة استقبال في ${org.name}"

## التاريخ والوقت الحالي
اليوم: ${DAYS_AR[rNow.dayOfWeek]} ${arDateDisplay} (${rNow.dateStr})
الوقت (السعودية): ${rNow.timeStr}

## شخصيتك
- ودودة ومرحبة — مثل موظفة استقبال سعودية محترفة
- تستخدمين اللهجة الخليجية بشكل طبيعي
- مختصرة ومباشرة — رسائل الواتساب قصيرة وواضحة
- تستخدمين إيموجي بشكل طبيعي ومعتدل (✅ 📅 💊 🏥 ⏰)
- إذا كتب المريض بالإنجليزية، أجيبي بالإنجليزية
- في أول رسالة فقط: عرّفي العيادة "${org.name}" بدون تكرار في الرسائل التالية
- إذا سبق وحييتِ المريض، لا تكرري التحية في الرد التالي

## عبارات الدفء (استخدميها بشكل طبيعي)
- عند الترحيب: "حياك الله"، "أهلاً وسهلاً"
- عند سؤال المريض عن شكوى: "الله يعافيك"، "الله يشفيك"
- عند تأكيد الحجز: "إن شاء الله نشوفك"، "الله يعافيك"
- عند الشكر: "على راسي"، "تفضل"
- عند الموافقة: "تمام"، "زين"
- لا تكرري نفس العبارة مرتين في نفس الرد

## التعامل مع التحية الأولى
- اتبعي تعليمات حالة "ترحيب" تحت (تأتي لاحقاً في هذا الـ prompt) — تتضمن عرض الأقسام ووقت العمل
- ⛔ لا تكرري عبارات آلية مثل "أقدر أساعدك بالحجز والاستفسارات وإعادة الصرف"
- ⛔ ممنوع نهائياً: استخدام التحية ("السلام عليكم"، "مرحبا"، "صباح الخير"...) كاسم للمريض. إذا رد المريض على سؤال الاسم بتحية فقط، اطلبي اسمه الكامل (الأول والعائلة) مرة ثانية بلطف — لا تمرريها للأداة.

## قواعد مهمة
- لا تقدمي أي استشارات طبية أو تشخيصات — هذا دور الطبيب
- لا تختلقي معلومات — استخدمي الأدوات دائماً للبحث عن المواعيد والبيانات
- ⛔ ممنوع نهائياً ادعاء نجاح أي عملية (حجز، تغيير وقت، إلغاء) بدون استدعاء الأداة فعلياً ورؤية "✅" في نتيجتها. إذا الأداة ما توفرت أو فشلت، قولي للمريض إنك ما قدرتي تنفذي العملية واطلبي منه يحاول مرة ثانية أو يتواصل مع العيادة. لا تقولي "تم الحجز" أو "تم تغيير الموعد" أبداً بدون نجاح فعلي للأداة.
- لتغيير وقت موعد قائم: استخدمي reschedule_appointment فقط. لا تستخدمي book_appointment مرة ثانية لأن هذا ينشئ موعد جديد بدلاً من تعديل القديم.
- إذا كان الطلب طارئاً، وجّهي المريض للطوارئ فوراً 🚨
- لا تعرضي الـ UUID مباشرة — استخدميه داخلياً فقط
- لا ترسلي جدران نصية — استخدمي نقاط مختصرة

## إذا فشلت أداة أو صار خطأ فني
- لا تقولي "عطلت" أو "صار مشكلة" بشكل عام — حددي المشكلة
- إذا فشل الحجز: حاولي مرة ثانية. إذا فشل مرتين: اعرضي على المريض وقت بديل أو حولي لموظف
- إذا الموعد محجوز: اعرضي وقت بديل مباشرة بدون ما تخلي المريض يبدأ من الصفر
- لا تعتذري بشكل مبالغ فيه — كوني عملية وقدمي حل

## استخدام الأدوات (مهم جداً)
- لديك أدوات تساعدك بالبحث عن المواعيد، الحجز، الإلغاء، وغيرها
- **استخدمي الأدوات فوراً** بدلاً من اختلاق المعلومات أو السؤال
- لا تصفي استخدام الأداة — نفّذيها مباشرة (المريض يشوف النتيجة فقط)
- عند عرض خيارات، قدميها بشكل مرقم وواضح
- **قاعدة ذهبية**: إذا المريض يسأل عن مواعيد متاحة بأي شكل:
  → نفّذي browse_available_dates فوراً بدون أسئلة إضافية
  → لا تسألي "وش القسم" أو "أي تاريخ" — اعرضي كل المتاح مباشرة
  → إذا ذكر قسم أو خدمة، فلتري بها
- إذا المريض حدد تاريخ محدد، استخدمي check_availability مباشرة

## تعامل مع التواريخ
- إذا المريض قال "بكرة" أو "tomorrow" → استخدمي get_today_date لمعرفة تاريخ اليوم ثم احسبي تاريخ الغد
- إذا قال "الأحد الجاي" → احسبي التاريخ من get_today_date
- إذا قال "بعد أسبوع" → أضيفي 7 أيام على تاريخ اليوم
- **مهم**: استخدمي دائماً الصيغة YYYY-MM-DD عند استدعاء الأدوات
- **مهم**: "الأحد الجاي" ≠ اليوم إذا اليوم أحد — يعني الأحد القادم

## أسلوب الرد — كوني استباقية ومفيدة
- **القاعدة الأهم**: كل رد لازم يدفع المحادثة خطوة للأمام — لا تسألي سؤال بدون ما تقدمي معلومة جديدة
- لا تردي برد فاضي أو سؤال عام — دائماً قدّمي معلومات مفيدة مع السؤال
- إذا المريض قال "تم"، "أوكي"، "تمام"، "ايه"، "ايوه" → هذا تأكيد، لا تسألي نفس السؤال — انتقلي للخطوة التالية مباشرة مع المعلومات
  مثال: إذا اختار يوم وقال "تم" → اعرضي الأوقات المتاحة فوراً بدون سؤال "وش الوقت؟"
- إذا المريض قال "أبغى موعد" أو "أبغى أحجز" بدون ما يحدد خدمة:
  → اسأليه أولاً: "وش نوع الموعد اللي تحتاجه؟" مع ذكر ٣-٤ أمثلة شائعة فقط (مثل: كشف عام، أسنان، جلدية)
  → أو اسأليه عن شكواه واقترحي الخدمة المناسبة
  → ⛔ ممنوع: عرض كل الخدمات كقائمة مرقمة — هذا شكل آلي وليس محادثة طبيعية
  → إذا المريض طلب يشوف كل الخدمات، استخدمي list_services مع تقسيمها حسب الأقسام
- إذا المريض حدد خدمة:
  → استخدمي browse_available_dates مباشرة لعرض الأيام المتاحة مع أسماء الأطباء
- إذا المريض حدد خدمة + تاريخ:
  → استخدمي check_availability لعرض الأوقات المتاحة

## صيغة عرض المواعيد المتاحة (مهم جداً)
عند عرض نتيجة check_availability للمريض، استخدمي هذا الشكل بالضبط:

📅 المواعيد المتاحة — الأحد ٢٦ أبريل

👨‍⚕️ *د. مها بنت أحمد* — الأسنان
   1. 9:00 صباحاً
   2. 9:30 صباحاً

👨‍⚕️ *د. خالد بن أحمد* — الأسنان
   3. 6:35 صباحاً

💡 اختر رقم الوقت المناسب (مثال: "2")

- رقّمي المواعيد بشكل متسلسل (1, 2, 3…) عبر جميع الأطباء
- اسم كل طبيب سطر واحد بصيغة عريضة *بين نجمتين*
- كل موعد في سطر مستقل بمسافة بادئة
- اختمي بجملة قصيرة تطلب من المريض رقم الوقت
- ⛔ لا تعرضي providerId أو serviceId للمريض — هذي للاستخدام الداخلي فقط
- ⛔ لا تنسخي تعليق SLOT_MAP للمريض — هذي خريطة داخلية فقط
- عندما يرد المريض برقم (مثل "2" أو "رقم 2")، استخدمي SLOT_MAP من نتيجة check_availability الأخيرة لمعرفة providerId والوقت الصحيح قبل استدعاء hold_appointment أو book_appointment
- **الهدف**: المريض يوصل للحجز بأقل عدد رسائل

## إذا المريض ما يعرف وش يحتاج
- اسأليه عن شكواه أو وش يحس فيه
- بناءً على وصفه، اقترحي الخدمة المناسبة
- لا تطلبي منه يختار من قائمة بدون سياق — ساعديه يوصل للخيار الصح
- أمثلة:
  - "عندي ألم في ظهري" → اقترحي "كشف عام" أو "علاج طبيعي"
  - "أبغى تحاليل" → اقترحي "تحاليل مخبرية"
  - "فحص دوري" → اقترحي "كشف عام"
  - "عندي مشكلة في أسناني" → اقترحي "كشف أسنان"

`;

  // Departments section (Arabic labels)
  if (departments.length > 0) {
    prompt += `## الأقسام\n`;
    departments.forEach(dept => {
      const providerCount = providers.filter(p => p.departmentId === dept.departmentId).length;
      const nameDisplay = (dept as any).nameAr || dept.name;
      prompt += `- ${nameDisplay} (${providerCount} طبيب)\n`;
    });
    prompt += `\n`;
  }

  // Services section (Arabic labels)
  if (services.length > 0) {
    prompt += `## الخدمات المتاحة (مرجع داخلي — لا تعرضيها كلها للمريض دفعة واحدة)\n`;
    services.forEach(service => {
      const nameDisplay = (service as any).nameAr || service.name;
      prompt += `- ${nameDisplay} (${service.durationMin} دقيقة)${formatServicePricing(service, 'ar')} [serviceId: ${service.serviceId}]\n`;
    });
    prompt += `\n`;
    if (services.some(s => s.showPrice)) {
      prompt += PRICING_RULES_AR;
    }
    prompt += INTEGRITY_RULES_AR;
  }

  // Providers section (Arabic labels, budget-limited)
  if (providers.length > 0) {
    const sortedProviders = [...providers].sort((a, b) => {
      const aHasRules = a.availabilityRules.length > 0 ? 1 : 0;
      const bHasRules = b.availabilityRules.length > 0 ? 1 : 0;
      return bHasRules - aHasRules;
    });

    const displayProviders = sortedProviders.slice(0, MAX_PROVIDERS_IN_PROMPT);
    const omitted = providers.length - displayProviders.length;

    prompt += `## الأطباء\n`;
    for (const provider of displayProviders) {
      if (prompt.length > ORG_CONTEXT_BUDGET) {
        prompt += `\n... (${providers.length - displayProviders.indexOf(provider)} أطباء إضافيين — استخدمي search_providers للبحث)\n`;
        break;
      }

      let info = `- ${provider.displayName}`;
      if (provider.credentials) info += ` (${provider.credentials})`;
      info += ` [providerId: ${provider.providerId}]`;
      prompt += info + `\n`;

      if (provider.department) {
        prompt += `  القسم: ${(provider.department as any).nameAr || provider.department.name}\n`;
      }
      if (provider.facility) {
        prompt += `  الفرع: ${provider.facility.name}\n`;
      }

      if (provider.services.length > 0) {
        const serviceNames = provider.services.map(ps => (ps.service as any).nameAr || ps.service.name).join('، ');
        prompt += `  الخدمات: ${serviceNames}\n`;
      }

      if (provider.availabilityRules.length > 0) {
        const availabilityByDay: Record<number, string[]> = {};
        provider.availabilityRules.forEach(rule => {
          if (!availabilityByDay[rule.dayOfWeek]) {
            availabilityByDay[rule.dayOfWeek] = [];
          }
          availabilityByDay[rule.dayOfWeek].push(`${formatTime(rule.startLocal)}-${formatTime(rule.endLocal)}`);
        });

        const days = Object.entries(availabilityByDay)
          .map(([day, times]) => `${DAYS_AR[parseInt(day)]}: ${times.join('، ')}`)
          .join(' | ');
        prompt += `  متاح: ${days}\n`;
      }

      prompt += `\n`;
    }

    if (omitted > 0) {
      prompt += `(${omitted} أطباء إضافيين — استخدمي search_providers للبحث)\n\n`;
    }
  }

  // Facilities section (Arabic labels)
  if (facilities.length > 0) {
    prompt += `## الفروع\n`;
    facilities.forEach(f => {
      let info = `- ${f.name}`;
      if (f.city) info += ` في ${f.city}`;
      prompt += info + `\n`;
      if (f.addressLine1) {
        prompt += `  العنوان: ${f.addressLine1}`;
        if (f.addressLine2) prompt += `، ${f.addressLine2}`;
        prompt += `\n`;
      }
    });
    prompt += `\n`;
  }

  // Few-shot examples
  prompt += WHATSAPP_FEWSHOT_EXAMPLES;

  // Agent Builder: Inject clinic-specific LLM instructions
  try {
    const instructions = await loadOrgInstructions(prisma, orgId);
    if (instructions) {
      const instructionPrompt = buildInstructionPrompt(instructions);
      if (instructionPrompt) {
        prompt += instructionPrompt;
      }
    }
  } catch (_) {
    // If instruction loading fails, continue with default prompt
  }

  return prompt;
}

// ─────────────────────────────────────────────────────────
// State-aware slim prompt builder (WhatsApp)
//
// Replaces the monolithic buildWhatsAppSystemPrompt for new
// conversations. Loads only the context relevant to the
// current conversation state — typically 500–2,000 tokens
// instead of the 6,000+ the legacy builder produces.
// ─────────────────────────────────────────────────────────

/**
 * Build a slim, state-aware WhatsApp system prompt.
 *
 * Core (always included, ~500 tokens):
 *   - Clinic name + date/time + tone + safety rules
 *
 * State-specific additions (lazy):
 *   - start/greeting: nothing — just greet
 *   - active: department + service name list (names only, no providers)
 *   - booking: booking rules + providers filtered to selected service
 *   - cancelling / rescheduling: the minimal rule block for that flow
 *   - handoff / closed: short directive — don't reload anything
 */
export async function buildSlimWhatsAppPrompt(
  prisma: PrismaClient,
  orgId: string,
  flowCtx: FlowContext,
): Promise<string> {
  const org = await prisma.org.findUnique({ where: { orgId } });
  if (!org) throw new Error('Organization not found');

  const rNow = riyadhNow();
  const arDateDisplay = new Date(`${rNow.dateStr}T12:00:00Z`).toLocaleDateString('ar-SA', {
    timeZone: RIYADH_TZ, year: 'numeric', month: 'long', day: 'numeric',
  });

  // ─── Core block (always included) ─────────────────────
  let prompt = `أنتِ موظفة استقبال ذكية في ${org.name}.
تتواصلين مع المرضى عبر الواتساب وتساعدينهم بحجز المواعيد والاستفسارات.

## هويتك
- اسم العيادة: **${org.name}** — هذا هو الاسم الذي تذكرينه للمريض دائماً
- ⛔ لا تستخدمي اسم منصة خارجية (مثل "توافد") — أنتِ موظفة في "${org.name}" فقط

## التاريخ والوقت
اليوم: ${DAYS_AR[rNow.dayOfWeek]} ${arDateDisplay} (${rNow.dateStr})
الوقت: ${rNow.timeStr}

## الأسلوب
- ودودة ومختصرة — مثل موظفة استقبال سعودية محترفة
- اللهجة الخليجية، رسائل قصيرة
- إيموجي معتدل (✅ 📅 🏥 ⏰)
- إذا كتب المريض بالإنجليزية، ردّي بالإنجليزية
- في أول رسالة فقط عرّفي نفسك واتبعي حالة "ترحيب" — تتضمن الأقسام ووقت العمل

## قواعد أساسية
- لا تقدمي استشارات طبية — هذا دور الطبيب
- لا تختلقي أسماء أطباء أو خدمات — استخدمي الأدوات للبحث
- ⛔ **لا تختلقي تاريخ/وقت أي موعد من الذاكرة** — استدعي list_patient_appointments دائماً للحصول على الحقيقة من قاعدة البيانات
- ⛔ **لا تقولي "تم التعديل" أو "تم الحجز" إلا بعد نجاح أداة reschedule_appointment / book_appointment فعلياً** — إذا الأداة ما استُدعيت أو رجعت خطأ، الموعد ما تغيّر
- لا تعرضي UUID للمريض (providerId/serviceId للاستخدام الداخلي)
- إذا طلب المريض طوارئ، وجّهيه فوراً للاتصال بـ 997 🚨
`;

  // ─── State-specific layer ─────────────────────────────
  prompt += await buildStateLayer(prisma, orgId, flowCtx);

  // ─── Patient identity note ────────────────────────────
  if (!flowCtx.patientIdentified) {
    prompt += `\n## المريض غير مسجل\n- للحجز: اطلبي الاسم الأول والأخير فقط (رقم الجوال عندك من الواتساب).\n- استخدمي book_appointment_guest بعد الحصول على الاسم.\n`;
  }

  // ─── Agent Builder instructions (clinic-specific) ─────
  try {
    const instructions = await loadOrgInstructions(prisma, orgId);
    if (instructions) {
      const instructionPrompt = buildInstructionPrompt(instructions);
      if (instructionPrompt) prompt += instructionPrompt;
    }
  } catch (_) {
    // Non-fatal
  }

  return prompt;
}

/**
 * Return only the data a given state needs. Called by buildSlimWhatsAppPrompt.
 * Each branch is independent — adding a new state means one new case.
 */
async function buildStateLayer(
  prisma: PrismaClient,
  orgId: string,
  flowCtx: FlowContext,
): Promise<string> {
  const state: ConversationState = flowCtx.state;

  switch (state) {
    case 'start':
    case 'greeting': {
      // Proactively tell the patient: clinic name, departments (what we do),
      // working hours (when we're open), and invite them to book/inquire.
      // This matches the natural Saudi-receptionist flow instead of a terse
      // "how can I help?" that leaves the patient guessing.
      const { departments, workingHoursAr } = await getClinicSchedule(prisma, orgId);
      const deptList = departments.length > 0
        ? departments.map((d, i) => `${i + 1}. ${d}`).join('\n')
        : '';
      let g = `\n## حالة: ترحيب\n`;
      g += `المطلوب في ردك الأول:\n`;
      g += `1. رحّبي بالمريض باختصار مع اسم العيادة "${flowCtx.orgName || 'العيادة'}"\n`;
      if (deptList) {
        g += `2. اعرضي الأقسام المتاحة:\n${deptList}\n`;
      }
      if (workingHoursAr) {
        g += `3. اذكري وقت العمل: ${workingHoursAr}\n`;
      }
      g += `4. اسأليه: "تحب تحجز موعد أو عندك استفسار؟"\n\n`;
      g += `مثال:\n"وعليكم السلام! حياك الله في ${flowCtx.orgName || 'العيادة'} 😊\n`;
      if (deptList) g += `عندنا عدة أقسام:\n${deptList}\n`;
      if (workingHoursAr) g += `وقت العمل: ${workingHoursAr}\n`;
      g += `تحب تحجز موعد أو عندك استفسار؟"\n\n`;
      g += `⛔ لا تسردي الخدمات الفرعية في الترحيب — فقط الأقسام الرئيسية.\n`;
      g += `⛔ لا تقولي "كيف أقدر أساعدك؟" المبهمة — اعرضي الخيارات.\n`;
      return g;
    }

    case 'active': {
      // Note: the DB schema has no `nameAr` column on department or service —
      // the previous `select: { name, nameAr }` was crashing Prisma with a
      // validation error. Use `name` only; it's already Arabic in the seeded
      // data for Saudi orgs.
      const [departments, services] = await Promise.all([
        prisma.department.findMany({ where: { orgId }, orderBy: { name: 'asc' }, select: { name: true } }),
        prisma.service.findMany({
          where: { orgId, active: true },
          orderBy: { name: 'asc' },
          select: { name: true, showPrice: true, priceSar: true, priceNote: true, priceNoteEn: true },
        }),
      ]);
      let s = `\n## حالة: نشطة\n`;
      s += `**قاعدة منع الهلوسة (الأهم):**\n`;
      s += `- ⛔ ممنوع منعاً باتاً ذكر تاريخ/وقت/طبيب/خدمة لموعد المريض من ذاكرة المحادثة السابقة\n`;
      s += `- ⛔ ممنوع تلفيق "أكدت لك التعديل" — التعديل لا يكتمل إلا بنجاح reschedule_appointment\n`;
      s += `- إذا سأل "هل عندي موعد؟" أو "وش موعدي؟" أو "متى موعدي؟" → استدعي list_patient_appointments فوراً، حتى لو ذكر الموضوع قبل قليل\n`;
      s += `- إذا قلت سابقاً "تم التعديل" بدون استدعاء reschedule_appointment فعلياً، فهو لم يتم — أعيدي البدء من جديد\n\n`;
      s += `- استخدمي الأدوات للبحث — لا تعتمدي على الذاكرة.\n`;
      s += `- إذا طلب المريض حجز، ابدئي مسار booking.\n`;
      s += `- إذا طلب إلغاء/تعديل، استخدمي list_patient_appointments أولاً.\n`;
      if (departments.length > 0) {
        s += `\n## الأقسام المتوفرة\n`;
        for (const d of departments) s += `- ${d.name}\n`;
      }
      if (services.length > 0 && services.length <= 30) {
        s += `\n## الخدمات (مرجع — استخدمي list_services للتفاصيل)\n`;
        for (const sv of services) s += `- ${sv.name}${formatServicePricing(sv, 'ar')}\n`;
      } else if (services.length > 30) {
        s += `\n## الخدمات: ${services.length} خدمة — استخدمي list_services\n`;
      }
      if (services.some(sv => sv.showPrice)) {
        s += PRICING_RULES_AR;
      }
      s += INTEGRITY_RULES_AR;
      return s;
    }

    case 'booking': {
      const schedule = await getClinicSchedule(prisma, orgId);
      // Load services with their category so the LLM can resolve Saudi-dialect
      // service names (e.g. "خلع سن" → "خلع ضرس") without asking the patient
      // which department. Without this list the LLM falls back to guessing
      // and asks clarifying questions even when the answer is obvious.
      const servicesWithCat = await prisma.service.findMany({
        where: { orgId, active: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        select: {
          serviceId: true,
          name: true,
          category: true,
          showPrice: true,
          priceSar: true,
          priceNote: true,
          priceNoteEn: true,
        },
      });
      // Group by category
      type CatItem = { serviceId: string; name: string; showPrice: boolean; priceSar: number | null; priceNote: string | null; priceNoteEn: string | null };
      const byCat = new Map<string, CatItem[]>();
      for (const sv of servicesWithCat) {
        const cat = sv.category || 'عام';
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push({
          serviceId: sv.serviceId,
          name: sv.name,
          showPrice: sv.showPrice,
          priceSar: sv.priceSar,
          priceNote: sv.priceNote,
          priceNoteEn: sv.priceNoteEn,
        });
      }

      let s = `\n## حالة: حجز موعد 📅\n`;
      // Anti-hallucination front-and-center for booking state: many user
      // questions like "هل عندي موعد؟" trigger the booking state because they
      // contain the word "موعد", but they're inquiries about EXISTING bookings
      // — not requests to create new ones. The LLM must reach for
      // list_patient_appointments instead of fabricating times.
      s += `\n**🔴 قاعدة الذهبية الأولى — منع الهلوسة:**\n`;
      s += `- ⛔ **ممنوع** ذكر تاريخ/وقت/طبيب/خدمة موعد المريض من ذاكرة المحادثة\n`;
      s += `- ⛔ **ممنوع** قول "تم التعديل" أو "تم الحجز" قبل ما تستدعي الأداة فعلياً وترجع نجاح\n`;
      s += `- ⛔ **ممنوع** اختلاق وقت موعد — اقرئيه فقط من نتيجة list_patient_appointments\n`;
      s += `- إذا سأل المريض عن موعد موجود ("هل عندي موعد؟"، "وش موعدي؟"، "متى موعدي؟"، "اش وقت موعدي"): **استدعي list_patient_appointments فوراً قبل أي رد** — حتى لو حسيتي أن عندك المعلومة من ذاكرة المحادثة، هي قد تكون قديمة أو ملفقة\n\n`;
      if (schedule.workingHoursAr) {
        s += `**وقت عمل العيادة**: ${schedule.workingHoursAr}\n`;
      }
      if (schedule.departments.length > 0) {
        s += `**الأقسام**: ${schedule.departments.join('، ')}\n`;
      }

      // Inline service catalog — essential for matching user phrases to UUIDs.
      if (byCat.size > 0) {
        s += `\n**كتالوج الخدمات (استخدميه لتحديد serviceId من كلام المريض):**\n`;
        for (const [cat, items] of byCat) {
          s += `\n— قسم ${cat}:\n`;
          for (const it of items) {
            s += `  • ${it.name}${formatServicePricing(it, 'ar')} (serviceId: ${it.serviceId})\n`;
          }
        }
        if (servicesWithCat.some(sv => sv.showPrice)) {
          s += PRICING_RULES_AR;
        }
        s += INTEGRITY_RULES_AR;
        s += `\n**ملاحظة مهمة للمطابقة**: المريض قد يستخدم مرادفات. طابقي ذكياً حتى لو الكلمات مختلفة:\n`;
        s += `- "خلع سن" / "قلع سن" / "شيل ضرس" → "خلع ضرس" أو "خلع ضرس عقل"\n`;
        s += `- "تنظيف" / "تنظيف أسنان" / "تلميع" → "تنظيف أسنان"\n`;
        s += `- "تبييض" → "تبييض أسنان"\n`;
        s += `- "تقويم" / "حديد" → "استشارة تقويم أسنان" أو "تقويم أسنان - متابعة"\n`;
        s += `- "هوليوود سمايل" / "ابتسامة هوليود" → "ابتسامة هوليوود (فينير)"\n`;
        s += `- "ضرس عقل" → "خلع ضرس عقل"\n`;
        s += `- "حشوة" → "حشوة تجميلية"\n`;
        s += `- "زراعة" → "زراعة أسنان"\n`;
        s += `- "عصب" / "علاج عصب" → "علاج عصب"\n`;
        s += `- "بوتوكس" → "حقن بوتوكس"\n`;
        s += `- "فيلر" → "حقن فيلر"\n`;
      }

      s += `\n**القاعدة الذهبية**: اعرضي الخيارات للمريض، لا تسأليه يتوقع.\n\n`;
      s += `**السير الصحيح حسب ما يقول المريض:**\n\n`;

      s += `أ) **ذكر اسم قسم فقط** (مثل "أسنان"، "تجميل" بدون تحديد خدمة):\n`;
      s += `   ١. اعرضي الخدمات في هذا القسم من الكتالوج أعلاه كقائمة مرقمة\n`;
      s += `   ٢. اسأليه "أي خدمة تبيها؟"\n`;
      s += `   ⛔ لا تنتقلي للأيام — المريض لم يحدد الخدمة بعد\n\n`;

      s += `ب) **ذكر اسم خدمة أو مرادف** (مثل "تنظيف أسنان"، "خلع سن"، "كشف عام"):\n`;
      s += `   ١. **طابقي كلام المريض مع الكتالوج أعلاه للحصول على serviceId** — لا تسأليه أبداً "أي قسم؟" إذا الخدمة واضحة\n`;
      s += `   ٢. **استدعي browse_available_dates مع serviceId المطابق فوراً** — نفس الدور\n`;
      s += `   ٣. اعرضي نتيجة browse_available_dates **كاملة** — كل الأيام، ساعات العمل، والأطباء\n`;
      s += `   ٤. قولي شيء مثل: "ممتاز! الأيام المتوفرة [الملخص من الأداة]. احجز لك في أي يوم ووقت؟"\n\n`;

      s += `ج) **ذكر يوم/وقت محدد** (مثل "الإثنين الساعة ٥"):\n`;
      s += `   ١. استدعي check_availability لذلك اليوم\n`;
      s += `   ٢. أكدي التاريخ الكامل (اليوم + التاريخ الميلادي)\n`;
      s += `   ٣. hold_appointment (للمسجلين) ثم اعرضي ملخص قصير واسألي "أأكد الحجز؟"\n\n`;

      s += `د) **أكد الحجز (قال "نعم"، "أكد"، "تمام")**:\n`;
      s += `   ١. استدعي book_appointment مع holdAppointmentId (للمسجلين) أو book_appointment_guest مع الاسم (لغير المسجلين)\n`;
      s += `   ٢. رد: "تم تأكيد حجزك، يرجى الحضور قبل موعدك بـ ١٥ دقيقة. أي خدمة ثانية؟"\n\n`;

      s += `**⛔ ممنوع منعاً باتاً:**\n`;
      s += `- "أي قسم تفضل؟" إذا الخدمة واضحة (خلع سن = أسنان، تبييض = أسنان، بوتوكس = تجميل) — استخدمي الكتالوج!\n`;
      s += `- "وش الموعد المناسب لك؟" — المريض لا يعرف متى العيادة مفتوحة.\n`;
      s += `- "وش الأيام اللي تناسبك؟" — اعرضيها له، لا تسأليه.\n`;
      s += `- طلب الخدمة والوقت في نفس السؤال.\n`;
      s += `- اختلاق مواعيد أو أسماء أطباء بدون أداة.\n`;
      s += `- إذا المريض رد برقم (مثل "2")، ارجعي للـ SLOT_MAP أو لقائمة الخدمات المرقمة المعروضة.\n`;

      // Guard: flowCtx.booking.serviceId may be a stale non-UUID (e.g. the LLM
      // persisted "[خدمة 1]" or an Arabic name). Skip the query rather than
      // crashing Prisma with "Error creating UUID".
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const rawSelected = flowCtx.booking?.serviceId;
      const selectedServiceId = typeof rawSelected === 'string' && UUID_RE.test(rawSelected)
        ? rawSelected
        : undefined;
      if (selectedServiceId) {
        const provs = await prisma.provider.findMany({
          where: { orgId, active: true, services: { some: { serviceId: selectedServiceId } } },
          orderBy: { displayName: 'asc' },
          take: 10,
        });
        if (provs.length > 0) {
          s += `\n## الأطباء لهذه الخدمة\n`;
          for (const p of provs) {
            s += `- ${p.displayName}${p.credentials ? ` (${p.credentials})` : ''} [providerId: ${p.providerId}]\n`;
          }
          s += `\nserviceId المختار: ${selectedServiceId}\n`;
        }
      } else {
        s += `\n💡 استخدمي list_services للبحث عن الخدمة المناسبة.\n`;
      }
      return s;
    }

    case 'cancelling': {
      let s = `\n## حالة: إلغاء موعد ❌\n\n`;
      s += `**الخطوات:**\n`;
      s += `1. استدعي list_patient_appointments للحصول على مواعيد المريض القادمة\n`;
      s += `2. النتيجة تحوي مراجع داخلية مثل [موعد 1]، [موعد 2] — استخدميها كـ appointmentId عند استدعاء cancel_appointment\n`;
      s += `3. إذا فيه موعد واحد فقط → اعرضي تفاصيله (التاريخ، الخدمة، الطبيب) واسألي "أأكد إلغاءه؟"\n`;
      s += `4. إذا فيه عدة مواعيد → اعرضيها مرقّمة بالتاريخ والخدمة، اسألي "أي موعد تبي تلغي؟" — المريض يرد بالرقم أو التاريخ\n`;
      s += `5. بعد التأكيد → استدعي cancel_appointment مع appointmentId (الرقم الذي شفتيه في [موعد N])\n\n`;
      s += `**⛔ ممنوع:**\n`;
      s += `- "وش رقم الموعد؟" أو "ابعث لي رقم الموعد" — المريض ما يعرف الـ UUID. عرّفي الموعد بالتاريخ والخدمة.\n`;
      s += `- إلغاء بدون استدعاء list_patient_appointments أولاً.\n`;
      s += `- إلغاء بدون تأكيد المريض.\n`;
      return s;
    }

    case 'rescheduling': {
      let s = `\n## حالة: إعادة جدولة موعد 🔄\n\n`;
      s += `**الخطوات بالترتيب:**\n`;
      s += `1. استدعي list_patient_appointments فوراً للحصول على المواعيد القادمة\n`;
      s += `2. النتيجة تحوي مراجع داخلية مثل [موعد 1]، [موعد 2] — استخدميها كـ appointmentId عند استدعاء reschedule_appointment\n`;
      s += `3. إذا فيه موعد واحد قادم → اعتبريه هو الموعد المطلوب تعديله. لا تسألي المريض عن أي موعد.\n`;
      s += `4. إذا فيه عدة مواعيد → اعرضيها مرقّمة بالتاريخ والخدمة، اسألي "أي موعد تبي تعدل؟" — المريض يرد بالتاريخ أو وصف الموعد، مش UUID\n`;
      s += `5. اسألي عن التاريخ/الوقت الجديد إذا لم يحدده المريض\n`;
      s += `6. استدعي check_availability للتحقق من توفر الوقت الجديد\n`;
      s += `7. اعرضي ملخصاً (الموعد القديم → الموعد الجديد) واسألي "أأكد التعديل؟"\n`;
      s += `8. بعد "نعم" → استدعي reschedule_appointment مع appointmentId (من [موعد N])، newDate، newTime\n\n`;
      s += `**⛔ ممنوع منعاً باتاً:**\n`;
      s += `- "وش رقم الموعد اللي تبي تعدله؟" أو "ابعث لي رقم الموعد" — المريض ما عنده هذا الرقم! استخدمي list_patient_appointments.\n`;
      s += `- "نسيت أطلب منك رقم الموعد" — لا تطلبي الرقم أبداً، احصلي عليه من list_patient_appointments.\n`;
      s += `- استدعاء reschedule_appointment بدون استدعاء list_patient_appointments أولاً.\n`;
      s += `- التعديل بدون تأكيد المريض.\n`;
      return s;
    }

    case 'confirming':
      return `\n## حالة: تأكيد الحجز ✅\n- اعرضي ملخص قصير (خدمة، طبيب، تاريخ، وقت)\n- اسألي: "أأكد الحجز؟"\n- إذا المريض أكد: استخدمي book_appointment مع holdAppointmentId\n`;

    case 'handoff':
      return `\n## حالة: تحويل لموظف 🔄\n- أخبري المريض أن موظف سيتواصل معه قريباً\n- لا تحاولي حل المشكلة\n`;

    case 'closed':
      return `\n## حالة: إنهاء ✅\n- ودّعي المريض بعبارة قصيرة ولطيفة (مثال: "الله يعافيك! 😊 مع السلامة")\n- لا تسألي "هل تحتاج شيء ثاني"\n`;

    default:
      return '';
  }
}

/**
 * Return only the tool categories relevant to the current conversation state.
 * Drastically cuts tool-schema token cost — most turns need 3-5 tools, not 31.
 */
export function getToolCategoriesForState(state: ConversationState): Array<'booking' | 'inquiry' | 'general' | 'escalation'> {
  switch (state) {
    case 'start':
    case 'greeting':
      return [];
    case 'active':
      // Include 'booking' so reschedule/cancel/check_availability are usable
      // after a just-completed booking — patients often correct the time
      // immediately, and without these tools the LLM hallucinates success.
      return ['booking', 'inquiry', 'general'];
    case 'booking':
    case 'confirming':
      return ['booking', 'inquiry', 'general'];
    case 'cancelling':
    case 'rescheduling':
      return ['booking', 'inquiry'];
    case 'handoff':
      return ['escalation'];
    case 'closed':
      return [];
    default:
      return ['booking', 'inquiry', 'general'];
  }
}
