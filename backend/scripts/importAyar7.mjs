// One-off import: populates the Ayar 7 clinic's setup (departments, services,
// providers, provider→service links) for org 8f67be90-fb0e-47dd-9459-80d133e71407.
// Source: https://ayar7.taqar.app/index.html
// Idempotent — safe to re-run.

import { PrismaClient } from '@prisma/client';

const ORG_ID = '8f67be90-fb0e-47dd-9459-80d133e71407';
const DEFAULT_DURATION_MIN = 30;

const DEPARTMENTS = [
  'قسم الأسنان',
  'قسم الجلدية',
  'قسم التجميل',
  'قسم الليزر',
  'التغذية والسمنة',
  'الطب النفسي',
  'النساء والولادة',
  'العلاج الطبيعي',
];

const SERVICES = [
  { dept: 'قسم الأسنان',     name: 'تقويم الأسنان',              nameEn: 'Orthodontics' },
  { dept: 'قسم الأسنان',     name: 'زراعة الأسنان',              nameEn: 'Dental Implants' },
  { dept: 'قسم الأسنان',     name: 'أسنان الأطفال',              nameEn: 'Pediatric Dentistry' },
  { dept: 'قسم الأسنان',     name: 'تجميل وتركيبات الأسنان',     nameEn: 'Cosmetic Dentistry & Prosthodontics' },
  { dept: 'قسم الأسنان',     name: 'علاج الجذور',                nameEn: 'Root Canal' },
  { dept: 'قسم الأسنان',     name: 'حشوات وتبييض الأسنان',       nameEn: 'Fillings & Teeth Whitening' },
  { dept: 'قسم الجلدية',     name: 'علاج مشاكل البشرة والشعر',   nameEn: 'Skin & Hair Treatment' },
  { dept: 'قسم الجلدية',     name: 'علاج حب الشباب',             nameEn: 'Acne Treatment' },
  { dept: 'قسم الجلدية',     name: 'علاجات متقدمة للبشرة',       nameEn: 'Advanced Skin Treatments' },
  { dept: 'قسم التجميل',     name: 'جراحة تجميل وترميم',         nameEn: 'Plastic & Reconstructive Surgery' },
  { dept: 'قسم التجميل',     name: 'إجراءات تجميل غير جراحية',   nameEn: 'Non-surgical Cosmetic Procedures' },
  { dept: 'قسم التجميل',     name: 'حقن وفيلر',                  nameEn: 'Injections & Fillers' },
  { dept: 'قسم الليزر',      name: 'إزالة الشعر بالليزر',        nameEn: 'Laser Hair Removal' },
  { dept: 'قسم الليزر',      name: 'ليزر كربوني للحواجب',        nameEn: 'Carbon Laser for Brows' },
  { dept: 'قسم الليزر',      name: 'ليزر الوجه والجسم',          nameEn: 'Face & Body Laser' },
  { dept: 'قسم الليزر',      name: 'تقنيات الليزر المتقدمة',     nameEn: 'Advanced Laser Techniques' },
  { dept: 'التغذية والسمنة', name: 'برامج تغذية علاجية',         nameEn: 'Therapeutic Nutrition Programs' },
  { dept: 'التغذية والسمنة', name: 'برامج إنقاص الوزن',          nameEn: 'Weight Loss Programs' },
  { dept: 'التغذية والسمنة', name: 'متابعة وعلاج السمنة',        nameEn: 'Obesity Treatment & Follow-up' },
  { dept: 'الطب النفسي',     name: 'استشارات نفسية',             nameEn: 'Psychiatric Consultations' },
  { dept: 'الطب النفسي',     name: 'جلسات علاج نفسي',            nameEn: 'Therapy Sessions' },
  { dept: 'النساء والولادة', name: 'متابعة الحمل',               nameEn: 'Pregnancy Follow-up' },
  { dept: 'النساء والولادة', name: 'خدمات نسائية متخصصة',        nameEn: "Specialized Women's Services" },
  { dept: 'العلاج الطبيعي',  name: 'جلسات علاج طبيعي',           nameEn: 'Physical Therapy Sessions' },
  { dept: 'العلاج الطبيعي',  name: 'إعادة تأهيل',                nameEn: 'Rehabilitation' },
];

const DOCTORS = [
  {
    displayName: 'د. علاء حكمي',
    credentials: 'استشاري جراح تجميل وترميم',
    dept: 'قسم التجميل',
    services: ['جراحة تجميل وترميم', 'إجراءات تجميل غير جراحية', 'حقن وفيلر'],
  },
  {
    displayName: 'د. أحمد عبدالرحيم',
    credentials: 'استشاري تركيبات وتجميل أسنان',
    dept: 'قسم الأسنان',
    services: ['تجميل وتركيبات الأسنان', 'حشوات وتبييض الأسنان'],
  },
  {
    displayName: 'د. علي مكرمي',
    credentials: 'استشاري جراحة وزراعة أسنان',
    dept: 'قسم الأسنان',
    services: ['زراعة الأسنان', 'علاج الجذور'],
  },
  {
    displayName: 'د. جزويف توماس',
    credentials: 'أخصائي أسنان أطفال',
    dept: 'قسم الأسنان',
    services: ['أسنان الأطفال'],
  },
  {
    displayName: 'د. بسمة هتان',
    credentials: 'طب الأسنان والتقويم',
    dept: 'قسم الأسنان',
    services: ['تقويم الأسنان', 'حشوات وتبييض الأسنان'],
  },
  {
    displayName: 'د. إيمان يونس',
    credentials: 'أخصائية جلدية وتجميل وليزر',
    dept: 'قسم الجلدية',
    services: [
      'علاج مشاكل البشرة والشعر',
      'علاج حب الشباب',
      'علاجات متقدمة للبشرة',
      'حقن وفيلر',
      'إزالة الشعر بالليزر',
      'ليزر كربوني للحواجب',
      'ليزر الوجه والجسم',
      'تقنيات الليزر المتقدمة',
    ],
  },
  {
    displayName: 'د. لؤي النجمي',
    credentials: 'طب وجراحة الفم والأسنان',
    dept: 'قسم الأسنان',
    services: ['علاج الجذور', 'زراعة الأسنان', 'حشوات وتبييض الأسنان'],
  },
];

const prisma = new PrismaClient();

async function main() {
  // 1) Departments — upsert by (orgId, name)
  const deptIdByName = {};
  for (const name of DEPARTMENTS) {
    const d = await prisma.department.upsert({
      where: { orgId_name: { orgId: ORG_ID, name } },
      update: {},
      create: { orgId: ORG_ID, name },
    });
    deptIdByName[name] = d.departmentId;
  }
  console.log(`Departments ready: ${Object.keys(deptIdByName).length}`);

  // 2) Services — upsert by (orgId, name)
  const serviceIdByName = {};
  for (const s of SERVICES) {
    const svc = await prisma.service.upsert({
      where: { orgId_name: { orgId: ORG_ID, name: s.name } },
      update: { nameEn: s.nameEn },
      create: {
        orgId: ORG_ID,
        name: s.name,
        nameEn: s.nameEn,
        durationMin: DEFAULT_DURATION_MIN,
      },
    });
    serviceIdByName[s.name] = svc.serviceId;
  }
  console.log(`Services ready:    ${Object.keys(serviceIdByName).length}`);

  // 3) Providers — findFirst then create (no unique on displayName)
  let providersCreated = 0;
  let providersExisting = 0;
  const providerIdByName = {};
  for (const doc of DOCTORS) {
    const departmentId = deptIdByName[doc.dept];
    if (!departmentId) throw new Error(`Missing department for ${doc.displayName}: ${doc.dept}`);

    const existing = await prisma.provider.findFirst({
      where: { orgId: ORG_ID, displayName: doc.displayName },
    });
    if (existing) {
      providerIdByName[doc.displayName] = existing.providerId;
      providersExisting++;
      continue;
    }
    const created = await prisma.provider.create({
      data: {
        orgId: ORG_ID,
        displayName: doc.displayName,
        credentials: doc.credentials,
        departmentId,
        active: true,
      },
    });
    providerIdByName[doc.displayName] = created.providerId;
    providersCreated++;
  }
  console.log(`Providers:         created=${providersCreated} existing=${providersExisting}`);

  // 4) ProviderService links — createMany with skipDuplicates (composite PK is idempotent)
  const links = [];
  for (const doc of DOCTORS) {
    const providerId = providerIdByName[doc.displayName];
    for (const svcName of doc.services) {
      const serviceId = serviceIdByName[svcName];
      if (!serviceId) throw new Error(`Missing service "${svcName}" for ${doc.displayName}`);
      links.push({ providerId, serviceId });
    }
  }
  const linkResult = await prisma.providerService.createMany({
    data: links,
    skipDuplicates: true,
  });
  console.log(`Provider-services: requested=${links.length} created=${linkResult.count}`);

  // 5) Final summary
  const [deptCount, svcCount, provCount, linkCount] = await Promise.all([
    prisma.department.count({ where: { orgId: ORG_ID } }),
    prisma.service.count({ where: { orgId: ORG_ID } }),
    prisma.provider.count({ where: { orgId: ORG_ID } }),
    prisma.providerService.count({
      where: { provider: { orgId: ORG_ID } },
    }),
  ]);
  console.log('\n=== Final state for org ===');
  console.log(`orgId:             ${ORG_ID}`);
  console.log(`departments:       ${deptCount}`);
  console.log(`services:          ${svcCount}`);
  console.log(`providers:         ${provCount}`);
  console.log(`provider-services: ${linkCount}`);
}

main()
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
