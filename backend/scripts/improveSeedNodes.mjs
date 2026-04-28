// Idempotent: brings existing agent_flows rows in line with the improved
// seed template:
//   • inst-greeting → replace canned verbatim text with guidance that
//     tells the LLM to weave the clinic name into a single natural reply.
//   • inst-rule-2 (Working Hours) → remove. Real schedule already comes
//     from clinic data via systemPrompt → getClinicSchedule.
//   • inst-rule-1 (Insurance) → remove if still present (covered by the
//     earlier removeInsuranceRule.mjs but kept here for completeness).
//
// Run inside the backend container so DATABASE_URL is the env's:
//   docker compose -f docker-compose.prod.yml run --rm --no-deps \
//     -v /opt/tawafud/backend/scripts:/app/cleanup backend \
//     node /app/cleanup/improveSeedNodes.mjs
//
// Locally:
//   cd backend && node scripts/improveSeedNodes.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEW_GREETING_EN =
  'On the first reply of a new conversation, greet the patient warmly and mention the clinic name (available in the system context). Keep the greeting to one short, natural sentence inside the same reply — do not send it as a separate message before answering the patient.';
const NEW_GREETING_AR =
  'في أول رد بالمحادثة، رحّب بالمريض بشكل ودود واذكر اسم العيادة (متاح في سياق النظام). اجعل الترحيب جملة واحدة قصيرة ضمن نفس الردّ، لا تفصله في رسالة منفصلة قبل الإجابة على سؤال المريض.';

const REMOVE_NODE_IDS = new Set(['inst-rule-1', 'inst-rule-2']);

function transform(nodes) {
  let changed = false;
  const out = [];
  for (const n of nodes) {
    if (!n) continue;
    if (REMOVE_NODE_IDS.has(n?.id)) {
      changed = true;
      continue;
    }
    if (n?.id === 'inst-greeting' && n?.data) {
      const before = JSON.stringify(n.data);
      n.data = {
        ...n.data,
        instructionText: NEW_GREETING_EN,
        instructionTextAr: NEW_GREETING_AR,
      };
      if (JSON.stringify(n.data) !== before) changed = true;
    }
    out.push(n);
  }
  return { nodes: out, changed };
}

async function main() {
  const rows = await prisma.agentFlow.findMany({
    select: { agentFlowId: true, name: true, isActive: true, isTemplate: true, nodes: true },
  });

  let updated = 0;
  for (const row of rows) {
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    const { nodes: nextNodes, changed } = transform(nodes);
    if (!changed) continue;
    await prisma.agentFlow.update({
      where: { agentFlowId: row.agentFlowId },
      data: { nodes: nextNodes },
    });
    updated++;
    console.log(
      `  ✏️  ${row.name} (${row.agentFlowId}) — improved [active=${row.isActive}, template=${row.isTemplate}]`,
    );
  }

  console.log(`\nDone. Updated ${updated}/${rows.length} flow row(s).`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
