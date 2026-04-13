/**
 * Patient Habits Seed — Care Gap Rules, Seasonal Campaigns, Cross-sell Offers
 *
 * Seeds dental & cosmetic services, care gap rules based on patient habit
 * re-engagement windows, seasonal campaign templates, and cross-sell offers.
 *
 * Based on: docs/patient-habits.md
 *
 * IMPORTANT: Care gap conditions use `serviceNotReceivedDays` + `previousServices`
 * because `evaluateRule()` in predictiveEngine.ts only processes `previousServices`
 * when `serviceNotReceivedDays` is also present. Using `lastVisitDaysAgo` alone
 * with `previousServices` will silently ignore the service filter.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Service Definitions (dental + cosmetic)
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceDef {
  name: string;        // Arabic name (used as unique key per org)
  nameEn: string;      // English reference (for logs/comments)
  durationMin: number;
  category: 'dental' | 'cosmetic';
  repeatCycleDays?: number;  // recommended interval between repeat visits
  isRepeating?: boolean;     // false for one-time services (e.g. root canal, extraction)
}

const SERVICES: ServiceDef[] = [
  // ── Dental ──
  // Note: 'تنظيف أسنان' (Dental Cleaning) is also created by seed.ts — handled by findFirst
  { name: 'تنظيف أسنان',          nameEn: 'Dental Cleaning',         durationMin: 30, category: 'dental',   repeatCycleDays: 180, isRepeating: true },
  { name: 'تبييض أسنان',          nameEn: 'Teeth Whitening',         durationMin: 60, category: 'dental',   repeatCycleDays: 180, isRepeating: true },
  { name: 'فينير',                nameEn: 'Veneers',                 durationMin: 60, category: 'dental',   repeatCycleDays: 365, isRepeating: true },
  { name: 'تقويم أسنان',          nameEn: 'Orthodontics',            durationMin: 30, category: 'dental',   isRepeating: false },
  { name: 'تقويم شفاف',           nameEn: 'Clear Aligners',          durationMin: 30, category: 'dental',   isRepeating: false },
  { name: 'زراعة أسنان',          nameEn: 'Dental Implants',         durationMin: 60, category: 'dental',   repeatCycleDays: 365, isRepeating: true },
  { name: 'علاج عصب',             nameEn: 'Root Canal',              durationMin: 45, category: 'dental',   isRepeating: false },
  { name: 'حشوات أسنان',          nameEn: 'Dental Fillings',         durationMin: 30, category: 'dental',   isRepeating: false },
  { name: 'خلع أسنان',            nameEn: 'Tooth Extraction',        durationMin: 30, category: 'dental',   isRepeating: false },
  { name: 'علاج لثة',             nameEn: 'Gum Treatment',           durationMin: 45, category: 'dental',   repeatCycleDays: 90,  isRepeating: true },
  { name: 'أسنان أطفال',          nameEn: 'Kids Dentistry',          durationMin: 25, category: 'dental',   repeatCycleDays: 180, isRepeating: true },
  { name: 'تيجان وجسور',          nameEn: 'Crowns & Bridges',        durationMin: 45, category: 'dental',   repeatCycleDays: 365, isRepeating: true },
  { name: 'واقي أسنان ليلي',      nameEn: 'Night Guard',             durationMin: 30, category: 'dental',   repeatCycleDays: 365, isRepeating: true },
  { name: 'فلورايد',              nameEn: 'Fluoride Treatment',      durationMin: 15, category: 'dental',   repeatCycleDays: 180, isRepeating: true },
  // ── Cosmetic ──
  { name: 'بوتوكس',               nameEn: 'Botox',                   durationMin: 30, category: 'cosmetic', repeatCycleDays: 90,  isRepeating: true },
  { name: 'فيلر شفايف',           nameEn: 'Lip Filler',              durationMin: 30, category: 'cosmetic', repeatCycleDays: 180, isRepeating: true },
  { name: 'فيلر خدود',            nameEn: 'Cheek Filler',            durationMin: 30, category: 'cosmetic', repeatCycleDays: 365, isRepeating: true },
  { name: 'فيلر فك',              nameEn: 'Jawline Filler',          durationMin: 30, category: 'cosmetic', repeatCycleDays: 365, isRepeating: true },
  { name: 'إزالة شعر بالليزر',    nameEn: 'Laser Hair Removal',      durationMin: 45, category: 'cosmetic', repeatCycleDays: 42,  isRepeating: true },
  { name: 'تقشير كيميائي',        nameEn: 'Chemical Peel',           durationMin: 30, category: 'cosmetic', repeatCycleDays: 30,  isRepeating: true },
  { name: 'هايدرا فيشل',          nameEn: 'HydraFacial',             durationMin: 45, category: 'cosmetic', repeatCycleDays: 30,  isRepeating: true },
  { name: 'مايكرونيدلنج',         nameEn: 'Microneedling',           durationMin: 45, category: 'cosmetic', repeatCycleDays: 35,  isRepeating: true },
  { name: 'بلازما وجه',           nameEn: 'PRP Face',                durationMin: 45, category: 'cosmetic', repeatCycleDays: 90,  isRepeating: true },
  { name: 'بلازما شعر',           nameEn: 'PRP Hair',                durationMin: 45, category: 'cosmetic', repeatCycleDays: 90,  isRepeating: true },
  { name: 'نحت جسم',              nameEn: 'Body Contouring',         durationMin: 60, category: 'cosmetic', repeatCycleDays: 42,  isRepeating: true },
  { name: 'شد بشرة',              nameEn: 'Skin Tightening',         durationMin: 60, category: 'cosmetic', repeatCycleDays: 365, isRepeating: true },
  { name: 'خيوط شد',              nameEn: 'Thread Lift',             durationMin: 60, category: 'cosmetic', repeatCycleDays: 365, isRepeating: true },
  { name: 'علاج وريدي',           nameEn: 'IV Therapy',              durationMin: 30, category: 'cosmetic', repeatCycleDays: 21,  isRepeating: true },
  { name: 'ميزوثيرابي',           nameEn: 'Mesotherapy',             durationMin: 30, category: 'cosmetic', repeatCycleDays: 30,  isRepeating: true },
  { name: 'علاج حب شباب',         nameEn: 'Acne Treatment',          durationMin: 30, category: 'cosmetic', repeatCycleDays: 35,  isRepeating: true },
  { name: 'علاج ندبات',           nameEn: 'Scar Treatment',          durationMin: 45, category: 'cosmetic', repeatCycleDays: 60,  isRepeating: true },
  { name: 'علاج تصبغات',          nameEn: 'Pigmentation Treatment',  durationMin: 30, category: 'cosmetic', repeatCycleDays: 30,  isRepeating: true },
  { name: 'علاج تساقط شعر',       nameEn: 'Hair Restoration',        durationMin: 45, category: 'cosmetic', repeatCycleDays: 180, isRepeating: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Care Gap Rule Definitions
//
// CRITICAL: evaluateRule() in predictiveEngine.ts only processes
// `previousServices` when `serviceNotReceivedDays` is also present.
// Every rule that targets a specific service MUST include both fields.
// ─────────────────────────────────────────────────────────────────────────────

interface CareGapRuleDef {
  name: string;
  nameAr: string;
  condition: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: 'outbound_call' | 'sms' | 'whatsapp' | 'flag_only';
  messageAr: string;
  messageEn: string;
}

const CARE_GAP_RULES: CareGapRuleDef[] = [
  // ── Dental Care Gaps ──
  {
    name: 'Dental Cleaning - First Reminder',
    nameAr: 'تنظيف أسنان — تذكير أول',
    condition: { previousServices: ['تنظيف أسنان'], serviceNotReceivedDays: 150 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'حان موعد تنظيف أسنانك الدوري — الوقاية أسهل من العلاج. احجز الآن',
    messageEn: 'Time for your routine dental cleaning — prevention is easier than treatment. Book now',
  },
  {
    name: 'Dental Cleaning Overdue',
    nameAr: 'تنظيف أسنان متأخر',
    condition: { previousServices: ['تنظيف أسنان'], serviceNotReceivedDays: 210 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'تنظيف أسنانك متأخر — الوقاية أسهل من العلاج. احجز اليوم',
    messageEn: 'Your dental cleaning is overdue — prevention is easier than treatment. Book today',
  },
  {
    name: 'Dental Cleaning Urgent',
    nameAr: 'تنظيف أسنان متأخر جداً',
    condition: { previousServices: ['تنظيف أسنان'], serviceNotReceivedDays: 300 },
    priority: 'high',
    action: 'outbound_call',
    messageAr: 'مضى وقت طويل على تنظيف أسنانك — تراكم الجير قد يسبب مشاكل أكبر. احجز اليوم',
    messageEn: 'It has been too long since your cleaning — tartar buildup causes bigger problems. Book today',
  },
  {
    name: 'Whitening Touch-up Due',
    nameAr: 'تجديد تبييض الأسنان',
    condition: { previousServices: ['تبييض أسنان'], serviceNotReceivedDays: 150 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'حافظ على بياض ابتسامتك — حان وقت جلسة التجديد',
    messageEn: 'Keep your smile bright — time for a whitening touch-up',
  },
  {
    name: 'Veneer - First Maintenance Nudge',
    nameAr: 'فينير — تذكير صيانة أول',
    condition: { previousServices: ['فينير'], serviceNotReceivedDays: 150 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'ابتسامتك تستحق العناية — موعد فحص الفينير',
    messageEn: 'Your smile deserves care — veneer check-up time',
  },
  {
    name: 'Veneer Annual Check',
    nameAr: 'فحص الفينير السنوي',
    condition: { previousServices: ['فينير'], serviceNotReceivedDays: 330 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'مضى عام على ابتسامة هوليوود — حافظ عليها بالفحص السنوي',
    messageEn: 'One year since your Hollywood Smile — maintain it with your annual check',
  },
  {
    // NOTE: The current CareGapCondition engine cannot express "had service X
    // recently but NOT service Y." This rule approximates by flagging patients
    // who haven't received a crown in 30 days. Manual review is required to
    // confirm the patient actually had a root canal. Using flag_only to avoid
    // sending incorrect automated messages.
    name: 'Root Canal - Crown Missing (CRITICAL)',
    nameAr: 'علاج عصب بدون تاج — عاجل',
    condition: { previousServices: ['تيجان وجسور'], serviceNotReceivedDays: 30 },
    priority: 'critical',
    action: 'flag_only',
    messageAr: 'مريض قد يحتاج تاج بعد علاج العصب — يرجى المراجعة',
    messageEn: 'Patient may need crown after root canal — please review',
  },
  {
    name: 'Post-Extraction Follow-up (Dry Socket)',
    nameAr: 'متابعة بعد الخلع — خطر التهاب',
    condition: { previousServices: ['خلع أسنان'], serviceNotReceivedDays: 5 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'تابع حالة الخلع — موعد الفحص مهم لمنع المضاعفات',
    messageEn: 'Follow up on your extraction — check-up is important to prevent complications',
  },
  {
    name: 'Post-Extraction Implant Consultation',
    nameAr: 'استشارة زراعة بعد الخلع',
    condition: { previousServices: ['خلع أسنان'], serviceNotReceivedDays: 90 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'الفراغ في أسنانك يؤثر على باقي الأسنان — استشارة مجانية لزراعة الأسنان',
    messageEn: 'The gap affects your other teeth — free implant consultation available',
  },
  {
    name: 'Implant Annual Follow-up',
    nameAr: 'متابعة زراعة الأسنان السنوية',
    condition: { previousServices: ['زراعة أسنان'], serviceNotReceivedDays: 330 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'حان وقت فحص الزراعة السنوي — نتأكد كل شي تمام',
    messageEn: 'Time for your annual implant check — making sure everything is perfect',
  },
  {
    name: 'Gum Maintenance - Proactive',
    nameAr: 'صيانة اللثة — تذكير مبكر',
    condition: { previousServices: ['علاج لثة'], serviceNotReceivedDays: 75 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'موعد تنظيف اللثة الدوري — الوقاية تمنع تفاقم المشكلة',
    messageEn: 'Routine gum cleaning due — prevention stops worsening',
  },
  {
    name: 'Gum Maintenance Overdue',
    nameAr: 'صيانة اللثة متأخرة',
    condition: { previousServices: ['علاج لثة'], serviceNotReceivedDays: 120 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'صحة لثتك تحتاج متابعة عاجلة — لا تأجل',
    messageEn: 'Your gum health needs urgent follow-up — don\'t delay',
  },
  {
    name: 'Kids Dental Recall',
    nameAr: 'فحص أسنان أطفال دوري',
    // maxAge: 14 filters on the patient's own dateOfBirth — works correctly
    // when children have their own patient records in the system
    condition: { previousServices: ['أسنان أطفال'], serviceNotReceivedDays: 150, maxAge: 14 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'موعد فحص أسنان طفلك — الوقاية من الآن تحمي ابتسامته',
    messageEn: 'Time for your child\'s dental check-up — early prevention protects their smile',
  },
  {
    name: 'Crown/Bridge Annual Check',
    nameAr: 'فحص التاج والجسر السنوي',
    condition: { previousServices: ['تيجان وجسور'], serviceNotReceivedDays: 330 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'الفحص السنوي للتاج والجسر — نتأكد من ثباته وسلامته',
    messageEn: 'Annual crown/bridge check — ensuring stability and health',
  },
  {
    name: 'Night Guard Replacement Check',
    nameAr: 'فحص واقي الأسنان',
    condition: { previousServices: ['واقي أسنان ليلي'], serviceNotReceivedDays: 365 },
    priority: 'low',
    action: 'sms',
    messageAr: 'واقي الأسنان يفقد فعاليته مع الوقت — تعال نفحصه',
    messageEn: 'Night guards lose effectiveness over time — come for a check',
  },
  {
    name: 'Filling Conversion to Preventive',
    nameAr: 'تحويل مريض الحشوات للوقاية',
    condition: { previousServices: ['حشوات أسنان'], serviceNotReceivedDays: 150 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'الوقاية خير من العلاج — احجز فحص وتنظيف دوري',
    messageEn: 'Prevention beats treatment — book a routine check-up and cleaning',
  },

  // ── Cosmetic Care Gaps ──
  {
    name: 'Botox Renewal',
    nameAr: 'تجديد البوتوكس',
    condition: { previousServices: ['بوتوكس'], serviceNotReceivedDays: 75 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'وقت تجديد البوتوكس يقترب — احجزي الآن للحفاظ على النتائج',
    messageEn: 'Botox renewal time is approaching — book now to maintain results',
  },
  {
    name: 'Botox Overdue',
    nameAr: 'بوتوكس متأخر',
    condition: { previousServices: ['بوتوكس'], serviceNotReceivedDays: 120 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'نفتقدك — عرض خاص على جلسة البوتوكس القادمة',
    messageEn: 'We miss you — special offer on your next Botox session',
  },
  {
    name: 'Lip Filler Renewal',
    nameAr: 'تجديد فيلر الشفايف',
    condition: { previousServices: ['فيلر شفايف'], serviceNotReceivedDays: 150 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'حان وقت تجديد فيلر الشفايف — حافظي على النتائج',
    messageEn: 'Time to refresh your lip filler — maintain your results',
  },
  {
    name: 'Cheek Filler Renewal',
    nameAr: 'تجديد فيلر الخدود',
    condition: { previousServices: ['فيلر خدود'], serviceNotReceivedDays: 300 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'فيلر الخدود — موعد التجديد للحفاظ على الحجم',
    messageEn: 'Cheek filler — renewal time to maintain volume',
  },
  {
    name: 'Laser Hair - Mid Course Dropout',
    nameAr: 'ليزر شعر — انقطاع أثناء الكورس',
    condition: { previousServices: ['إزالة شعر بالليزر'], serviceNotReceivedDays: 42 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'جلسة الليزر القادمة متأخرة — الانتظام مهم للنتائج. احجزي الآن',
    messageEn: 'Your next laser session is overdue — consistency is key for results. Book now',
  },
  {
    name: 'Laser Hair - Annual Maintenance',
    nameAr: 'صيانة إزالة الشعر السنوية',
    condition: { previousServices: ['إزالة شعر بالليزر'], serviceNotReceivedDays: 300 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'جلسة صيانة للحفاظ على النعومة — احجزي جلستك السنوية',
    messageEn: 'Maintenance session to keep smooth results — book your annual session',
  },
  {
    name: 'HydraFacial Monthly Reminder',
    nameAr: 'هايدرا فيشل شهري',
    condition: { previousServices: ['هايدرا فيشل'], serviceNotReceivedDays: 28 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'بشرتك تحتاج هايدرا فيشل — جددي النضارة',
    messageEn: 'Your skin needs a HydraFacial — refresh your glow',
  },
  {
    name: 'PRP Hair Maintenance',
    nameAr: 'صيانة بلازما الشعر',
    condition: { previousServices: ['بلازما شعر'], serviceNotReceivedDays: 75 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'حافظ على كثافة شعرك — جلسة صيانة بلازما للشعر',
    messageEn: 'Maintain your hair density — PRP hair maintenance session',
  },
  {
    name: 'PRP Hair Lapsed',
    nameAr: 'بلازما شعر — منقطع',
    condition: { previousServices: ['بلازما شعر'], serviceNotReceivedDays: 180 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'تساقط الشعر يتسارع بدون متابعة — عد للعلاج',
    messageEn: 'Hair loss accelerates without follow-up — return to treatment',
  },
  {
    name: 'PRP Face Maintenance',
    nameAr: 'صيانة بلازما الوجه',
    condition: { previousServices: ['بلازما وجه'], serviceNotReceivedDays: 75 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'جددي نضارة بشرتك — جلسة بلازما',
    messageEn: 'Refresh your skin — PRP session',
  },
  {
    name: 'Skin Tightening Annual',
    nameAr: 'شد البشرة السنوي',
    condition: { previousServices: ['شد بشرة'], serviceNotReceivedDays: 300 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'حان وقت تجديد جلسة شد البشرة',
    messageEn: 'Time to renew your skin tightening session',
  },
  {
    name: 'Thread Lift Renewal',
    nameAr: 'تجديد خيوط الشد',
    condition: { previousServices: ['خيوط شد'], serviceNotReceivedDays: 300 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'خيوط الشد تبدأ بالتحلل — خططي لتجديدها',
    messageEn: 'Your threads are dissolving — plan your renewal',
  },
  {
    name: 'Acne Treatment Follow-up',
    nameAr: 'متابعة علاج حب الشباب',
    condition: { previousServices: ['علاج حب شباب'], serviceNotReceivedDays: 35 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'موعد جلسة علاج حب الشباب — الاستمرار مهم للنتائج',
    messageEn: 'Acne treatment session due — consistency is important for results',
  },
  {
    name: 'IV Therapy Reminder',
    nameAr: 'تذكير العلاج الوريدي',
    condition: { previousServices: ['علاج وريدي'], serviceNotReceivedDays: 21 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'جسمك يحتاج الفيتامينات — جددي جلسة الوريد',
    messageEn: 'Your body needs vitamins — renew your IV session',
  },
  {
    name: 'Microneedling Series Follow-up',
    nameAr: 'متابعة كورس المايكرونيدلنج',
    condition: { previousServices: ['مايكرونيدلنج'], serviceNotReceivedDays: 35 },
    priority: 'medium',
    action: 'whatsapp',
    messageAr: 'موعد جلسة المايكرونيدلنج القادمة — حافظي على النتائج',
    messageEn: 'Your next microneedling session is due — maintain your results',
  },
  {
    name: 'Body Contouring Follow-up',
    nameAr: 'متابعة نحت الجسم',
    condition: { previousServices: ['نحت جسم'], serviceNotReceivedDays: 42 },
    priority: 'low',
    action: 'whatsapp',
    messageAr: 'موعد الجلسة التالية لنحت الجسم',
    messageEn: 'Time for your next body contouring session',
  },
  {
    name: 'Hair Restoration Lapsed',
    nameAr: 'علاج تساقط الشعر — منقطع',
    condition: { previousServices: ['علاج تساقط شعر'], serviceNotReceivedDays: 180 },
    priority: 'high',
    action: 'whatsapp',
    messageAr: 'نتائج علاج الشعر تحتاج متابعة — لا تخسر التقدم',
    messageEn: 'Hair treatment results need follow-up — don\'t lose your progress',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seasonal Campaign Templates
// ─────────────────────────────────────────────────────────────────────────────

interface CampaignTemplateDef {
  name: string;
  nameAr: string;
  type: 'recall' | 'preventive' | 'follow_up' | 'satisfaction' | 'announcement' | 'promotional';
  targetFilter: Record<string, any>;
  channelSequence: string[];
  scriptAr: string;
  scriptEn: string;
  salaryDayOnly?: boolean;
  /** Which service categories this campaign requires. 'any' = always seed. */
  category?: 'dental' | 'cosmetic' | 'any';
}

const SEASONAL_CAMPAIGNS: CampaignTemplateDef[] = [
  // ── Pre-Eid al-Fitr ──
  {
    name: 'Pre-Eid Whitening',
    nameAr: 'تبييض قبل العيد',
    category: 'dental',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'ابتسامة مشرقة للعيد — عرض خاص على تبييض الأسنان. احجز قبل ما تخلص المواعيد',
    scriptEn: 'Bright smile for Eid — special whitening offer. Book before slots fill up',
  },
  {
    name: 'Pre-Eid Botox & Fillers',
    nameAr: 'بوتوكس وفيلر قبل العيد',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'جهزي نفسك للعيد — عروض خاصة على البوتوكس والفيلر. مواعيد محدودة',
    scriptEn: 'Get Eid-ready — special offers on Botox & fillers. Limited slots',
  },
  {
    name: 'Pre-Eid Glow Package',
    nameAr: 'باقة نضارة العيد',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 45, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'باقة نضارة العيد: هايدرا فيشل + بوتوكس بسعر خاص. احجزي الآن',
    scriptEn: 'Eid Glow Package: HydraFacial + Botox at a special price. Book now',
  },

  // ── Pre-Ramadan ──
  {
    name: 'Pre-Ramadan Dental',
    nameAr: 'أسنانك قبل رمضان',
    category: 'dental',
    type: 'recall',
    targetFilter: { lastVisitDaysAgo: 150, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'جهّز ابتسامتك لرمضان — تنظيف وتبييض قبل الشهر الكريم',
    scriptEn: 'Get your smile Ramadan-ready — cleaning and whitening before the holy month',
  },
  {
    name: 'Pre-Ramadan Cosmetic',
    nameAr: 'إطلالتك في رمضان',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'البوتوكس قبل رمضان يغطي الشهر كامل + العيد. احجزي جلستك الآن',
    scriptEn: 'Pre-Ramadan Botox covers the entire month + Eid. Book your session now',
  },

  // ── Pre-Hajj ──
  {
    name: 'Pre-Hajj Dental Check',
    nameAr: 'فحص أسنان قبل الحج',
    category: 'dental',
    type: 'recall',
    targetFilter: { lastVisitDaysAgo: 120, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'قبل الحج — فحص أسنانك يحميك من المشاكل أثناء المناسك. احجز الآن',
    scriptEn: 'Before Hajj — a dental check protects you during the pilgrimage. Book now',
  },

  // ── Post-Eid Recovery ──
  {
    name: 'Post-Eid Skin Recovery',
    nameAr: 'عناية البشرة بعد العيد',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 30, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'بعد العيد — جددي بشرتك مع هايدرا فيشل أو تقشير. عروض خاصة',
    scriptEn: 'After Eid — refresh your skin with HydraFacial or a peel. Special offers',
  },

  // ── Wedding Season (Oct-Mar) ──
  {
    name: 'Bridal Smile Package',
    nameAr: 'باقة ابتسامة العروس',
    type: 'promotional',
    targetFilter: { sex: 'F', minAge: 18, maxAge: 40, lastVisitDaysAgo: 90 },
    channelSequence: ['whatsapp'],
    scriptAr: 'مبروك! باقة العروس: ابتسامة هوليوود + تبييض + تنظيف بسعر خاص. استشارة مجانية',
    scriptEn: 'Congratulations! Bridal package: Hollywood smile + whitening + cleaning at a special price. Free consultation',
  },
  {
    name: 'Wedding Season Cosmetic',
    nameAr: 'إطلالة موسم الأعراس',
    type: 'promotional',
    targetFilter: { sex: 'F', minAge: 20, maxAge: 55, lastVisitDaysAgo: 60 },
    channelSequence: ['whatsapp'],
    scriptAr: 'موسم الأعراس — باقات تجميلية شاملة: بوتوكس + فيلر + هايدرا فيشل. احجزي استشارتك',
    scriptEn: 'Wedding season — comprehensive beauty packages: Botox + fillers + HydraFacial. Book your consultation',
  },

  // ── Back to School (Aug-Sep) ──
  {
    name: 'Back to School Dental',
    nameAr: 'فحص أسنان قبل المدرسة',
    category: 'dental',
    type: 'recall',
    // Note: targets child patient records (maxAge: 14). Messages are delivered
    // to the phone number on the child's record — ensure children's records
    // have the parent's contact info as primary phone.
    targetFilter: { maxAge: 14, lastVisitDaysAgo: 150, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'قبل المدرسة — فحص أسنان أطفالك. باقة العائلة بخصم ٢٠٪',
    scriptEn: 'Before school — check your kids\' teeth. Family package 20% off',
  },

  // ── October Peel & Pigmentation Season ──
  {
    name: 'October Peel Season',
    nameAr: 'موسم التقشير — أكتوبر',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'بداية موسم التقشير وعلاج التصبغات — أقل شمس = أفضل نتائج. ابدأي الآن',
    scriptEn: 'Peel and pigmentation season begins — less sun = better results. Start now',
  },

  // ── Summer ──
  {
    name: 'Summer Ready',
    nameAr: 'جهّزي نفسك للصيف',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'جهزي بشرتك وجسمك للصيف — عروض على إزالة الشعر بالليزر ونحت الجسم',
    scriptEn: 'Get summer-ready — offers on laser hair removal and body contouring',
  },
  {
    name: 'Post-Summer Recovery',
    nameAr: 'عناية ما بعد الصيف',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'انتهى الصيف — حان وقت علاج التصبغات والتقشير. ابدأي موسم العناية',
    scriptEn: 'Summer is over — time for pigmentation treatment and peels. Start your care season',
  },

  // ── Winter Downtime Procedures ──
  {
    name: 'Winter Treatment Season',
    nameAr: 'موسم العلاجات الشتوي',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'الشتاء أفضل وقت للتقشير العميق وخيوط الشد والليزر — أقل شمس = أفضل نتائج',
    scriptEn: 'Winter is the best time for deep peels, thread lifts, and laser — less sun = better results',
  },

  // ── Year-End / New Year ──
  {
    name: 'New Year New You',
    nameAr: 'سنة جديدة — إطلالة جديدة',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'سنة جديدة — إطلالة جديدة! عروض خاصة على باقات العناية الشاملة. احجزي الآن',
    scriptEn: 'New year, new you! Special offers on comprehensive care packages. Book now',
  },

  // ── Pre-Spring (Feb-Mar) ──
  {
    name: 'Pre-Spring Last Chance',
    nameAr: 'آخر فرصة قبل الصيف',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'آخر فرصة قبل الصيف — أكملي علاج التصبغات والتقشير قبل ما تقوى الشمس',
    scriptEn: 'Last chance before summer — finish pigmentation and peel treatments before the sun gets strong',
  },

  // ── Ramadan IV Therapy ──
  {
    name: 'Ramadan Energy IV',
    nameAr: 'طاقة رمضان — فيتامينات وريدية',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 30, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'حافظي على طاقتك في رمضان — جلسة فيتامينات وريدية بعد الإفطار',
    scriptEn: 'Maintain your energy in Ramadan — IV vitamin session after iftar',
  },

  // ── National Day ──
  {
    name: 'National Day Offer',
    nameAr: 'عرض اليوم الوطني',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'بمناسبة اليوم الوطني خصم خاص على جميع الخدمات. احجز الآن',
    scriptEn: 'Happy National Day! Special discount on all services. Book now',
  },

  // ── Lapsed Patient Win-back ──
  {
    name: 'Lapsed Patient Win-back (6 months)',
    nameAr: 'استعادة المرضى المنقطعين',
    type: 'recall',
    // No minEngagementScore — cast the widest net for lapsed patients.
    // Patients without a PatientInsight row would be excluded by score filters.
    targetFilter: { lastVisitDaysAgo: 180, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms', 'voice'],
    scriptAr: 'وحشتنا! مضى وقت على زيارتك الأخيرة. عرض خاص لعودتك — احجز الآن',
    scriptEn: 'We miss you! It\'s been a while since your last visit. Special offer for your return — book now',
  },

  // NOTE: "First Visit Follow-up" campaign removed — the PatientFilter interface
  // only supports lapse filters (lastVisitDaysAgo = "hasn't visited in N days"),
  // not recency filters ("visited within N days"). A first-visit follow-up should
  // be implemented as a post-appointment trigger in the reminder service instead.

  // ── Salary Day Campaigns (25th-27th monthly) ──
  {
    name: 'Salary Day — Veneers & Implants',
    nameAr: 'يوم الراتب — ابتسامة هوليوود وزراعة أسنان',
    category: 'dental',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 180, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'نزل الراتب؟ حقق حلم ابتسامتك — فينير وزراعة أسنان بتقسيط مريح عبر تابي',
    scriptEn: 'Payday? Achieve your dream smile — veneers and implants with easy installments via Tabby',
    salaryDayOnly: true,
  },
  {
    name: 'Salary Day — Botox & Fillers',
    nameAr: 'يوم الراتب — بوتوكس وفيلر',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'نزل الراتب — جددي بوتوكسك بأقساط مريحة. مواعيد متاحة هالأسبوع',
    scriptEn: 'Payday — renew your Botox with easy installments. Slots available this week',
    salaryDayOnly: true,
  },
  {
    name: 'Salary Day — Laser Package',
    nameAr: 'يوم الراتب — باقة ليزر',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 45, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'عرض نهاية الشهر — باقة إزالة الشعر بالليزر بسعر خاص. تقسيط متاح',
    scriptEn: 'End of month offer — laser hair removal package at a special price. Installments available',
    salaryDayOnly: true,
  },
  {
    name: 'Salary Day — Body Contouring',
    nameAr: 'يوم الراتب — نحت الجسم',
    category: 'cosmetic',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    channelSequence: ['whatsapp'],
    scriptAr: 'نزل الراتب — ابدأي رحلة نحت الجسم. تقسيط بدون فوائد عبر تمارا',
    scriptEn: 'Payday — start your body contouring journey. Interest-free installments via Tamara',
    salaryDayOnly: true,
  },
  {
    name: 'Salary Day — General Elective',
    nameAr: 'يوم الراتب — عروض الخدمات',
    type: 'promotional',
    targetFilter: { lastVisitDaysAgo: 120, excludeWithUpcoming: true },
    channelSequence: ['whatsapp', 'sms'],
    scriptAr: 'عروض نهاية الشهر — تقسيط بدون فوائد على جميع الخدمات التجميلية والأسنان',
    scriptEn: 'End of month offers — interest-free installments on all cosmetic and dental services',
    salaryDayOnly: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Cross-sell Offer Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface OfferDef {
  name: string;
  nameAr: string;
  offerType: 'percentage_discount' | 'fixed_discount' | 'bundle' | 'free_addon' | 'loyalty_reward';
  discountValue?: number;       // For fixed_discount: value in halalas (100 halalas = 1 SAR)
  discountUnit?: 'percent' | 'sar';
  sourceServices: string[];     // Patient must have had these (Arabic names) → resolved to previousServiceIds
  targetServices: string[];     // Offer applies to these (Arabic names) → resolved to serviceIds
  targetFilter: Record<string, any>;
  messageAr: string;
  messageEn: string;
  validDays: number;
}

const CROSS_SELL_OFFERS: OfferDef[] = [
  {
    name: 'Cleaning to Whitening',
    nameAr: 'تنظيف ← تبييض',
    offerType: 'percentage_discount',
    discountValue: 20,
    discountUnit: 'percent',
    sourceServices: ['تنظيف أسنان'],
    targetServices: ['تبييض أسنان'],
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    messageAr: 'بما إنك عملت تنظيف — تبي ابتسامتك أكثر بياضاً؟ خصم ٢٠٪ على التبييض',
    messageEn: 'Since you had a cleaning — want a brighter smile? 20% off whitening',
    validDays: 30,
  },
  {
    name: 'Ortho Complete to Whitening',
    nameAr: 'بعد التقويم ← تبييض',
    offerType: 'percentage_discount',
    discountValue: 15,
    discountUnit: 'percent',
    sourceServices: ['تقويم أسنان', 'تقويم شفاف'],
    targetServices: ['تبييض أسنان'],
    targetFilter: { excludeWithUpcoming: true },
    messageAr: 'مبروك إزالة التقويم! جمّل ابتسامتك الجديدة بالتبييض — خصم ١٥٪',
    messageEn: 'Congrats on finishing ortho! Perfect your new smile with whitening — 15% off',
    validDays: 60,
  },
  {
    name: 'Root Canal to Crown',
    nameAr: 'علاج عصب ← تاج',
    offerType: 'free_addon',
    sourceServices: ['علاج عصب'],
    targetServices: ['تيجان وجسور'],
    targetFilter: { excludeWithUpcoming: true },
    messageAr: 'سنك يحتاج تاج بعد علاج العصب — احجز موعد التاج الآن',
    messageEn: 'Your tooth needs a crown after root canal — book your crown appointment now',
    validDays: 30,
  },
  {
    name: 'Botox to Filler Combo',
    nameAr: 'بوتوكس + فيلر',
    offerType: 'percentage_discount',
    discountValue: 15,
    discountUnit: 'percent',
    sourceServices: ['بوتوكس'],
    targetServices: ['فيلر شفايف', 'فيلر خدود', 'فيلر فك'],
    targetFilter: { lastVisitDaysAgo: 30, excludeWithUpcoming: true },
    messageAr: 'بوتوكس + فيلر = نتيجة متكاملة. خصم ١٥٪ على الفيلر مع البوتوكس',
    messageEn: 'Botox + filler = complete results. 15% off filler with Botox',
    validDays: 30,
  },
  {
    name: 'Extraction to Implant Consult',
    nameAr: 'خلع ← استشارة زراعة',
    offerType: 'free_addon',
    sourceServices: ['خلع أسنان'],
    targetServices: ['زراعة أسنان'],
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    messageAr: 'استشارة مجانية لزراعة الأسنان — الفراغ يؤثر على باقي أسنانك',
    messageEn: 'Free implant consultation — the gap affects your other teeth',
    validDays: 90,
  },
  {
    name: 'Acne Clear to Scar Treatment',
    nameAr: 'بعد علاج الحبوب ← علاج الآثار',
    offerType: 'percentage_discount',
    discountValue: 10,
    discountUnit: 'percent',
    sourceServices: ['علاج حب شباب'],
    targetServices: ['علاج ندبات', 'مايكرونيدلنج'],
    targetFilter: { lastVisitDaysAgo: 30, excludeWithUpcoming: true },
    messageAr: 'بشرتك نظفت! هل تبين نشتغل على الآثار؟ خصم ١٠٪ على علاج الندبات',
    messageEn: 'Your skin cleared! Want to work on scars? 10% off scar treatment',
    validDays: 60,
  },
  {
    name: 'Laser Hair to HydraFacial',
    nameAr: 'ليزر ← هايدرا فيشل',
    offerType: 'fixed_discount',
    discountValue: 10000,         // 100 SAR in halalas (discountValue stores halalas)
    discountUnit: 'sar',
    sourceServices: ['إزالة شعر بالليزر'],
    targetServices: ['هايدرا فيشل'],
    targetFilter: { lastVisitDaysAgo: 30, excludeWithUpcoming: true },
    messageAr: 'بشرتك تحتاج عناية أثناء الليزر — خصم ١٠٠ ريال على هايدرا فيشل',
    messageEn: 'Your skin needs care during laser — 100 SAR off HydraFacial',
    validDays: 30,
  },
  {
    name: 'Body Contouring to Skin Tightening',
    nameAr: 'نحت الجسم ← شد البشرة',
    offerType: 'percentage_discount',
    discountValue: 15,
    discountUnit: 'percent',
    sourceServices: ['نحت جسم'],
    targetServices: ['شد بشرة'],
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    messageAr: 'أكملي النتيجة — شد البشرة بعد النحت بخصم ١٥٪',
    messageEn: 'Complete the result — skin tightening after contouring 15% off',
    validDays: 60,
  },
  {
    name: 'PRP Hair to Transplant Consult',
    nameAr: 'بلازما شعر ← استشارة زراعة',
    offerType: 'free_addon',
    sourceServices: ['بلازما شعر'],
    targetServices: ['علاج تساقط شعر'],
    targetFilter: { lastVisitDaysAgo: 180, excludeWithUpcoming: true },
    messageAr: 'تبي نتيجة أقوى؟ استشارة مجانية لزراعة الشعر',
    messageEn: 'Want stronger results? Free hair transplant consultation',
    validDays: 90,
  },
  {
    name: 'Family Dental Package',
    nameAr: 'باقة أسنان العائلة',
    offerType: 'percentage_discount',
    discountValue: 20,
    discountUnit: 'percent',
    sourceServices: ['أسنان أطفال'],
    targetServices: ['تنظيف أسنان'],
    targetFilter: { lastVisitDaysAgo: 90, excludeWithUpcoming: true },
    messageAr: 'فحصنا أسنان طفلك — وأنتِ متى آخر مرة فحصتي أسنانك؟ خصم عائلة ٢٠٪',
    messageEn: 'We checked your child\'s teeth — when did you last check yours? Family 20% off',
    validDays: 30,
  },
  {
    name: 'Filler to Skin Tightening',
    nameAr: 'فيلر ← شد بشرة',
    offerType: 'percentage_discount',
    discountValue: 10,
    discountUnit: 'percent',
    sourceServices: ['فيلر شفايف', 'فيلر خدود', 'فيلر فك'],
    targetServices: ['شد بشرة'],
    targetFilter: { lastVisitDaysAgo: 180, excludeWithUpcoming: true },
    messageAr: 'الخطوة القادمة — شد البشرة يكمّل نتائج الفيلر. خصم ١٠٪',
    messageEn: 'Next step — skin tightening complements filler results. 10% off',
    validDays: 60,
  },
  {
    name: 'HydraFacial to Botox Intro',
    nameAr: 'هايدرا فيشل ← بوتوكس',
    offerType: 'percentage_discount',
    discountValue: 10,
    discountUnit: 'percent',
    sourceServices: ['هايدرا فيشل'],
    targetServices: ['بوتوكس'],
    targetFilter: { lastVisitDaysAgo: 60, excludeWithUpcoming: true },
    messageAr: 'جربتي البوتوكس؟ نتائج تكمّل الهايدرا فيشل. خصم ١٠٪ على أول جلسة',
    messageEn: 'Tried Botox? It complements HydraFacial results. 10% off your first session',
    validDays: 60,
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// Seed Function
// ─────────────────────────────────────────────────────────────────────────────

export async function seedPatientHabits(prisma: PrismaClient, orgId: string) {
  console.log('\n🦷 Seeding Patient Habits data...\n');

  // ── 1. Read clinic's existing services ──────────────────────────────────
  // Only seed rules/campaigns/offers for services the clinic actually offers.
  // Services are created by the clinic admin — we don't create them here.
  const existingServices = await prisma.service.findMany({
    where: { orgId, active: true },
    select: { serviceId: true, name: true },
  });

  const serviceMap = new Map<string, string>(); // Arabic name → serviceId
  for (const svc of existingServices) {
    serviceMap.set(svc.name, svc.serviceId);
  }

  // Build a set of known service names for quick lookup
  const clinicServiceNames = new Set(serviceMap.keys());

  // Determine which categories the clinic offers
  const SERVICE_CATEGORY_MAP = new Map<string, 'dental' | 'cosmetic'>();
  for (const def of SERVICES) {
    SERVICE_CATEGORY_MAP.set(def.name, def.category);
  }

  const hasDental = existingServices.some(s => SERVICE_CATEGORY_MAP.get(s.name) === 'dental');
  const hasCosmetic = existingServices.some(s => SERVICE_CATEGORY_MAP.get(s.name) === 'cosmetic');

  console.log(`  📋 Clinic has ${existingServices.length} active services (dental: ${hasDental}, cosmetic: ${hasCosmetic})`);

  if (existingServices.length === 0) {
    console.log('  ⚠️  No services found — skipping patient habits seed. Add services first.');
    return;
  }

  // ── 1b. Populate service cycle fields (nameEn, category, repeatCycleDays, isRepeating)
  let servicesUpdated = 0;
  for (const def of SERVICES) {
    const serviceId = serviceMap.get(def.name);
    if (!serviceId) continue;
    await prisma.service.update({
      where: { serviceId },
      data: {
        nameEn: def.nameEn,
        category: def.category,
        repeatCycleDays: def.repeatCycleDays ?? null,
        isRepeating: def.isRepeating ?? false,
      },
    });
    servicesUpdated++;
  }
  if (servicesUpdated > 0) {
    console.log(`  🔄 ${servicesUpdated} services updated with cycle data (nameEn, category, repeatCycleDays)`);
  }

  // ── 2. Create Care Gap Rules (only for services the clinic offers) ─────
  let rulesCreated = 0;
  let rulesSkipped = 0;
  let rulesFilteredOut = 0;

  for (const rule of CARE_GAP_RULES) {
    // Check if the clinic offers the services this rule targets
    const requiredServices: string[] = rule.condition.previousServices || [];
    const hasAllRequired = requiredServices.length === 0 ||
      requiredServices.some((svc: string) => clinicServiceNames.has(svc));

    if (!hasAllRequired) {
      rulesFilteredOut++;
      continue;
    }

    const existing = await prisma.careGapRule.findFirst({
      where: { orgId, name: rule.name },
    });
    if (existing) {
      rulesSkipped++;
      continue;
    }

    await prisma.careGapRule.create({
      data: {
        orgId,
        name: rule.name,
        nameAr: rule.nameAr,
        condition: rule.condition,
        priority: rule.priority,
        action: rule.action,
        messageAr: rule.messageAr,
        messageEn: rule.messageEn,
        isActive: true,
      },
    });
    rulesCreated++;
  }
  console.log(`  ✅ ${rulesCreated} care gap rules created (${rulesSkipped} existed, ${rulesFilteredOut} skipped — clinic doesn't offer those services)`);

  // ── 3. Create Seasonal Campaign Templates (filtered by clinic type) ────
  let campaignsCreated = 0;
  let campaignsSkipped = 0;
  let campaignsFilteredOut = 0;

  for (const tmpl of SEASONAL_CAMPAIGNS) {
    // Filter campaigns by clinic's service categories
    const cat = tmpl.category || 'any';
    if (cat === 'dental' && !hasDental) { campaignsFilteredOut++; continue; }
    if (cat === 'cosmetic' && !hasCosmetic) { campaignsFilteredOut++; continue; }

    const existing = await prisma.campaign.findFirst({
      where: { orgId, name: tmpl.name },
    });
    if (existing) {
      campaignsSkipped++;
      continue;
    }

    await prisma.campaign.create({
      data: {
        orgId,
        name: tmpl.name,
        nameAr: tmpl.nameAr,
        type: tmpl.type,
        status: 'draft',
        targetFilter: tmpl.targetFilter,
        channelSequence: tmpl.channelSequence,
        scriptAr: tmpl.scriptAr,
        scriptEn: tmpl.scriptEn,
        maxCallsPerHour: 50,
        salaryDayOnly: tmpl.salaryDayOnly ?? false,
      },
    });
    campaignsCreated++;
  }
  console.log(`  ✅ ${campaignsCreated} seasonal campaigns created (${campaignsSkipped} existed, ${campaignsFilteredOut} skipped — clinic doesn't offer those categories)`);

  // ── 4. Create Cross-sell Offers (only where both source + target exist) ─
  let offersCreated = 0;
  let offersSkipped = 0;
  let offersFilteredOut = 0;

  for (const offer of CROSS_SELL_OFFERS) {
    // Resolve target service IDs — skip if clinic doesn't offer ANY target service
    const targetServiceIds = offer.targetServices
      .map(name => serviceMap.get(name))
      .filter((id): id is string => !!id);

    // Resolve source service IDs
    const sourceServiceIds = offer.sourceServices
      .map(name => serviceMap.get(name))
      .filter((id): id is string => !!id);

    // Skip if clinic doesn't have at least one source AND one target service
    if (sourceServiceIds.length === 0 || targetServiceIds.length === 0) {
      offersFilteredOut++;
      continue;
    }

    const existing = await prisma.offer.findFirst({
      where: { orgId, name: offer.name },
    });
    if (existing) {
      offersSkipped++;
      continue;
    }

    const enrichedFilter = {
      ...offer.targetFilter,
      ...(sourceServiceIds.length > 0 && { previousServiceIds: sourceServiceIds }),
    };

    // Deterministic promo code — safe for re-runs, unique per offer name
    const hash = crypto.createHash('md5').update(offer.name).digest('hex').slice(0, 6).toUpperCase();
    const promoCode = `XSELL-${hash}`;

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + offer.validDays);

    await prisma.offer.create({
      data: {
        orgId,
        name: offer.name,
        nameAr: offer.nameAr,
        offerType: offer.offerType,
        discountValue: offer.discountValue ?? 0,
        discountUnit: offer.discountUnit ?? 'percent',
        promoCode,
        serviceIds: targetServiceIds,
        providerIds: [],
        facilityIds: [],
        targetPreset: 'custom',
        targetFilter: enrichedFilter,
        validFrom,
        validUntil,
        maxRedemptions: 100,
        perPatientLimit: 1,
        status: 'draft',
        messageAr: offer.messageAr,
        messageEn: offer.messageEn,
        totalRevenue: 0,
      },
    });
    offersCreated++;
  }
  console.log(`  ✅ ${offersCreated} cross-sell offers created (${offersSkipped} existed, ${offersFilteredOut} skipped — clinic doesn't offer those services)`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n🦷 Patient Habits seed complete:');
  console.log(`   Clinic services: ${existingServices.length} (dental: ${hasDental}, cosmetic: ${hasCosmetic})`);
  console.log(`   Care Gaps: ${rulesCreated} new / ${rulesSkipped} existing / ${rulesFilteredOut} skipped`);
  console.log(`   Campaigns: ${campaignsCreated} new / ${campaignsSkipped} existing / ${campaignsFilteredOut} skipped`);
  console.log(`   Offers:    ${offersCreated} new / ${offersSkipped} existing / ${offersFilteredOut} skipped`);
}
