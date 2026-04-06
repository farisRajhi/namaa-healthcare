import { PrismaClient } from '@prisma/client';
import { seedFlowTemplates } from '../src/services/agentBuilder/seedTemplates.js';
import { seedPatientHabits } from './seedPatientHabits.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Tawafud database...\n');

  // ─── 1. Organization (idempotent upsert) ────────────────────────────
  // Find existing org by name to avoid duplicates across seed runs
  const existingOrg = await prisma.org.findFirst({
    where: { name: 'مستشفى توافد التخصصي' },
  });
  const org = existingOrg
    ? existingOrg
    : await prisma.org.create({
        data: {
          name: 'مستشفى توافد التخصصي',
          defaultTimezone: 'Asia/Riyadh',
        },
      });
  console.log(existingOrg ? '♻️ Org already exists, reusing:' : '✅ Org created:', org.name);

  // If org already existed, skip the rest to avoid duplicates
  if (existingOrg) {
    console.log('\n♻️ Seed data already exists — skipping. To re-seed, reset the database first.');
    // Still seed templates and patient habits (they use upsert/idempotent checks internally)
    await seedFlowTemplates(prisma, org.orgId);
    await seedPatientHabits(prisma, org.orgId);
    console.log('\n🎉 Seed check complete.');
    return;
  }

  // ─── 2. Facilities ────────────────────────────────────────────────
  const facilityJazan = await prisma.facility.create({
    data: {
      orgId: org.orgId,
      name: 'الفرع الرئيسي - جازان',
      timezone: 'Asia/Riyadh',
      addressLine1: 'شارع الملك فهد',
      city: 'جازان',
      region: 'منطقة جازان',
      postalCode: '45142',
      country: 'SA',
    },
  });

  const facilitySabya = await prisma.facility.create({
    data: {
      orgId: org.orgId,
      name: 'فرع صبيا',
      timezone: 'Asia/Riyadh',
      addressLine1: 'شارع الأمير سلطان',
      city: 'صبيا',
      region: 'منطقة جازان',
      postalCode: '45931',
      country: 'SA',
    },
  });
  console.log('✅ 2 Facilities created');

  // ─── 3. Departments ───────────────────────────────────────────────
  const deptGeneral = await prisma.department.create({
    data: { orgId: org.orgId, name: 'طب عام' },
  });
  const deptDental = await prisma.department.create({
    data: { orgId: org.orgId, name: 'طب أسنان' },
  });
  const deptPediatric = await prisma.department.create({
    data: { orgId: org.orgId, name: 'طب أطفال' },
  });
  console.log('✅ 3 Departments created');

  // ─── 4. Providers (Doctors) ───────────────────────────────────────
  // Helper: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4 (ISO: Sun=7 but Prisma uses 0-6)
  const workDays = [0, 1, 2, 3, 4]; // Sun-Thu
  const startTime = new Date('2000-01-01T08:00:00');
  const endTime = new Date('2000-01-01T16:00:00');

  const drAhmed = await prisma.provider.create({
    data: {
      orgId: org.orgId,
      departmentId: deptGeneral.departmentId,
      facilityId: facilityJazan.facilityId,
      displayName: 'د. أحمد بن محمد العمري',
      credentials: 'بكالوريوس طب - جامعة الملك سعود',
      availabilityRules: {
        create: workDays.map((day) => ({
          dayOfWeek: day,
          startLocal: startTime,
          endLocal: endTime,
          slotIntervalMin: 20,
        })),
      },
    },
  });

  const drFatimah = await prisma.provider.create({
    data: {
      orgId: org.orgId,
      departmentId: deptDental.departmentId,
      facilityId: facilityJazan.facilityId,
      displayName: 'د. فاطمة بنت عبدالله الزهراني',
      credentials: 'ماجستير طب أسنان - جامعة الملك عبدالعزيز',
      availabilityRules: {
        create: workDays.map((day) => ({
          dayOfWeek: day,
          startLocal: startTime,
          endLocal: endTime,
          slotIntervalMin: 30,
        })),
      },
    },
  });

  const drKhalid = await prisma.provider.create({
    data: {
      orgId: org.orgId,
      departmentId: deptPediatric.departmentId,
      facilityId: facilitySabya.facilityId,
      displayName: 'د. خالد بن سعيد القحطاني',
      credentials: 'استشاري طب أطفال - البورد السعودي',
      availabilityRules: {
        create: workDays.map((day) => ({
          dayOfWeek: day,
          startLocal: startTime,
          endLocal: endTime,
          slotIntervalMin: 15,
        })),
      },
    },
  });
  console.log('✅ 3 Providers created with availability rules');

  // ─── 5. Services ──────────────────────────────────────────────────
  const svcGeneral = await prisma.service.create({
    data: { orgId: org.orgId, name: 'كشف عام', durationMin: 20 },
  });
  const svcDental = await prisma.service.create({
    data: { orgId: org.orgId, name: 'تنظيف أسنان', durationMin: 30 },
  });
  const svcPediatric = await prisma.service.create({
    data: { orgId: org.orgId, name: 'فحص أطفال', durationMin: 25 },
  });
  const svcFollowUp = await prisma.service.create({
    data: { orgId: org.orgId, name: 'متابعة', durationMin: 15 },
  });
  const svcEmergency = await prisma.service.create({
    data: { orgId: org.orgId, name: 'طوارئ', durationMin: 10, bufferAfterMin: 5 },
  });
  console.log('✅ 5 Services created');

  // Link providers → services
  await prisma.providerService.createMany({
    data: [
      { providerId: drAhmed.providerId, serviceId: svcGeneral.serviceId },
      { providerId: drAhmed.providerId, serviceId: svcFollowUp.serviceId },
      { providerId: drAhmed.providerId, serviceId: svcEmergency.serviceId },
      { providerId: drFatimah.providerId, serviceId: svcDental.serviceId },
      { providerId: drFatimah.providerId, serviceId: svcFollowUp.serviceId },
      { providerId: drKhalid.providerId, serviceId: svcPediatric.serviceId },
      { providerId: drKhalid.providerId, serviceId: svcFollowUp.serviceId },
      { providerId: drKhalid.providerId, serviceId: svcEmergency.serviceId },
    ],
  });
  console.log('✅ Provider-Service links created');

  // ─── 6. Patients ──────────────────────────────────────────────────
  const patientsData = [
    { firstName: 'عبدالرحمن', lastName: 'الشهري', sex: 'M', dob: '1990-05-15', mrn: 'MRN-001', phone: '+966501234567' },
    { firstName: 'نورة', lastName: 'الغامدي', sex: 'F', dob: '1985-11-22', mrn: 'MRN-002', phone: '+966512345678' },
    { firstName: 'محمد', lastName: 'الدوسري', sex: 'M', dob: '1978-03-08', mrn: 'MRN-003', phone: '+966523456789' },
    { firstName: 'سارة', lastName: 'العتيبي', sex: 'F', dob: '2015-07-19', mrn: 'MRN-004', phone: '+966534567890' },
    { firstName: 'فهد', lastName: 'المالكي', sex: 'M', dob: '2000-01-30', mrn: 'MRN-005', phone: '+966545678901' },
  ];

  const patients: { patientId: string; firstName: string; lastName: string }[] = [];
  for (const p of patientsData) {
    const patient = await prisma.patient.create({
      data: {
        orgId: org.orgId,
        firstName: p.firstName,
        lastName: p.lastName,
        sex: p.sex,
        dateOfBirth: new Date(p.dob),
        mrn: p.mrn,
      },
    });
    patients.push(patient);

    // Phone contact
    await prisma.patientContact.create({
      data: {
        patientId: patient.patientId,
        contactType: 'phone',
        contactValue: p.phone,
        isPrimary: true,
      },
    });
    // WhatsApp contact
    await prisma.patientContact.create({
      data: {
        patientId: patient.patientId,
        contactType: 'whatsapp',
        contactValue: p.phone,
        isPrimary: false,
      },
    });
  }
  console.log('✅ 5 Patients created with contacts');

  // Patient memories
  const memoriesData = [
    { idx: 0, type: 'allergy' as const, key: 'penicillin', value: 'حساسية من البنسلين' },
    { idx: 0, type: 'preference' as const, key: 'appointment_time', value: 'يفضل المواعيد الصباحية' },
    { idx: 1, type: 'condition' as const, key: 'diabetes', value: 'سكري نوع ٢ - منذ ٢٠١٨' },
    { idx: 1, type: 'medication' as const, key: 'metformin', value: 'ميتفورمين ٥٠٠ ملغ مرتين يومياً' },
    { idx: 2, type: 'condition' as const, key: 'hypertension', value: 'ضغط دم مرتفع - متابعة شهرية' },
    { idx: 2, type: 'lifestyle' as const, key: 'smoking', value: 'مدخن - يرغب في الإقلاع' },
    { idx: 3, type: 'allergy' as const, key: 'eggs', value: 'حساسية من البيض' },
    { idx: 4, type: 'preference' as const, key: 'language', value: 'يفضل التحدث بالعربية' },
    { idx: 4, type: 'note' as const, key: 'emergency_contact', value: 'والده: 0555555555' },
  ];

  for (const m of memoriesData) {
    await prisma.patientMemory.create({
      data: {
        patientId: patients[m.idx].patientId,
        memoryType: m.type,
        memoryKey: m.key,
        memoryValue: m.value,
      },
    });
  }
  console.log('✅ Patient memories created');

  // ─── 7. Appointments ──────────────────────────────────────────────
  const now = new Date();
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const setTime = (d: Date, h: number, m: number) => {
    const result = new Date(d);
    result.setHours(h, m, 0, 0);
    return result;
  };

  const appointmentsData: {
    patientId: string;
    providerId: string;
    serviceId: string;
    facilityId: string;
    departmentId: string;
    startH: number;
    startM: number;
    durationMin: number;
    dayOffset: number;
    status: 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
    reason?: string;
  }[] = [
    // Past - completed
    { patientId: patients[0].patientId, providerId: drAhmed.providerId, serviceId: svcGeneral.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptGeneral.departmentId, startH: 9, startM: 0, durationMin: 20, dayOffset: -10, status: 'completed', reason: 'كشف عام - صداع مستمر' },
    { patientId: patients[1].patientId, providerId: drAhmed.providerId, serviceId: svcFollowUp.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptGeneral.departmentId, startH: 10, startM: 0, durationMin: 15, dayOffset: -7, status: 'completed', reason: 'متابعة سكري' },
    { patientId: patients[2].patientId, providerId: drFatimah.providerId, serviceId: svcDental.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptDental.departmentId, startH: 11, startM: 0, durationMin: 30, dayOffset: -5, status: 'completed', reason: 'تنظيف أسنان دوري' },
    // Past - cancelled / no_show
    { patientId: patients[3].patientId, providerId: drKhalid.providerId, serviceId: svcPediatric.serviceId, facilityId: facilitySabya.facilityId, departmentId: deptPediatric.departmentId, startH: 9, startM: 30, durationMin: 25, dayOffset: -3, status: 'cancelled', reason: 'فحص أطفال - تم الإلغاء' },
    { patientId: patients[4].patientId, providerId: drAhmed.providerId, serviceId: svcGeneral.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptGeneral.departmentId, startH: 14, startM: 0, durationMin: 20, dayOffset: -2, status: 'no_show', reason: 'كشف عام' },
    // Future - booked
    { patientId: patients[0].patientId, providerId: drFatimah.providerId, serviceId: svcDental.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptDental.departmentId, startH: 10, startM: 0, durationMin: 30, dayOffset: 2, status: 'booked', reason: 'تنظيف أسنان' },
    { patientId: patients[1].patientId, providerId: drKhalid.providerId, serviceId: svcPediatric.serviceId, facilityId: facilitySabya.facilityId, departmentId: deptPediatric.departmentId, startH: 8, startM: 30, durationMin: 25, dayOffset: 3, status: 'booked', reason: 'فحص طفل' },
    // Future - confirmed
    { patientId: patients[2].patientId, providerId: drAhmed.providerId, serviceId: svcFollowUp.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptGeneral.departmentId, startH: 13, startM: 0, durationMin: 15, dayOffset: 4, status: 'confirmed', reason: 'متابعة ضغط دم' },
    { patientId: patients[3].patientId, providerId: drKhalid.providerId, serviceId: svcPediatric.serviceId, facilityId: facilitySabya.facilityId, departmentId: deptPediatric.departmentId, startH: 9, startM: 0, durationMin: 25, dayOffset: 5, status: 'confirmed', reason: 'فحص أطفال دوري' },
    { patientId: patients[4].patientId, providerId: drAhmed.providerId, serviceId: svcEmergency.serviceId, facilityId: facilityJazan.facilityId, departmentId: deptGeneral.departmentId, startH: 15, startM: 0, durationMin: 10, dayOffset: 1, status: 'booked', reason: 'طوارئ - ألم بطن' },
  ];

  for (const a of appointmentsData) {
    const startTs = setTime(addDays(now, a.dayOffset), a.startH, a.startM);
    const endTs = new Date(startTs.getTime() + a.durationMin * 60000);
    await prisma.appointment.create({
      data: {
        orgId: org.orgId,
        facilityId: a.facilityId,
        departmentId: a.departmentId,
        providerId: a.providerId,
        patientId: a.patientId,
        serviceId: a.serviceId,
        startTs,
        endTs,
        status: a.status,
        reason: a.reason,
        bookedVia: 'whatsapp',
      },
    });
  }
  console.log('✅ 10 Appointments created');

  // ─── 8. FAQ Entries ───────────────────────────────────────────────
  const faqsData = [
    {
      category: 'general',
      questionEn: 'What are the hospital working hours?',
      questionAr: 'ما هي ساعات عمل المستشفى؟',
      answerEn: 'Our hospital operates Sunday to Thursday from 8:00 AM to 10:00 PM, and Friday-Saturday from 4:00 PM to 10:00 PM.',
      answerAr: 'يعمل المستشفى من الأحد إلى الخميس من الساعة ٨ صباحاً حتى ١٠ مساءً، والجمعة والسبت من ٤ مساءً حتى ١٠ مساءً.',
      priority: 10,
    },
    {
      category: 'insurance',
      questionEn: 'Which insurance companies do you accept?',
      questionAr: 'ما هي شركات التأمين المعتمدة لديكم؟',
      answerEn: 'We accept Bupa, Tawuniya, MedGulf, CCHI, and most major Saudi insurance providers.',
      answerAr: 'نقبل بوبا، التعاونية، ميدغلف، مجلس الضمان الصحي، ومعظم شركات التأمين الرئيسية في المملكة.',
      priority: 8,
    },
    {
      category: 'procedures',
      questionEn: 'How can I book an appointment?',
      questionAr: 'كيف يمكنني حجز موعد؟',
      answerEn: 'You can book via WhatsApp, phone call, or our website. Our AI assistant is available 24/7.',
      answerAr: 'يمكنك الحجز عبر الواتساب أو الاتصال الهاتفي أو موقعنا الإلكتروني. مساعدنا الذكي متاح على مدار الساعة.',
      priority: 9,
    },
    {
      category: 'locations',
      questionEn: 'Where are your branches located?',
      questionAr: 'أين تقع فروعكم؟',
      answerEn: 'We have two branches: Main branch in Jazan (King Fahd Street) and Sabya branch (Prince Sultan Street).',
      answerAr: 'لدينا فرعان: الفرع الرئيسي في جازان (شارع الملك فهد) وفرع صبيا (شارع الأمير سلطان).',
      priority: 7,
    },
    {
      category: 'policies',
      questionEn: 'What is your cancellation policy?',
      questionAr: 'ما هي سياسة الإلغاء لديكم؟',
      answerEn: 'Appointments can be cancelled or rescheduled up to 2 hours before the scheduled time at no charge.',
      answerAr: 'يمكن إلغاء أو تعديل المواعيد قبل ساعتين من الموعد المحدد بدون أي رسوم.',
      priority: 6,
    },
  ];

  for (const faq of faqsData) {
    await prisma.faqEntry.create({
      data: { orgId: org.orgId, ...faq },
    });
  }
  console.log('✅ 5 FAQ entries created');

  // ─── 9. Triage Rules ──────────────────────────────────────────────
  await prisma.triageRule.createMany({
    data: [
      {
        orgId: org.orgId,
        keywords: ['ألم صدر', 'ألم في الصدر', 'chest pain', 'ضيق تنفس'],
        severity: 'emergency',
        responseEn: 'This sounds like a potential emergency. Please call 911 or go to the nearest emergency room immediately.',
        responseAr: 'هذا يبدو حالة طوارئ محتملة. يرجى الاتصال بـ ٩١١ أو التوجه لأقرب طوارئ فوراً.',
        action: 'call_emergency',
      },
      {
        orgId: org.orgId,
        keywords: ['حرارة', 'حمى', 'fever', 'سخونة'],
        severity: 'urgent',
        responseEn: 'Fever can indicate an infection. We recommend scheduling an urgent appointment within 24 hours.',
        responseAr: 'الحرارة قد تشير إلى عدوى. ننصح بحجز موعد عاجل خلال ٢٤ ساعة.',
        action: 'schedule_urgent',
      },
      {
        orgId: org.orgId,
        keywords: ['صداع', 'headache', 'وجع رأس'],
        severity: 'routine',
        responseEn: 'For recurring headaches, we recommend scheduling a routine consultation.',
        responseAr: 'للصداع المتكرر، ننصح بحجز موعد استشارة عادي.',
        action: 'schedule_routine',
      },
    ],
  });
  console.log('✅ 3 Triage rules created');

  // ─── 10. SMS Templates ────────────────────────────────────────────
  await prisma.smsTemplate.createMany({
    data: [
      {
        orgId: org.orgId,
        name: 'تأكيد الحجز',
        trigger: 'post_booking',
        bodyEn: 'Dear {{patient_name}}, your appointment with {{doctor_name}} is confirmed for {{date}} at {{time}}. Reply C to cancel.',
        bodyAr: 'عزيزي/عزيزتي {{patient_name}}، تم تأكيد موعدك مع {{doctor_name}} يوم {{date}} الساعة {{time}}. للإلغاء أرسل إلغاء.',
        variables: ['patient_name', 'doctor_name', 'date', 'time'],
        channel: 'both',
      },
      {
        orgId: org.orgId,
        name: 'تذكير قبل ٢٤ ساعة',
        trigger: 'reminder',
        bodyEn: 'Reminder: You have an appointment tomorrow at {{time}} with {{doctor_name}} at {{facility_name}}.',
        bodyAr: 'تذكير: لديك موعد غداً الساعة {{time}} مع {{doctor_name}} في {{facility_name}}.',
        variables: ['patient_name', 'doctor_name', 'time', 'facility_name'],
        channel: 'both',
      },
      {
        orgId: org.orgId,
        name: 'تذكير قبل ساعتين',
        trigger: 'reminder',
        bodyEn: 'Your appointment is in 2 hours! {{doctor_name}} at {{facility_name}}. See you soon!',
        bodyAr: 'موعدك بعد ساعتين! {{doctor_name}} في {{facility_name}}. نراك قريباً!',
        variables: ['patient_name', 'doctor_name', 'facility_name'],
        channel: 'whatsapp',
      },
      {
        orgId: org.orgId,
        name: 'استبيان رضا',
        trigger: 'survey',
        bodyEn: 'How was your visit with {{doctor_name}}? Rate 1-5: {{survey_link}}',
        bodyAr: 'كيف كانت زيارتك مع {{doctor_name}}؟ قيّم من ١-٥: {{survey_link}}',
        variables: ['patient_name', 'doctor_name', 'survey_link'],
        channel: 'sms',
      },
      {
        orgId: org.orgId,
        name: 'رسالة مخصصة',
        trigger: 'custom',
        bodyEn: '{{custom_message}}',
        bodyAr: '{{custom_message}}',
        variables: ['patient_name', 'custom_message'],
        channel: 'both',
      },
    ],
  });
  console.log('✅ 5 SMS templates created');

  // ─── 11. Escalation Rules ─────────────────────────────────────────
  await prisma.escalationRule.createMany({
    data: [
      {
        orgId: org.orgId,
        triggerType: 'sentiment',
        triggerValue: 'angry',
        action: 'transfer',
        targetType: 'agent',
        targetValue: 'supervisor',
        priority: 10,
      },
      {
        orgId: org.orgId,
        triggerType: 'intent',
        triggerValue: 'billing',
        action: 'transfer',
        targetType: 'department',
        targetValue: 'finance',
        priority: 5,
      },
    ],
  });
  console.log('✅ 2 Escalation rules created');

  // ─── 12. Campaign ─────────────────────────────────────────────────
  const campaign = await prisma.campaign.create({
    data: {
      orgId: org.orgId,
      name: 'Recall Campaign - Annual Checkup',
      nameAr: 'حملة استدعاء - الفحص السنوي',
      type: 'recall',
      status: 'draft',
      targetFilter: { lastVisitOlderThanDays: 180 },
      channelSequence: ['voice', 'sms', 'whatsapp'],
      scriptEn: 'Hi {{patient_name}}, it has been a while since your last visit. Would you like to schedule your annual checkup?',
      scriptAr: 'مرحباً {{patient_name}}، مضى وقت على زيارتك الأخيرة. هل ترغب في حجز فحصك السنوي؟',
      maxCallsPerHour: 30,
      targets: {
        create: patients.slice(0, 3).map((p) => ({
          patientId: p.patientId,
          status: 'pending',
        })),
      },
    },
  });
  console.log('✅ 1 Campaign with 3 targets created');

  // ─── 14. Care Gap Rules ───────────────────────────────────────────
  await prisma.careGapRule.createMany({
    data: [
      {
        orgId: org.orgId,
        name: 'Annual Checkup Overdue',
        nameAr: 'فحص سنوي متأخر',
        condition: { lastVisitOlderThanDays: 365, ageMin: 30 },
        priority: 'high',
        action: 'outbound_call',
        messageEn: 'It has been over a year since your last visit. Time for your annual checkup!',
        messageAr: 'مضى أكثر من سنة على زيارتك الأخيرة. حان وقت فحصك السنوي!',
      },
      {
        orgId: org.orgId,
        name: 'Diabetes Follow-up Overdue',
        nameAr: 'متابعة سكري متأخرة',
        condition: { condition: 'diabetes', lastVisitOlderThanDays: 90 },
        priority: 'critical',
        action: 'outbound_call',
        messageEn: 'Your diabetes follow-up is overdue. Please schedule your next appointment.',
        messageAr: 'موعد متابعة السكري متأخر. يرجى حجز موعدك القادم.',
      },
    ],
  });
  console.log('✅ 2 Care gap rules created');

  // ─── 15. Roles ────────────────────────────────────────────────────
  await prisma.role.createMany({
    data: [
      {
        orgId: org.orgId,
        name: 'admin',
        permissions: [
          'patients.read', 'patients.write', 'patients.delete',
          'appointments.read', 'appointments.write', 'appointments.delete',
          'conversations.read', 'conversations.write',
          'providers.read', 'providers.write', 'providers.delete',
          'services.read', 'services.write', 'services.delete',
          'facilities.read', 'facilities.write', 'facilities.delete',
          'campaigns.read', 'campaigns.write', 'campaigns.delete',
          'config.read', 'config.write',
          'analytics.read', 'audit.read',
          'roles.read', 'roles.write',
        ],
        isSystem: true,
      },
      {
        orgId: org.orgId,
        name: 'viewer',
        permissions: [
          'patients.read',
          'appointments.read',
          'conversations.read',
          'providers.read',
          'services.read',
          'facilities.read',
          'campaigns.read',
          'config.read',
          'analytics.read',
        ],
        isSystem: false,
      },
    ],
  });
  console.log('✅ 2 Roles created');

  // ─── 16. Facility Configs ─────────────────────────────────────────
  await prisma.facilityConfig.create({
    data: {
      facilityId: facilityJazan.facilityId,
      greetingEn: 'Welcome to Tawafud Specialist Hospital - Jazan Branch! How can we help you today?',
      greetingAr: 'أهلاً بكم في مستشفى توافد التخصصي - الفرع الرئيسي بجازان! كيف يمكننا مساعدتكم؟',
      businessHours: {
        sun: { open: '08:00', close: '22:00' },
        mon: { open: '08:00', close: '22:00' },
        tue: { open: '08:00', close: '22:00' },
        wed: { open: '08:00', close: '22:00' },
        thu: { open: '08:00', close: '22:00' },
        fri: { open: '16:00', close: '22:00' },
        sat: { open: '16:00', close: '22:00' },
      },
      languages: ['ar', 'en'],
      aiEnabled: true,
      maxWaitSec: 30,
      afterHoursMsg: 'شكراً لتواصلكم. المستشفى مغلق حالياً. ساعات العمل: الأحد-الخميس ٨ص-١٠م، الجمعة والسبت ٤م-١٠م. للطوارئ اتصل ٩١١.',
    },
  });

  await prisma.facilityConfig.create({
    data: {
      facilityId: facilitySabya.facilityId,
      greetingEn: 'Welcome to Tawafud Specialist Hospital - Sabya Branch! How can we assist you?',
      greetingAr: 'أهلاً بكم في مستشفى توافد التخصصي - فرع صبيا! كيف يمكننا خدمتكم؟',
      businessHours: {
        sun: { open: '08:00', close: '20:00' },
        mon: { open: '08:00', close: '20:00' },
        tue: { open: '08:00', close: '20:00' },
        wed: { open: '08:00', close: '20:00' },
        thu: { open: '08:00', close: '20:00' },
        fri: { open: '16:00', close: '20:00' },
        sat: { open: '16:00', close: '20:00' },
      },
      languages: ['ar', 'en'],
      aiEnabled: true,
      maxWaitSec: 45,
      afterHoursMsg: 'شكراً لتواصلكم. فرع صبيا مغلق حالياً. ساعات العمل: الأحد-الخميس ٨ص-٨م، الجمعة والسبت ٤م-٨م. للطوارئ اتصل ٩١١.',
    },
  });
  console.log('✅ 2 Facility configs created');

  // ─── Agent Builder Templates ──────────────────────────────
  await seedFlowTemplates(prisma, org.orgId);

  // ─── Patient Habits: Services, Care Gap Rules, Campaigns, Offers ──
  await seedPatientHabits(prisma, org.orgId);

  console.log('\n🎉 Seeding complete! All data inserted successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
