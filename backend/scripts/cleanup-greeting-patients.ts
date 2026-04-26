/**
 * One-off cleanup: remove Patient rows where the name is actually a greeting,
 * plus anything linked to a specific phone number. Local dev only.
 *
 * Usage:
 *   npx tsx scripts/cleanup-greeting-patients.ts            # dry-run (counts only)
 *   npx tsx scripts/cleanup-greeting-patients.ts --apply    # actually delete
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const PHONE_VARIANTS = ['+966507434470', '966507434470', '0507434470'];

const GREETING_TOKENS = [
  'السلام', 'سلام', 'عليكم', 'وعليكم',
  'مرحبا', 'مرحبًا', 'أهلا', 'أهلاً', 'اهلا',
  'هلا', 'حياك', 'صباح', 'مساء', 'الخير', 'النور',
];

function stripDiacritics(s: string): string {
  return s.replace(/[\u064B-\u065F\u0640]/g, '').trim();
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will delete)' : 'DRY RUN (counts only)'}`);

  // 1. Patients via phone contact
  const phoneContacts = await prisma.patientContact.findMany({
    where: { contactType: 'phone', contactValue: { in: PHONE_VARIANTS } },
    select: { patientId: true, contactValue: true },
  });
  const phonePatientIds = new Set(phoneContacts.map((c) => c.patientId));

  // 2. Patients with greeting-shaped names (load all, filter in JS to handle diacritics)
  const allPatients = await prisma.patient.findMany({
    select: { patientId: true, firstName: true, lastName: true, orgId: true },
  });
  const greetingPatientIds = new Set<string>();
  const greetingHits: { patientId: string; firstName: string; lastName: string; orgId: string }[] = [];
  for (const p of allPatients) {
    const fn = stripDiacritics(p.firstName || '');
    const ln = stripDiacritics(p.lastName || '');
    if (GREETING_TOKENS.includes(fn) || GREETING_TOKENS.includes(ln)) {
      greetingPatientIds.add(p.patientId);
      greetingHits.push(p);
    }
  }

  const allTargetIds = new Set<string>([...phonePatientIds, ...greetingPatientIds]);
  console.log(`\n— Targets —`);
  console.log(`Patients matched by phone (${PHONE_VARIANTS.join(', ')}): ${phonePatientIds.size}`);
  console.log(`Patients matched by greeting name: ${greetingPatientIds.size}`);
  console.log(`Total unique patients to remove: ${allTargetIds.size}`);

  if (greetingHits.length) {
    console.log(`\n— Greeting-name patients —`);
    for (const p of greetingHits) {
      console.log(`  ${p.patientId}  org=${p.orgId}  "${p.firstName} ${p.lastName}"`);
    }
  }

  if (allTargetIds.size === 0) {
    console.log('\nNothing to delete. Exiting.');
    return;
  }

  const patientIds = [...allTargetIds];

  // MessagingUsers tied to the phone (WhatsApp guest sessions)
  const messagingUsers = await prisma.messagingUser.findMany({
    where: {
      OR: [
        { phoneE164: { in: PHONE_VARIANTS } },
        { externalUserId: { in: PHONE_VARIANTS } },
        ...PHONE_VARIANTS.map((p) => ({ externalUserId: { contains: p.replace(/^\+/, '') } })),
      ],
    },
    select: { messagingUserId: true, externalUserId: true, phoneE164: true },
  });
  const messagingUserIds = messagingUsers.map((u) => u.messagingUserId);

  // Conversations: by patientId OR by messagingUser OR by externalThreadId containing the phone
  const convosByPatient = patientIds.length
    ? await prisma.conversation.findMany({
        where: { patientId: { in: patientIds } },
        select: { conversationId: true },
      })
    : [];
  const convosByMessagingUser = messagingUserIds.length
    ? await prisma.conversation.findMany({
        where: { messagingUserId: { in: messagingUserIds } },
        select: { conversationId: true },
      })
    : [];
  const convosByThread = await prisma.conversation.findMany({
    where: {
      OR: PHONE_VARIANTS.map((p) => ({
        externalThreadId: { contains: p.replace(/^\+/, '') },
      })),
    },
    select: { conversationId: true },
  });
  const convoIds = [
    ...new Set(
      [...convosByPatient, ...convosByMessagingUser, ...convosByThread].map((c) => c.conversationId),
    ),
  ];

  // Counts of dependent rows
  const apptCount = await prisma.appointment.count({ where: { patientId: { in: patientIds } } });
  const msgCount = convoIds.length
    ? await prisma.conversationMessage.count({ where: { conversationId: { in: convoIds } } })
    : 0;
  const contactCount = await prisma.patientContact.count({ where: { patientId: { in: patientIds } } });

  console.log(`\n— Dependent rows —`);
  console.log(`Appointments:          ${apptCount}`);
  console.log(`MessagingUsers:        ${messagingUserIds.length}`);
  console.log(`Conversations:         ${convoIds.length}`);
  console.log(`Conversation messages: ${msgCount}`);
  console.log(`Patient contacts:      ${contactCount}`);

  if (!APPLY) {
    console.log('\n(dry-run) Re-run with --apply to actually delete.');
    return;
  }

  console.log('\nApplying deletes…');
  await prisma.$transaction(async (tx) => {
    if (convoIds.length) {
      const m = await tx.conversationMessage.deleteMany({ where: { conversationId: { in: convoIds } } });
      console.log(`  deleted ${m.count} conversation messages`);
      const c = await tx.conversation.deleteMany({ where: { conversationId: { in: convoIds } } });
      console.log(`  deleted ${c.count} conversations`);
    }
    if (patientIds.length) {
      const a = await tx.appointment.deleteMany({ where: { patientId: { in: patientIds } } });
      console.log(`  deleted ${a.count} appointments`);
      const ct = await tx.patientContact.deleteMany({ where: { patientId: { in: patientIds } } });
      console.log(`  deleted ${ct.count} patient contacts`);
      const p = await tx.patient.deleteMany({ where: { patientId: { in: patientIds } } });
      console.log(`  deleted ${p.count} patients`);
    }
    if (messagingUserIds.length) {
      const mu = await tx.messagingUser.deleteMany({ where: { messagingUserId: { in: messagingUserIds } } });
      console.log(`  deleted ${mu.count} messaging users`);
    }
  });

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
