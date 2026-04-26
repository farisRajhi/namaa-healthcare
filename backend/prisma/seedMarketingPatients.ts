/**
 * Seed script: Add test patients for marketing feature testing
 * Run: npx tsx prisma/seedMarketingPatients.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Adding marketing test patients...\n');

  // Get existing org — using the "ايار السابع" org with 6 providers
  const org = await prisma.org.findUnique({
    where: { orgId: 'c71faf9b-cc46-48c3-8c87-7a98e5426694' },
  });
  if (!org) {
    console.error('❌ Org not found.');
    process.exit(1);
  }

  // Find the highest existing MRN to continue from
  const lastPatient = await prisma.patient.findFirst({
    where: { orgId: org.orgId, mrn: { startsWith: 'MRN-' } },
    orderBy: { mrn: 'desc' },
  });
  const lastMrn = lastPatient?.mrn ? parseInt(lastPatient.mrn.replace('MRN-', ''), 10) : 5;
  let mrnCounter = lastMrn + 1;

  const patientsData = [
    // Older patients — good for care gap detection (haven't visited recently)
    { firstName: 'خالد', lastName: 'الحربي', sex: 'M', dob: '1955-03-12', phone: '+966551112233', conditions: ['hypertension', 'diabetes'], lastVisitDaysAgo: 180 },
    { firstName: 'هدى', lastName: 'العنزي', sex: 'F', dob: '1962-08-25', phone: '+966552223344', conditions: ['diabetes'], lastVisitDaysAgo: 120 },
    { firstName: 'عبدالله', lastName: 'الشمري', sex: 'M', dob: '1948-11-05', phone: '+966553334455', conditions: ['hypertension', 'heart_disease'], lastVisitDaysAgo: 200 },

    // Middle-aged — targets for preventive campaigns
    { firstName: 'منيرة', lastName: 'القحطاني', sex: 'F', dob: '1980-06-18', phone: '+966554445566', conditions: ['asthma'], lastVisitDaysAgo: 90 },
    { firstName: 'سعود', lastName: 'الزهراني', sex: 'M', dob: '1975-01-22', phone: '+966555556677', conditions: ['obesity'], lastVisitDaysAgo: 150 },
    { firstName: 'ريم', lastName: 'المطيري', sex: 'F', dob: '1983-09-10', phone: '+966556667788', conditions: [], lastVisitDaysAgo: 60 },

    // Young adults — targets for dental/wellness campaigns
    { firstName: 'ياسر', lastName: 'الرشيدي', sex: 'M', dob: '1995-04-30', phone: '+966557778899', conditions: [], lastVisitDaysAgo: 30 },
    { firstName: 'لمى', lastName: 'السبيعي', sex: 'F', dob: '1998-12-14', phone: '+966558889900', conditions: ['allergy'], lastVisitDaysAgo: 45 },
    { firstName: 'تركي', lastName: 'العسيري', sex: 'M', dob: '2000-07-08', phone: '+966559990011', conditions: [], lastVisitDaysAgo: 365 },

    // Parents with children — targets for pediatric campaigns
    { firstName: 'أمل', lastName: 'الخالدي', sex: 'F', dob: '1988-02-20', phone: '+966560001122', conditions: [], lastVisitDaysAgo: 75 },

    // Children — targets for vaccination/checkup reminders
    { firstName: 'ليان', lastName: 'الدوسري', sex: 'F', dob: '2018-05-03', phone: '+966561112233', conditions: [], lastVisitDaysAgo: 100 },
    { firstName: 'عمر', lastName: 'البلوي', sex: 'M', dob: '2020-09-15', phone: '+966562223344', conditions: ['allergy'], lastVisitDaysAgo: 130 },

    // Inactive patients — haven't visited in a long time (re-engagement campaigns)
    { firstName: 'بندر', lastName: 'الجهني', sex: 'M', dob: '1970-10-01', phone: '+966563334455', conditions: ['diabetes', 'hypertension'], lastVisitDaysAgo: 400 },
    { firstName: 'عائشة', lastName: 'الحارثي', sex: 'F', dob: '1965-04-17', phone: '+966564445566', conditions: ['heart_disease'], lastVisitDaysAgo: 350 },
    { firstName: 'فيصل', lastName: 'العمري', sex: 'M', dob: '1992-06-28', phone: '+966565556677', conditions: [], lastVisitDaysAgo: 500 },
  ];

  let created = 0;
  for (const p of patientsData) {
    const mrn = `MRN-${String(mrnCounter++).padStart(3, '0')}`;

    // Check if this phone already exists
    const existing = await prisma.patientContact.findFirst({
      where: { contactValue: p.phone, contactType: 'phone' },
    });
    if (existing) {
      console.log(`  ⏭️  ${p.firstName} ${p.lastName} (${p.phone}) already exists, skipping`);
      continue;
    }

    const patient = await prisma.patient.create({
      data: {
        orgId: org.orgId,
        firstName: p.firstName,
        lastName: p.lastName,
        sex: p.sex,
        dateOfBirth: new Date(p.dob),
        mrn,
      },
    });

    // Phone contact (DB constraint allows only 'phone' and 'email')
    await prisma.patientContact.create({
      data: { patientId: patient.patientId, contactType: 'phone', contactValue: p.phone, isPrimary: true },
    });

    // Create a past appointment to establish "last visit" date
    if (p.lastVisitDaysAgo > 0) {
      const provider = await prisma.provider.findFirst({ where: { orgId: org.orgId } });
      const service = await prisma.service.findFirst({ where: { orgId: org.orgId } });
      if (provider && service) {
        const visitDate = new Date();
        visitDate.setDate(visitDate.getDate() - p.lastVisitDaysAgo);
        visitDate.setHours(10, 0, 0, 0);
        const endDate = new Date(visitDate.getTime() + (service.durationMin ?? 20) * 60000);

        await prisma.appointment.create({
          data: {
            orgId: org.orgId,
            providerId: provider.providerId,
            patientId: patient.patientId,
            serviceId: service.serviceId,
            startTs: visitDate,
            endTs: endDate,
            status: 'completed',
            reason: 'زيارة سابقة',
          },
        });
      }
    }

    created++;
    console.log(`  ✅ ${p.firstName} ${p.lastName} (${mrn}, ${p.phone})`);
  }

  console.log(`\n🎉 Done! ${created} marketing test patients added.`);
  console.log('\nPatient breakdown:');
  console.log('  • 3 elderly with chronic conditions (care gap targets)');
  console.log('  • 3 middle-aged with mixed conditions (preventive campaigns)');
  console.log('  • 3 young adults (wellness/dental campaigns)');
  console.log('  • 1 parent + 2 children (pediatric campaigns)');
  console.log('  • 3 inactive patients (re-engagement campaigns)');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
