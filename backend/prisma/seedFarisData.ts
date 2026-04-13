/**
 * Adds cosmetic + dental clinic data to the EXISTING org of fariisuni@gmail.com
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get the actual org for fariisuni
  const user = await prisma.user.findUnique({ where: { email: 'fariisuni@gmail.com' } });
  if (!user) { console.error('❌ User not found'); return; }

  const orgId = user.orgId;
  console.log(`✅ Found user → orgId: ${orgId}`);

  // Get or update org name
  await prisma.org.update({ where: { orgId }, data: { name: 'عيادات الجمال والابتسامة' } });
  console.log('✅ اسم العيادة: عيادات الجمال والابتسامة');

  // ─── Facility ──────────────────────────────────────────────
  let facility = await prisma.facility.findFirst({ where: { orgId } });
  if (!facility) {
    facility = await prisma.facility.create({
      data: {
        orgId,
        name: 'الفرع الرئيسي - الرياض',
        timezone: 'Asia/Riyadh',
        addressLine1: 'شارع الأمير سلطان، حي السليمانية',
        city: 'الرياض',
        region: 'منطقة الرياض',
        postalCode: '12234',
        country: 'SA',
        clinicSlug: 'jamal-riyadh-main',
      },
    });
  }
  console.log('✅ فرع:', facility.name);

  // ─── Departments ───────────────────────────────────────────
  const deptCosmetic = await prisma.department.upsert({
    where: { orgId_name: { orgId, name: 'تجميل' } },
    update: {},
    create: { orgId, name: 'تجميل' },
  });
  // Clean up old dept if different name
  const oldCosmeticDept = await prisma.department.findFirst({ where: { orgId, name: 'تجميل ' } });
  if (oldCosmeticDept && oldCosmeticDept.departmentId !== deptCosmetic.departmentId) {
    await prisma.department.delete({ where: { departmentId: oldCosmeticDept.departmentId } }).catch(() => {});
  }

  const deptDental = await prisma.department.upsert({
    where: { orgId_name: { orgId, name: 'أسنان' } },
    update: {},
    create: { orgId, name: 'أسنان' },
  });
  const oldDentalDept = await prisma.department.findFirst({ where: { orgId, name: 'اسنان' } });
  if (oldDentalDept && oldDentalDept.departmentId !== deptDental.departmentId) {
    await prisma.department.delete({ where: { departmentId: oldDentalDept.departmentId } }).catch(() => {});
  }

  console.log('✅ أقسام: تجميل، أسنان');

  // ─── Providers ─────────────────────────────────────────────
  const sunToThu = [0, 1, 2, 3, 4];
  const morningStart = new Date('2000-01-01T09:00:00');
  const morningEnd = new Date('2000-01-01T13:00:00');
  const afternoonStart = new Date('2000-01-01T16:00:00');
  const afternoonEnd = new Date('2000-01-01T21:00:00');

  // Delete existing providers to avoid duplicates
  const existingProviders = await prisma.provider.findMany({ where: { orgId } });
  for (const ep of existingProviders) {
    await prisma.providerService.deleteMany({ where: { providerId: ep.providerId } });
    await prisma.providerAvailabilityRule.deleteMany({ where: { providerId: ep.providerId } });
  }
  await prisma.provider.deleteMany({ where: { orgId } });

  // Cosmetic
  const drSarah = await prisma.provider.create({
    data: {
      orgId,
      departmentId: deptCosmetic.departmentId,
      facilityId: facility.facilityId,
      displayName: 'د. سارة بنت عبدالله القحطاني',
      credentials: 'استشارية طب تجميل - البورد السعودي',
      availabilityRules: {
        create: sunToThu.flatMap((day) => [
          { dayOfWeek: day, startLocal: morningStart, endLocal: morningEnd, slotIntervalMin: 30 },
          { dayOfWeek: day, startLocal: afternoonStart, endLocal: afternoonEnd, slotIntervalMin: 30 },
        ]),
      },
    },
  });

  const drNora = await prisma.provider.create({
    data: {
      orgId,
      departmentId: deptCosmetic.departmentId,
      facilityId: facility.facilityId,
      displayName: 'د. نورة بنت محمد الشمري',
      credentials: 'أخصائية تجميل وليزر - جامعة الملك سعود',
      availabilityRules: {
        create: sunToThu.map((day) => ({
          dayOfWeek: day,
          startLocal: afternoonStart,
          endLocal: afternoonEnd,
          slotIntervalMin: 30,
        })),
      },
    },
  });

  // Dental
  const drKhaled = await prisma.provider.create({
    data: {
      orgId,
      departmentId: deptDental.departmentId,
      facilityId: facility.facilityId,
      displayName: 'د. خالد بن أحمد العتيبي',
      credentials: 'استشاري تقويم أسنان - البورد الأمريكي',
      availabilityRules: {
        create: sunToThu.flatMap((day) => [
          { dayOfWeek: day, startLocal: morningStart, endLocal: morningEnd, slotIntervalMin: 20 },
          { dayOfWeek: day, startLocal: afternoonStart, endLocal: afternoonEnd, slotIntervalMin: 20 },
        ]),
      },
    },
  });

  const drMaha = await prisma.provider.create({
    data: {
      orgId,
      departmentId: deptDental.departmentId,
      facilityId: facility.facilityId,
      displayName: 'د. مها بنت سعد الدوسري',
      credentials: 'أخصائية تجميل أسنان وتبييض - جامعة الملك عبدالعزيز',
      availabilityRules: {
        create: sunToThu.map((day) => ({
          dayOfWeek: day,
          startLocal: morningStart,
          endLocal: morningEnd,
          slotIntervalMin: 20,
        })),
      },
    },
  });

  const drFaisal = await prisma.provider.create({
    data: {
      orgId,
      departmentId: deptDental.departmentId,
      facilityId: facility.facilityId,
      displayName: 'د. فيصل بن عبدالرحمن الحربي',
      credentials: 'استشاري جراحة فم وأسنان - الزمالة البريطانية',
      availabilityRules: {
        create: sunToThu.flatMap((day) => [
          { dayOfWeek: day, startLocal: morningStart, endLocal: morningEnd, slotIntervalMin: 30 },
          { dayOfWeek: day, startLocal: afternoonStart, endLocal: afternoonEnd, slotIntervalMin: 30 },
        ]),
      },
    },
  });

  console.log('✅ أطباء: 2 تجميل + 3 أسنان');

  // ─── Services ──────────────────────────────────────────────
  // Delete existing services for this org
  await prisma.service.deleteMany({ where: { orgId } });

  // Cosmetic
  const svcBotox = await prisma.service.create({ data: { orgId, name: 'حقن بوتوكس', nameEn: 'Botox Injection', durationMin: 30, bufferAfterMin: 10, category: 'تجميل' } });
  const svcFiller = await prisma.service.create({ data: { orgId, name: 'حقن فيلر', nameEn: 'Filler Injection', durationMin: 45, bufferAfterMin: 10, category: 'تجميل' } });
  const svcLaser = await prisma.service.create({ data: { orgId, name: 'جلسة ليزر', nameEn: 'Laser Session', durationMin: 60, bufferAfterMin: 15, category: 'تجميل', isRepeating: true, repeatCycleDays: 30 } });
  const svcSkinCare = await prisma.service.create({ data: { orgId, name: 'تنظيف بشرة عميق', nameEn: 'Deep Skin Cleansing', durationMin: 45, bufferAfterMin: 10, category: 'تجميل', isRepeating: true, repeatCycleDays: 21 } });
  const svcChemPeel = await prisma.service.create({ data: { orgId, name: 'تقشير كيميائي', nameEn: 'Chemical Peel', durationMin: 40, bufferAfterMin: 10, category: 'تجميل' } });
  const svcMeso = await prisma.service.create({ data: { orgId, name: 'ميزوثيرابي للوجه', nameEn: 'Face Mesotherapy', durationMin: 30, bufferAfterMin: 10, category: 'تجميل' } });
  const svcConsultCos = await prisma.service.create({ data: { orgId, name: 'استشارة تجميل', nameEn: 'Cosmetic Consultation', durationMin: 20, category: 'تجميل' } });

  // Dental
  const svcClean = await prisma.service.create({ data: { orgId, name: 'تنظيف أسنان', nameEn: 'Teeth Cleaning', durationMin: 30, bufferAfterMin: 5, category: 'أسنان', isRepeating: true, repeatCycleDays: 180 } });
  const svcWhiten = await prisma.service.create({ data: { orgId, name: 'تبييض أسنان', nameEn: 'Teeth Whitening', durationMin: 60, bufferAfterMin: 10, category: 'أسنان' } });
  const svcFilling = await prisma.service.create({ data: { orgId, name: 'حشوة تجميلية', nameEn: 'Cosmetic Filling', durationMin: 40, bufferAfterMin: 10, category: 'أسنان' } });
  const svcBraces = await prisma.service.create({ data: { orgId, name: 'تقويم أسنان - متابعة', nameEn: 'Orthodontic Follow-up', durationMin: 20, category: 'أسنان', isRepeating: true, repeatCycleDays: 30 } });
  const svcBracesConsult = await prisma.service.create({ data: { orgId, name: 'استشارة تقويم أسنان', nameEn: 'Orthodontic Consultation', durationMin: 30, category: 'أسنان' } });
  const svcVeneer = await prisma.service.create({ data: { orgId, name: 'ابتسامة هوليوود (فينير)', nameEn: 'Hollywood Smile (Veneers)', durationMin: 60, bufferAfterMin: 15, category: 'أسنان' } });
  const svcExtract = await prisma.service.create({ data: { orgId, name: 'خلع ضرس', nameEn: 'Tooth Extraction', durationMin: 30, bufferAfterMin: 15, category: 'أسنان' } });
  const svcWisdom = await prisma.service.create({ data: { orgId, name: 'خلع ضرس عقل', nameEn: 'Wisdom Tooth Extraction', durationMin: 45, bufferAfterMin: 20, category: 'أسنان' } });
  const svcImplant = await prisma.service.create({ data: { orgId, name: 'زراعة أسنان', nameEn: 'Dental Implant', durationMin: 60, bufferAfterMin: 15, category: 'أسنان' } });
  const svcRootCanal = await prisma.service.create({ data: { orgId, name: 'علاج عصب', nameEn: 'Root Canal Treatment', durationMin: 60, bufferAfterMin: 10, category: 'أسنان' } });
  const svcCheckup = await prisma.service.create({ data: { orgId, name: 'كشف أسنان', nameEn: 'Dental Checkup', durationMin: 20, category: 'أسنان' } });

  console.log('✅ خدمات: 7 تجميل + 10 أسنان');

  // ─── Provider ↔ Service Links ──────────────────────────────
  const links: { providerId: string; serviceId: string }[] = [
    // Dr Sarah — all cosmetic
    ...[svcBotox, svcFiller, svcLaser, svcSkinCare, svcChemPeel, svcMeso, svcConsultCos].map(s => ({ providerId: drSarah.providerId, serviceId: s.serviceId })),
    // Dr Nora — laser, skincare, peel, meso, consult
    ...[svcLaser, svcSkinCare, svcChemPeel, svcMeso, svcConsultCos].map(s => ({ providerId: drNora.providerId, serviceId: s.serviceId })),
    // Dr Khaled — braces, consult, veneers, clean, checkup
    ...[svcBraces, svcBracesConsult, svcVeneer, svcClean, svcCheckup].map(s => ({ providerId: drKhaled.providerId, serviceId: s.serviceId })),
    // Dr Maha — whitening, clean, filling, veneers, checkup
    ...[svcWhiten, svcClean, svcFilling, svcVeneer, svcCheckup].map(s => ({ providerId: drMaha.providerId, serviceId: s.serviceId })),
    // Dr Faisal — extraction, wisdom, implant, root canal, checkup
    ...[svcExtract, svcWisdom, svcImplant, svcRootCanal, svcCheckup].map(s => ({ providerId: drFaisal.providerId, serviceId: s.serviceId })),
  ];

  for (const link of links) {
    await prisma.providerService.create({ data: link });
  }
  console.log(`✅ ربط أطباء بخدمات: ${links.length} رابط`);

  // ─── Sample Patients ───────────────────────────────────────
  // Delete existing patients for clean state
  await prisma.appointment.deleteMany({ where: { orgId } });
  await prisma.patientContact.deleteMany({
    where: { patient: { orgId } },
  });
  await prisma.patient.deleteMany({ where: { orgId } });

  const patient1 = await prisma.patient.create({
    data: {
      orgId,
      firstName: 'أمل',
      lastName: 'الغامدي',
      dateOfBirth: new Date('1990-05-15'),
      sex: 'female',
      contacts: { create: [{ contactType: 'phone', contactValue: '+966551234567', isPrimary: true }] },
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      orgId,
      firstName: 'محمد',
      lastName: 'العنزي',
      dateOfBirth: new Date('1985-11-20'),
      sex: 'male',
      contacts: { create: [{ contactType: 'phone', contactValue: '+966559876543', isPrimary: true }] },
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      orgId,
      firstName: 'نوف',
      lastName: 'الشهري',
      dateOfBirth: new Date('1995-03-08'),
      sex: 'female',
      contacts: { create: [{ contactType: 'phone', contactValue: '+966501112233', isPrimary: true }] },
    },
  });

  console.log('✅ مرضى: أمل، محمد، نوف');

  // ─── Sample Appointments ───────────────────────────────────
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7);
  const lastWeek = new Date(now); lastWeek.setDate(now.getDate() - 7);

  function slot(base: Date, hour: number, min: number): Date {
    const d = new Date(base); d.setHours(hour, min, 0, 0); return d;
  }
  function addMin(d: Date, mins: number): Date {
    return new Date(d.getTime() + mins * 60000);
  }

  await prisma.appointment.create({
    data: {
      orgId, facilityId: facility.facilityId, departmentId: deptCosmetic.departmentId,
      providerId: drSarah.providerId, patientId: patient1.patientId, serviceId: svcConsultCos.serviceId,
      startTs: slot(lastWeek, 10, 0), endTs: addMin(slot(lastWeek, 10, 0), 20),
      status: 'completed', bookedVia: 'whatsapp', reason: 'استشارة بوتوكس',
    },
  });

  await prisma.appointment.create({
    data: {
      orgId, facilityId: facility.facilityId, departmentId: deptCosmetic.departmentId,
      providerId: drSarah.providerId, patientId: patient1.patientId, serviceId: svcBotox.serviceId,
      startTs: slot(tomorrow, 10, 0), endTs: addMin(slot(tomorrow, 10, 0), 30),
      status: 'booked', bookedVia: 'whatsapp', reason: 'حقن بوتوكس - جبين',
    },
  });

  await prisma.appointment.create({
    data: {
      orgId, facilityId: facility.facilityId, departmentId: deptDental.departmentId,
      providerId: drKhaled.providerId, patientId: patient2.patientId, serviceId: svcCheckup.serviceId,
      startTs: slot(nextWeek, 9, 0), endTs: addMin(slot(nextWeek, 9, 0), 20),
      status: 'booked', bookedVia: 'api', reason: 'استشارة تقويم',
    },
  });

  console.log('✅ مواعيد: 3 (1 مكتمل + 2 قادمة)');

  console.log('\n🎉 تم إعداد بيانات العيادة بنجاح!');
}

main().catch(e => { console.error('❌', e); process.exit(1); }).finally(() => prisma.$disconnect());
