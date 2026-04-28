// One-shot: strip the seeded "Business Rule: Insurance" INSTRUCTION node
// (id: inst-rule-1) from every agent_flows row.
//
// Run with: cd backend && node scripts/removeInsuranceRule.mjs
//
// Safe to re-run — rows without the node are skipped.
// Touches the database whose connection string is in backend/.env (DATABASE_URL).
// Run against production only after verifying locally.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.agentFlow.findMany({
    select: { agentFlowId: true, name: true, isActive: true, isTemplate: true, nodes: true },
  });

  let stripped = 0;
  for (const row of rows) {
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    const before = nodes.length;
    const after = nodes.filter((n) => n?.id !== 'inst-rule-1');
    if (after.length !== before) {
      await prisma.agentFlow.update({
        where: { agentFlowId: row.agentFlowId },
        data: { nodes: after },
      });
      stripped++;
      console.log(
        `  ✂️  ${row.name} (${row.agentFlowId}) — removed inst-rule-1 [active=${row.isActive}, template=${row.isTemplate}]`,
      );
    }
  }

  console.log(`\nDone. Stripped inst-rule-1 from ${stripped}/${rows.length} flow row(s).`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
