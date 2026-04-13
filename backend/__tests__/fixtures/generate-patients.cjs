/**
 * Generate a large realistic dental clinic CSV for Patient Intelligence testing.
 * Run: node __tests__/fixtures/generate-patients.cjs
 */
const fs = require('fs');
const path = require('path');

const TOTAL = 500;
const OUTPUT = path.join(__dirname, 'dental-clinic-500-patients.csv');

// ── Saudi names ─────────────────────────────────────────
const maleFirst = ['محمد','عبدالله','فهد','سلطان','خالد','سعود','عبدالرحمن','ناصر','تركي','بدر','فيصل','ماجد','سلمان','أحمد','عمر','يوسف','إبراهيم','مشاري','عادل','وليد','حسن','علي','سعد','طلال','نايف','بندر','عبدالعزيز','مشعل','رائد','ياسر','زياد','هاني','أنس','حمد','صالح','عامر','رياض','جاسم','منصور','حاتم'];
const femaleFirst = ['فاطمة','نورة','سارة','هند','ريم','مها','وفاء','لطيفة','عائشة','سميرة','حصة','دانة','لمى','أمل','هيا','منيرة','سعاد','نوف','أروى','شيماء','رنا','ليلى','جواهر','بدور','غادة','مريم','رزان','عبير','سمية','ديمة','لولوة','جنان','العنود','مشاعل','هديل','وجدان','ندى','رهام','أسماء','خلود'];
const families = ['الحربي','القحطاني','الشهري','العتيبي','الدوسري','الزهراني','الغامدي','المطيري','السبيعي','الشمري','العنزي','البقمي','الرشيدي','المالكي','الجهني','الأحمدي','السلمي','الخالدي','العسيري','القرني','الشهراني','الحازمي','الشمراني','البلوي','المغربي','الرويلي','الجبرين','المري','الحارثي','العمري','الشريف','الفيفي','اليامي','النعمي','الثبيتي','المحمدي','الخثعمي','الأسمري','الوادعي','الزبيدي'];

// ── Helpers ──────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];

function saudiPhone() {
  const prefix = pick(['050','051','053','054','055','056','057','058','059']);
  const num = String(rand(1000000, 9999999));
  const fmt = rand(0, 3);
  if (fmt === 0) return prefix + num;
  if (fmt === 1) return '+966' + prefix.slice(1) + num;
  if (fmt === 2) return '966' + prefix.slice(1) + num;
  return '00966' + prefix.slice(1) + num;
}

function randomDOB(minAge, maxAge) {
  const year = new Date().getFullYear() - rand(minAge, maxAge);
  const month = rand(1, 12);
  const day = rand(1, 28);
  if (Math.random() < 0.08) {
    const hYear = Math.round((year - 621.564) / 0.970229);
    return `${hYear}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  }
  if (Math.random() < 0.20) {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysAgoDate(min, max) {
  const d = new Date();
  d.setDate(d.getDate() - rand(min, max));
  return d.toISOString().split('T')[0];
}

function servicesFor(segment) {
  const pools = {
    overdue_routine: [
      ['تنظيف الاسنان','فحص'],['تنظيف الاسنان','فحص','أشعة'],
      ['تنظيف الاسنان','فحص','حشوة'],['فحص دوري','تنظيف الاسنان'],
      ['تنظيف الاسنان','فلورايد','فحص'],['تنظيف الاسنان','تلميع الاسنان','فحص'],
    ],
    lapsed_long: [
      ['حشوة','فحص'],['تنظيف الاسنان','فحص'],['خلع الاسنان'],
      ['حشوة','تنظيف الاسنان'],['فحص','أشعة'],['علاج لثة','فحص'],
    ],
    needs_followup: [
      ['علاج عصب','تنظيف الاسنان','فحص'],['علاج عصب','فحص'],
      ['زراعة الاسنان','فحص','أشعة'],['علاج عصب','حشوة','فحص','أشعة'],
    ],
    high_value: [
      ['فينير','تبييض الاسنان','تنظيف الاسنان','حشوة','فحص','أشعة'],
      ['زراعة الاسنان','تنظيف الاسنان','حشوة','فحص','أشعة','علاج لثة'],
      ['تبييض الاسنان','تنظيف الاسنان','فينير','فحص','تلميع الاسنان'],
      ['تقويم الاسنان','تنظيف الاسنان','فحص','أشعة','فلورايد'],
      ['فينير','تبييض الاسنان','تنظيف الاسنان','فحص','حشوة','جسر الاسنان'],
    ],
    new_dropout: [['كشف'],['فحص'],['تنظيف الاسنان'],['حشوة'],['أشعة'],['كشف']],
    seasonal: [
      ['تبييض الاسنان','تنظيف الاسنان','فحص'],['تبييض الاسنان','تنظيف الاسنان'],
      ['فينير','تنظيف الاسنان'],['تبييض الاسنان','فحص'],
    ],
    upsell: [
      ['تنظيف الاسنان','فحص'],['تنظيف الاسنان','فحص','حشوة'],
      ['تنظيف الاسنان','فحص','أشعة'],['تنظيف الاسنان','فلورايد','فحص'],
    ],
    dnc: [
      ['تنظيف الاسنان','فحص'],['حشوة'],['فحص'],
      ['تنظيف الاسنان','حشوة','فحص','أشعة'],
    ],
  };
  return pick(pools[segment] || [['فحص']]);
}

function pickSegment() {
  const r = Math.random();
  if (r < 0.32) return 'overdue_routine';  // ~160
  if (r < 0.47) return 'lapsed_long';      // ~75
  if (r < 0.55) return 'needs_followup';   // ~40
  if (r < 0.63) return 'high_value';       // ~40
  if (r < 0.75) return 'new_dropout';      // ~60
  if (r < 0.82) return 'seasonal';         // ~35
  if (r < 0.92) return 'upsell';           // ~50
  return 'dnc';                             // ~40
}

// ── Generate ────────────────────────────────────────────
const rows = [];
const usedPhones = new Set();
const segmentCounts = {};

for (let i = 0; i < TOTAL; i++) {
  const isMale = Math.random() < 0.45;
  const name = (isMale ? pick(maleFirst) : pick(femaleFirst)) + ' ' + pick(families);
  const sex = isMale ? 'ذكر' : 'أنثى';
  const segment = pickSegment();
  segmentCounts[segment] = (segmentCounts[segment] || 0) + 1;

  // Phone (5% missing)
  let phone = '';
  if (Math.random() > 0.05) {
    do { phone = saudiPhone(); } while (usedPhones.has(phone));
    usedPhones.add(phone);
  }

  // Email (25% have one)
  const emailUser = name.split(' ')[0].toLowerCase().replace(/[^\u0600-\u06FFa-z]/g, '');
  const email = Math.random() < 0.25 ? `${emailUser}${rand(1,999)}@${pick(['gmail.com','hotmail.com','outlook.sa'])}` : '';

  const dob = segment === 'new_dropout' ? randomDOB(18, 40) :
              segment === 'high_value' ? randomDOB(28, 65) :
              randomDOB(3, 78);

  let lastVisit, totalVisits, lastService, allServices, notes = '';

  switch (segment) {
    case 'overdue_routine':
      lastVisit = daysAgoDate(150, 280);
      totalVisits = rand(2, 10);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick(['مريض منتظم','مؤمن - تأمين طبي','','','','','']);
      break;
    case 'lapsed_long':
      lastVisit = daysAgoDate(240, 800);
      totalVisits = rand(1, 4);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick(['لم يعد منذ فترة طويلة','حاول الاتصال سابقاً','','','']);
      break;
    case 'needs_followup':
      lastVisit = daysAgoDate(5, 55);
      totalVisits = rand(2, 8);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick([
        'تحتاج تاج بعد علاج العصب','متابعة علاج عصب - تاج مطلوب',
        'بحاجة لتاج ضروري','لم يركب التاج بعد',
        'متابعة بعد الزراعة - فحص مطلوب','علاج عصب - لم يكمل العلاج',
      ]);
      break;
    case 'high_value':
      lastVisit = daysAgoDate(120, 320);
      totalVisits = rand(6, 22);
      allServices = servicesFor(segment);
      lastService = pick(allServices.slice(0, 2));
      notes = pick(['مريض VIP','عميل مميز','مريض قديم - خدمات متعددة','','']);
      break;
    case 'new_dropout':
      lastVisit = daysAgoDate(25, 220);
      totalVisits = 1;
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick(['زيارة واحدة فقط','لم يعد بعد الكشف','مريض جديد','','']);
      break;
    case 'seasonal':
      lastVisit = daysAgoDate(80, 320);
      totalVisits = rand(2, 6);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick(['مرشحة لتبييض قبل العيد','تبييض سابق - تجديد','','']);
      break;
    case 'upsell':
      lastVisit = daysAgoDate(50, 200);
      totalVisits = rand(2, 7);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick(['تنظيف فقط - لم يجرب تبييض','مرشح لخدمات تجميلية','','']);
      break;
    case 'dnc':
      lastVisit = daysAgoDate(20, 500);
      totalVisits = rand(1, 10);
      allServices = servicesFor(segment);
      lastService = allServices[0];
      notes = pick([
        'لا تتواصل - طلب المريض','لا تتواصل',
        'لا تتواصل - رفض التسويق','لا تتواصل - إلغاء الاشتراك',
      ]);
      break;
  }

  rows.push([
    1001 + i,
    name,
    phone,
    email,
    dob,
    sex,
    lastVisit,
    lastService,
    totalVisits,
    `"${allServices.join(', ')}"`,
    notes,
  ]);
}

// ── Write CSV ───────────────────────────────────────────
const header = 'رقم المريض,اسم المريض,رقم الجوال,البريد الإلكتروني,تاريخ الميلاد,الجنس,تاريخ آخر زيارة,آخر خدمة,عدد الزيارات,الخدمات,ملاحظات';
const csv = header + '\n' + rows.map((r) => r.join(',')).join('\n') + '\n';
fs.writeFileSync(OUTPUT, csv, 'utf8');

console.log(`Generated ${TOTAL} patients → ${OUTPUT}`);
console.log(`File size: ${(Buffer.byteLength(csv, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`Missing phones: ${rows.filter((r) => !r[2]).length}`);
console.log(`With email: ${rows.filter((r) => r[3]).length}`);
console.log(`Hijri dates: ~${Math.round(TOTAL * 0.08)}`);
console.log(`Segment distribution:`, segmentCounts);
