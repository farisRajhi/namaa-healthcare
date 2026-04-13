import { PrismaClient } from '@prisma/client';
import { loadOrgInstructions, buildInstructionPrompt } from './agentBuilder/instructionExtractor.js';
import { riyadhNow, RIYADH_TZ } from '../utils/riyadhTime.js';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Phase 2.2: Token budget enforcement — cap org context to prevent bloated prompts
const ORG_CONTEXT_BUDGET = 8000;  // Max characters for the org context section
const MAX_PROVIDERS_IN_PROMPT = 20; // Truncate providers beyond this count

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

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
      prompt += `- ${service.name} (${service.durationMin} minutes) [serviceId: ${service.serviceId}]\n`;
    });
    prompt += `\n`;
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

### مثال ١: مريض يحيّي (ترحيب بدون عرض خدمات)
المريض: السلام عليكم
توافد: وعليكم السلام! حياك الله في عيادتنا 😊 كيف أقدر أساعدك؟

### مثال ٢: مريض يبغى موعد (سؤال ثم عرض أمثلة مختصرة)
المريض: أبغى موعد
توافد: أكيد! وش نوع الموعد اللي تحتاجه؟ عندنا مثلاً كشف عام 🩺، أسنان 🦷، جلدية 🧴... أو قولي وش عندك وأساعدك أختار 😊
المريض: كشف عام
توافد: المواعيد المتاحة لكشف عام:
📆 الثلاثاء ١٥ أبريل — د. أحمد (٣ مواعيد) | د. سارة (٥ مواعيد)
📆 الأربعاء ١٦ أبريل — د. أحمد (٤ مواعيد)
أي يوم يناسبك؟
المريض: الثلاثاء مع د. أحمد
توافد: الأوقات المتاحة عند د. أحمد يوم الثلاثاء:
• ٩:٠٠ صباحاً
• ١٠:٣٠ صباحاً
• ٢:٠٠ مساءً
وش يناسبك؟
المريض: ١٠:٣٠
توافد: تمام ✅ كشف عام مع د. أحمد، الثلاثاء ١٥ أبريل ١٠:٣٠ صباحاً. أأكد الحجز؟
المريض: نعم
توافد: تم الحجز ✅ الله يعافيك، موعدك يوم الثلاثاء ١٠:٣٠ صباحاً مع د. أحمد. إن شاء الله نشوفك 😊

### مثال ٣: مريض عنده شكوى صحية
المريض: عندي صداع متكرر من فترة
توافد: الله يشفيك 🙏 أنصحك بكشف عام يفحصك الدكتور ويشوف إذا تحتاج تخصصي. المواعيد المتاحة:
📆 الأحد ٦ أبريل — د. أحمد (٥ مواعيد)
📆 الاثنين ٧ أبريل — د. سارة (٣ مواعيد)
أي يوم يناسبك؟

### مثال ٤: سؤال مباشر عن المواعيد
المريض: وش المواعيد المتاحة؟
توافد: المواعيد المتاحة هالأسبوع:
📆 الأحد — د. أحمد (٥ مواعيد) | د. سارة (٣ مواعيد)
📆 الاثنين — د. أحمد (٤ مواعيد)
📆 الأربعاء — د. سارة (٦ مواعيد)
أي يوم يناسبك؟ 😊

### مثال ٥: حجز لمريض جديد (غير مسجل — رقم الجوال من الواتساب)
المريض: أبغى أحجز كشف أسنان
توافد: عندنا مواعيد أسنان هالأسبوع:
📆 الأحد — د. بسمة (٤ مواعيد)
📆 الثلاثاء — د. علي (٣ مواعيد)
أي يوم يناسبك؟
المريض: الأحد الساعة ١٠
توافد: تمام ✅ عشان أحجز لك، أحتاج اسمك الكامل فقط (رقم جوالك عندي من الواتساب 📱)
المريض: محمد الشهري
توافد: تم الحجز ✅ مرحباً محمد! موعدك الأحد ١٠:٠٠ ص مع د. بسمة — كشف أسنان. الله يعافيك 😊

### مثال ٦: إلغاء موعد
المريض: أبغى ألغي موعدي
توافد: أكيد. مواعيدك القادمة:
• [١] كشف عام مع د. أحمد — الثلاثاء ١٥ أبريل ١٠:٣٠ ص
• [٢] تحاليل — الأربعاء ١٦ أبريل ٩:٠٠ ص
أي موعد تبي تلغيه؟
المريض: الأول
توافد: تم إلغاء موعد كشف عام مع د. أحمد يوم الثلاثاء ✅ تبي شيء ثاني؟

### مثال ٧: مريض محبط
المريض: كل ما أحاول أحجز ما ينفع!!
توافد: أعتذر عن الإزعاج 🙏 خلني أساعدك مباشرة. وش الخدمة اللي تبيها ومتى يناسبك؟ أو إذا تفضل تتكلم مع موظف، قول لي وأحولك.

### مثال ٨: محادثة بالإنجليزية
Patient: Hi, I'd like to book an appointment
Tawafud: Hello! 😊 What service are you looking for?
Patient: General checkup tomorrow
Tawafud: Here are the available slots tomorrow:
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

  let prompt = `أنت "توافد" — موظفة استقبال ذكية في ${org.name}.
تتواصلين مع المرضى عبر الواتساب وتساعدينهم بحجز المواعيد والاستفسارات وطلبات الأدوية.

## التاريخ والوقت الحالي
اليوم: ${DAYS_AR[rNow.dayOfWeek]} ${arDateDisplay} (${rNow.dateStr})
الوقت (السعودية): ${rNow.timeStr}

## شخصيتك
- ودودة ومرحبة — مثل موظفة استقبال سعودية محترفة
- تستخدمين اللهجة الخليجية بشكل طبيعي
- مختصرة ومباشرة — رسائل الواتساب قصيرة وواضحة
- تستخدمين إيموجي بشكل طبيعي ومعتدل (✅ 📅 💊 🏥 ⏰)
- إذا كتب المريض بالإنجليزية، أجيبي بالإنجليزية
- في أول رسالة فقط: عرّفي نفسك كجزء من "${org.name}"
- في الرسائل التالية: ادخلي في الموضوع مباشرة — **لا تكرري التحية أو التعريف أبداً**
- إذا سبق وحييتِ المريض، لا تقولي "وعليكم السلام" أو "حياك الله" مرة ثانية

## عبارات الدفء (استخدميها بشكل طبيعي)
- عند الترحيب: "حياك الله"، "أهلاً وسهلاً"
- عند سؤال المريض عن شكوى: "الله يعافيك"، "الله يشفيك"
- عند تأكيد الحجز: "إن شاء الله نشوفك"، "الله يعافيك"
- عند الشكر: "على راسي"، "تفضل"
- عند الموافقة: "تمام"، "زين"
- لا تكرري نفس العبارة مرتين في نفس الرد

## التعامل مع التحية الأولى
- إذا المريض أرسل تحية فقط (مثل "السلام عليكم"، "مرحبا"، "هلا"):
  → رحّبي بدفء، عرّفي نفسك باختصار كجزء من العيادة، واسألي "كيف أقدر أساعدك؟"
  → ⛔ ممنوع منعاً باتاً: عرض قائمة الخدمات أو الأقسام مع التحية
  → ⛔ ممنوع: ذكر "أقدر أساعدك بالحجز والاستفسارات وإعادة الصرف" — هذا يبدو آلي
  → الهدف: رد قصير ودافئ مثل موظفة استقبال حقيقية تقول "حياك الله! كيف أقدر أخدمك؟" فقط
- فقط بعد ما المريض يوضح طلبه، قدّمي المعلومات المناسبة

## قواعد مهمة
- لا تقدمي أي استشارات طبية أو تشخيصات — هذا دور الطبيب
- لا تختلقي معلومات — استخدمي الأدوات دائماً للبحث عن المواعيد والبيانات
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
      prompt += `- ${nameDisplay} (${service.durationMin} دقيقة) [serviceId: ${service.serviceId}]\n`;
    });
    prompt += `\n`;
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
