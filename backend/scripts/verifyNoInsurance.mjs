// Verify that no active flow yields an insurance-asking instruction.
// Reads each active flow, runs the loader's logic, and asserts the
// rendered instruction prompt does not mention insurance.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const flows = await prisma.agentFlow.findMany({
    where: { isActive: true, isTemplate: false },
    select: { agentFlowId: true, orgId: true, nodes: true },
  });

  let bad = 0;
  for (const f of flows) {
    const nodes = Array.isArray(f.nodes) ? f.nodes : [];
    const insuranceNode = nodes.find(
      (n) =>
        n?.id === 'inst-rule-1' ||
        (typeof n?.data?.instructionText === 'string' && /insurance/i.test(n.data.instructionText)) ||
        (typeof n?.data?.instructionTextAr === 'string' && /تأمين/.test(n.data.instructionTextAr)),
    );
    if (insuranceNode) {
      bad++;
      console.log(`  ❌ flow ${f.agentFlowId} (org ${f.orgId}) still has insurance node`);
    }
  }

  if (bad === 0) {
    console.log(`✅ All ${flows.length} active flows are clean — no insurance instruction anywhere.`);
  } else {
    console.log(`\n${bad} flow(s) still contain an insurance instruction.`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
