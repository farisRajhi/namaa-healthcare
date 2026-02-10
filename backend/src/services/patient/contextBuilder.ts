import { PrismaClient, MemoryType } from '@prisma/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PatientSummary {
  patientId: string;
  name: string;
  greeting: string;
  lastVisitDate: string | null;
  lastVisitProvider: string | null;
  lastVisitService: string | null;
  nextAppointmentDate: string | null;
  nextAppointmentProvider: string | null;
}

export interface ConversationMessage {
  direction: 'in' | 'out';
  bodyText: string | null;
}

interface ExtractedMemory {
  memoryType: MemoryType;
  memoryKey: string;
  memoryValue: string;
}

// ─── Keyword patterns for memory extraction ────────────────────────────────────

const ALLERGY_PATTERNS = [
  // Arabic patterns
  /(?:عندي|لدي|أعاني من)\s*حساسية\s*(?:من|ضد)\s*(.+?)(?:\.|،|$)/i,
  /حساسية\s*(.+?)(?:\.|،|$)/i,
  // English patterns
  /(?:i'?m|i am)\s*allergic\s*to\s*(.+?)(?:\.|,|$)/i,
  /allergy\s*(?:to|from)\s*(.+?)(?:\.|,|$)/i,
  /allergic\s*(?:to|from)\s*(.+?)(?:\.|,|$)/i,
];

const CONDITION_PATTERNS = [
  // Arabic patterns
  /(?:عندي|لدي|أعاني من|مصاب بـ?|عندي مرض)\s*(.+?)(?:\.|،|$)/i,
  /(?:أعاني|يعاني)\s*(?:من)?\s*(.+?)(?:\.|،|$)/i,
  /(?:مريض|مريضة)\s*(?:بـ?|ب)\s*(.+?)(?:\.|،|$)/i,
];

const CONDITION_KEYWORDS_AR = [
  'سكر', 'سكري', 'ضغط', 'ربو', 'قلب', 'كلى', 'كبد', 'غدة', 'درقية',
  'كوليسترول', 'أنيميا', 'فقر دم', 'روماتيزم', 'صداع نصفي',
];

const MEDICATION_PATTERNS = [
  // Arabic patterns
  /(?:آخذ|أخذ|أتناول|أستخدم|استخدم)\s*(?:حبوب|دواء|علاج|إبر|إبرة)?\s*(.+?)(?:\.|،|$)/i,
  /(?:حبوب|دواء|علاج)\s+(.+?)(?:\.|،|$)/i,
  // English patterns
  /(?:i'?m|i am)\s*(?:taking|on|using)\s*(.+?)(?:\.|,|$)/i,
  /(?:take|taking|prescribed)\s*(.+?)(?:\.|,|$)/i,
];

const PREFERENCE_PATTERNS = [
  // Arabic patterns
  /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:دكتور|دكتورة|طبيب|طبيبة)\s*(.+?)(?:\.|،|$)/i,
  /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:موعد|مواعيد)\s*(?:الصبح|الصباح|بالصبح|صباحي|المساء|بالمساء|مسائي|بالليل|العصر|الظهر)(?:\.|،|$)/i,
  /(?:أفضل|أبغى|أبي|أريد)\s*(.+?)(?:\.|،|$)/i,
];

const PREFERENCE_TIME_PATTERNS = [
  /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:موعد|مواعيد)?\s*(الصبح|الصباح|بالصبح|صباحي|صباحية)/i,
  /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:موعد|مواعيد)?\s*(المساء|بالمساء|مسائي|مسائية)/i,
  /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:موعد|مواعيد)?\s*(الظهر|بالظهر|ظهري)/i,
  /(?:prefer|want)\s*(?:morning|afternoon|evening)\s*(?:appointment)?/i,
];

const FAMILY_PATTERNS = [
  // Arabic patterns
  /(?:بنتي|ابنتي|ولدي|ابني)\s*(?:عمرها?|عمره?)\s*(.+?)(?:\.|،|$)/i,
  /(?:زوجتي|زوجي|أمي|أبوي|أخوي|أختي)\s*(.+?)(?:\.|،|$)/i,
  /(?:بنتي|ابنتي|ولدي|ابني|طفلي|طفلتي)\s*(?:اسمها?|اسمه?)\s*(.+?)(?:\.|،|$)/i,
  // English patterns
  /(?:my\s+(?:daughter|son|wife|husband|mother|father|child))\s*(.+?)(?:\.|,|$)/i,
];

// ─── Arabic date/time formatting helpers ────────────────────────────────────────

const DAYS_AR: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

const MONTHS_AR: Record<number, string> = {
  0: 'يناير', 1: 'فبراير', 2: 'مارس', 3: 'أبريل',
  4: 'مايو', 5: 'يونيو', 6: 'يوليو', 7: 'أغسطس',
  8: 'سبتمبر', 9: 'أكتوبر', 10: 'نوفمبر', 11: 'ديسمبر',
};

function formatDateAr(date: Date): string {
  const day = DAYS_AR[date.getDay()];
  const d = date.getDate();
  const month = MONTHS_AR[date.getMonth()];
  return `${day} ${d} ${month}`;
}

function formatTimeAr(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const period = h >= 12 ? 'مساءً' : 'صباحاً';
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour12}:${m} ${period}`;
}

// ─── Context Builder ────────────────────────────────────────────────────────────

export class ContextBuilder {
  constructor(private prisma: PrismaClient) {}

  /**
   * بناء سياق المريض الكامل لإضافته في system prompt
   */
  async buildPatientContext(patientId: string): Promise<string> {
    const [
      patient,
      memories,
      upcomingAppointments,
      recentAppointments,
      activePrescriptions,
      lastSummary,
      familyLinks,
    ] = await Promise.all([
      // معلومات المريض الأساسية مع جهات الاتصال
      this.prisma.patient.findUnique({
        where: { patientId },
        include: { contacts: true },
      }),
      // ذاكرة المريض (الفعالة فقط)
      this.prisma.patientMemory.findMany({
        where: { patientId, isActive: true },
        orderBy: { updatedAt: 'desc' },
      }),
      // المواعيد القادمة (خلال 30 يوم)
      this.prisma.appointment.findMany({
        where: {
          patientId,
          startTs: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
          status: { in: ['booked', 'confirmed'] },
        },
        include: {
          provider: true,
          service: true,
          facility: true,
        },
        orderBy: { startTs: 'asc' },
        take: 5,
      }),
      // آخر 5 مواعيد سابقة
      this.prisma.appointment.findMany({
        where: {
          patientId,
          startTs: { lt: new Date() },
          status: { in: ['completed', 'checked_in', 'in_progress'] },
        },
        include: {
          provider: true,
          service: true,
        },
        orderBy: { startTs: 'desc' },
        take: 5,
      }),
      // الوصفات الطبية الفعالة
      this.prisma.prescription.findMany({
        where: {
          patientId,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
      }),
      // آخر ملخص محادثة
      this.prisma.conversationSummary.findFirst({
        where: {
          conversation: { patientId },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // الروابط العائلية (الأوصياء)
      this.prisma.messagingUserPatientLink.findMany({
        where: { patientId },
        include: { messagingUser: true },
      }),
    ]);

    if (!patient) return '';

    // ─── بناء النص المنسق ───

    let context = `\n## 📋 سياق المريض\n`;

    // المعلومات الأساسية
    context += `### المعلومات الشخصية\n`;
    context += `- الاسم: ${patient.firstName} ${patient.lastName}\n`;
    if (patient.dateOfBirth) {
      context += `- تاريخ الميلاد: ${formatDateAr(patient.dateOfBirth)}\n`;
    }
    if (patient.mrn) {
      context += `- رقم الملف الطبي: ${patient.mrn}\n`;
    }
    if (patient.sex) {
      const sexAr = patient.sex === 'male' ? 'ذكر' : patient.sex === 'female' ? 'أنثى' : patient.sex;
      context += `- الجنس: ${sexAr}\n`;
    }

    // جهات الاتصال
    const primaryPhone = patient.contacts.find(c => c.contactType === 'phone' && c.isPrimary);
    const primaryEmail = patient.contacts.find(c => c.contactType === 'email' && c.isPrimary);
    if (primaryPhone) {
      context += `- الهاتف: ${primaryPhone.contactValue}\n`;
    }
    if (primaryEmail) {
      context += `- البريد: ${primaryEmail.contactValue}\n`;
    }

    // الحساسيات
    const allergies = memories.filter(m => m.memoryType === 'allergy');
    if (allergies.length > 0) {
      context += `\n### ⚠️ الحساسيات\n`;
      allergies.forEach(a => {
        context += `- ${a.memoryKey}: ${a.memoryValue}\n`;
      });
    }

    // الحالات الصحية
    const conditions = memories.filter(m => m.memoryType === 'condition');
    if (conditions.length > 0) {
      context += `\n### 🏥 الحالات الصحية\n`;
      conditions.forEach(c => {
        context += `- ${c.memoryKey}: ${c.memoryValue}\n`;
      });
    }

    // الأدوية المسجلة (من الذاكرة)
    const medicationMemories = memories.filter(m => m.memoryType === 'medication');
    if (medicationMemories.length > 0) {
      context += `\n### 💊 الأدوية (من المحادثات)\n`;
      medicationMemories.forEach(m => {
        context += `- ${m.memoryKey}: ${m.memoryValue}\n`;
      });
    }

    // الوصفات الطبية الفعالة
    if (activePrescriptions.length > 0) {
      context += `\n### 💊 الوصفات الطبية الفعالة\n`;
      activePrescriptions.forEach(rx => {
        const nameAr = rx.medicationNameAr || rx.medicationName;
        context += `- ${nameAr} — ${rx.dosage} (${rx.frequency})`;
        if (rx.refillsRemaining > 0) {
          context += ` — ${rx.refillsRemaining} إعادة تعبئة متبقية`;
        }
        context += `\n`;
      });
    }

    // التفضيلات
    const preferences = memories.filter(m => m.memoryType === 'preference');
    if (preferences.length > 0) {
      context += `\n### ⭐ التفضيلات\n`;
      preferences.forEach(p => {
        context += `- ${p.memoryKey}: ${p.memoryValue}\n`;
      });
    }

    // معلومات عائلية
    const familyInfo = memories.filter(m => m.memoryType === 'family_history');
    if (familyInfo.length > 0) {
      context += `\n### 👨‍👩‍👧 معلومات عائلية\n`;
      familyInfo.forEach(f => {
        context += `- ${f.memoryKey}: ${f.memoryValue}\n`;
      });
    }

    // نمط الحياة
    const lifestyle = memories.filter(m => m.memoryType === 'lifestyle');
    if (lifestyle.length > 0) {
      context += `\n### 🏃 نمط الحياة\n`;
      lifestyle.forEach(l => {
        context += `- ${l.memoryKey}: ${l.memoryValue}\n`;
      });
    }

    // ملاحظات
    const notes = memories.filter(m => m.memoryType === 'note');
    if (notes.length > 0) {
      context += `\n### 📝 ملاحظات\n`;
      notes.forEach(n => {
        context += `- ${n.memoryKey}: ${n.memoryValue}\n`;
      });
    }

    // المواعيد القادمة
    if (upcomingAppointments.length > 0) {
      context += `\n### 📅 المواعيد القادمة\n`;
      upcomingAppointments.forEach(apt => {
        const date = formatDateAr(apt.startTs);
        const time = formatTimeAr(apt.startTs);
        context += `- ${date} الساعة ${time} — ${apt.provider.displayName} — ${apt.service.name}`;
        if (apt.facility) {
          context += ` في ${apt.facility.name}`;
        }
        context += `\n`;
      });
    }

    // المواعيد السابقة
    if (recentAppointments.length > 0) {
      context += `\n### 📜 آخر الزيارات\n`;
      recentAppointments.forEach(apt => {
        const date = formatDateAr(apt.startTs);
        context += `- ${date} — ${apt.provider.displayName} — ${apt.service.name}\n`;
      });
    }

    // الروابط العائلية (أوصياء)
    if (familyLinks.length > 0) {
      const nonSelfLinks = familyLinks.filter(l => l.relationship !== 'self');
      if (nonSelfLinks.length > 0) {
        context += `\n### 👥 الأوصياء/أفراد العائلة المرتبطين\n`;
        nonSelfLinks.forEach(link => {
          const name = link.messagingUser.displayName || 'غير محدد';
          context += `- ${name} (${link.relationship})\n`;
        });
      }
    }

    // ملخص آخر محادثة
    if (lastSummary) {
      context += `\n### 💬 ملخص آخر محادثة\n`;
      context += `${lastSummary.summary}\n`;
      if (lastSummary.keyTopics.length > 0) {
        context += `المواضيع: ${lastSummary.keyTopics.join('، ')}\n`;
      }
    }

    // اللغة المفضلة
    const langPref = preferences.find(p => p.memoryKey === 'language' || p.memoryKey === 'اللغة');
    if (langPref) {
      context += `\n### 🌐 اللغة المفضلة: ${langPref.memoryValue}\n`;
    }

    context += `\n---\nاستخدم هذا السياق لتخصيص ردودك. خاطب المريض باسمه. تجنب سؤاله عن معلومات متوفرة لديك. نبه من أي تعارض مع حساسياته أو أدويته.\n`;

    return context;
  }

  /**
   * استخراج وحفظ الذكريات تلقائياً من المحادثة
   */
  async extractMemories(
    patientId: string,
    conversationMessages: ConversationMessage[],
    conversationId?: string,
  ): Promise<void> {
    // نستخرج فقط من رسائل المريض (الواردة)
    const patientMessages = conversationMessages
      .filter(m => m.direction === 'in' && m.bodyText)
      .map(m => m.bodyText!);

    if (patientMessages.length === 0) return;

    const fullText = patientMessages.join(' ');
    const extracted: ExtractedMemory[] = [];

    // استخراج الحساسيات
    for (const pattern of ALLERGY_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 1 && value.length < 100) {
          extracted.push({
            memoryType: 'allergy',
            memoryKey: value,
            memoryValue: `حساسية من ${value}`,
          });
        }
      }
    }

    // استخراج الحالات الصحية
    for (const keyword of CONDITION_KEYWORDS_AR) {
      if (fullText.includes(keyword)) {
        extracted.push({
          memoryType: 'condition',
          memoryKey: keyword,
          memoryValue: keyword,
        });
      }
    }

    for (const pattern of CONDITION_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        // تجنب التكرار مع الكلمات المفتاحية المكتشفة أعلاه
        const alreadyFound = extracted.some(
          e => e.memoryType === 'condition' && value.includes(e.memoryKey),
        );
        if (!alreadyFound && value.length > 1 && value.length < 100) {
          extracted.push({
            memoryType: 'condition',
            memoryKey: value,
            memoryValue: value,
          });
        }
      }
    }

    // استخراج الأدوية
    for (const pattern of MEDICATION_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 1 && value.length < 100) {
          extracted.push({
            memoryType: 'medication',
            memoryKey: value,
            memoryValue: `يتناول ${value}`,
          });
        }
      }
    }

    // استخراج تفضيلات الوقت
    for (const pattern of PREFERENCE_TIME_PATTERNS) {
      const match = fullText.match(pattern);
      if (match) {
        const timeValue = match[1] || match[0];
        extracted.push({
          memoryType: 'preference',
          memoryKey: 'وقت_الموعد_المفضل',
          memoryValue: timeValue.trim(),
        });
        break; // تفضيل وقت واحد فقط
      }
    }

    // استخراج تفضيلات الطبيب
    const doctorPrefPattern = /(?:أفضل|أبغى|أبي|أريد|أحب)\s*(?:دكتور|دكتورة|طبيب|طبيبة)\s+(.+?)(?:\.|،|$)/i;
    const doctorMatch = fullText.match(doctorPrefPattern);
    if (doctorMatch && doctorMatch[1]) {
      const doctorName = doctorMatch[1].trim();
      if (doctorName.length > 1 && doctorName.length < 80) {
        extracted.push({
          memoryType: 'preference',
          memoryKey: 'الطبيب_المفضل',
          memoryValue: doctorName,
        });
      }
    }

    // تفضيل طبيبة (أنثى)
    if (/(?:أفضل|أبغى|أبي)\s*دكتورة/i.test(fullText)) {
      extracted.push({
        memoryType: 'preference',
        memoryKey: 'جنس_الطبيب',
        memoryValue: 'أنثى',
      });
    }

    // استخراج معلومات عائلية
    for (const pattern of FAMILY_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 1 && value.length < 150) {
          // تحديد نوع العلاقة من النص
          let relationship = 'فرد_عائلة';
          if (/بنتي|ابنتي/.test(fullText)) relationship = 'ابنة';
          else if (/ولدي|ابني/.test(fullText)) relationship = 'ابن';
          else if (/زوجتي/.test(fullText)) relationship = 'زوجة';
          else if (/زوجي/.test(fullText)) relationship = 'زوج';
          else if (/أمي/.test(fullText)) relationship = 'أم';
          else if (/أبوي|أبي/.test(fullText)) relationship = 'أب';

          extracted.push({
            memoryType: 'family_history',
            memoryKey: relationship,
            memoryValue: value,
          });
        }
      }
    }

    // حفظ الذكريات المستخرجة (تجنب التكرار)
    for (const memory of extracted) {
      try {
        await this.prisma.patientMemory.upsert({
          where: {
            patientId_memoryType_memoryKey: {
              patientId,
              memoryType: memory.memoryType,
              memoryKey: memory.memoryKey,
            },
          },
          update: {
            memoryValue: memory.memoryValue,
            updatedAt: new Date(),
          },
          create: {
            patientId,
            memoryType: memory.memoryType,
            memoryKey: memory.memoryKey,
            memoryValue: memory.memoryValue,
            confidence: 0.8, // استخراج تلقائي — ثقة أقل من الإدخال اليدوي
            sourceConversationId: conversationId || null,
            isActive: true,
          },
        });
      } catch (err) {
        // تجاهل أخطاء التكرار — قد تحصل في حالات نادرة
        console.error('[ContextBuilder] خطأ في حفظ الذاكرة:', err);
      }
    }
  }

  /**
   * الحصول على ملخص ترحيبي للمريض
   */
  async getPatientSummary(patientId: string): Promise<PatientSummary> {
    const [patient, lastAppointment, nextAppointment] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { patientId },
      }),
      // آخر زيارة
      this.prisma.appointment.findFirst({
        where: {
          patientId,
          startTs: { lt: new Date() },
          status: { in: ['completed', 'checked_in', 'in_progress'] },
        },
        include: { provider: true, service: true },
        orderBy: { startTs: 'desc' },
      }),
      // أقرب موعد قادم
      this.prisma.appointment.findFirst({
        where: {
          patientId,
          startTs: { gte: new Date() },
          status: { in: ['booked', 'confirmed'] },
        },
        include: { provider: true, service: true },
        orderBy: { startTs: 'asc' },
      }),
    ]);

    if (!patient) {
      return {
        patientId,
        name: '',
        greeting: '',
        lastVisitDate: null,
        lastVisitProvider: null,
        lastVisitService: null,
        nextAppointmentDate: null,
        nextAppointmentProvider: null,
      };
    }

    const name = `${patient.firstName} ${patient.lastName}`;
    let greeting = `مرحباً ${patient.firstName}!`;

    if (lastAppointment) {
      const lastDate = formatDateAr(lastAppointment.startTs);
      greeting += ` آخر زيارة لك كانت ${lastDate} عند ${lastAppointment.provider.displayName} لـ${lastAppointment.service.name}.`;
    }

    if (nextAppointment) {
      const nextDate = formatDateAr(nextAppointment.startTs);
      const nextTime = formatTimeAr(nextAppointment.startTs);
      greeting += ` عندك موعد قادم يوم ${nextDate} الساعة ${nextTime} مع ${nextAppointment.provider.displayName}.`;
    }

    return {
      patientId,
      name,
      greeting,
      lastVisitDate: lastAppointment ? formatDateAr(lastAppointment.startTs) : null,
      lastVisitProvider: lastAppointment?.provider.displayName ?? null,
      lastVisitService: lastAppointment?.service.name ?? null,
      nextAppointmentDate: nextAppointment ? formatDateAr(nextAppointment.startTs) : null,
      nextAppointmentProvider: nextAppointment?.provider.displayName ?? null,
    };
  }

  /**
   * تحديث تفضيلات المريض
   */
  async updatePreferences(
    patientId: string,
    preferences: Record<string, string>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(preferences)) {
      await this.prisma.patientMemory.upsert({
        where: {
          patientId_memoryType_memoryKey: {
            patientId,
            memoryType: 'preference',
            memoryKey: key,
          },
        },
        update: {
          memoryValue: value,
          updatedAt: new Date(),
        },
        create: {
          patientId,
          memoryType: 'preference',
          memoryKey: key,
          memoryValue: value,
          confidence: 1.0,
          isActive: true,
        },
      });
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

let instance: ContextBuilder | null = null;

export function getContextBuilder(prisma: PrismaClient): ContextBuilder {
  if (!instance) {
    instance = new ContextBuilder(prisma);
  }
  return instance;
}
