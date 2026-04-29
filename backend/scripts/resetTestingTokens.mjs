// Resets per-conversation and monthly AI usage counters so testing is unblocked.
// Affects EVERY org in the database it points at — only run against a dev or
// dedicated-test DB. Idempotent.
//
// Usage in prod (one-shot via the deploy pattern):
//   docker compose -f docker-compose.prod.yml run --rm --no-deps \
//     -v /opt/tawafud/backend/scripts:/app/cleanup backend \
//     node /app/cleanup/resetTestingTokens.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const conv = await prisma.conversation.updateMany({
    where: { totalTokens: { gt: 0 } },
    data: { totalTokens: 0 },
  });

  const usage = await prisma.aiUsageCounter.updateMany({
    where: { year, month },
    data: {
      responseCount: 0,
      conversationCount: 0,
      promptTokens: BigInt(0),
      completionTokens: BigInt(0),
      totalTokens: BigInt(0),
    },
  });

  console.log(`✅ Reset complete:`);
  console.log(`   • ${conv.count} conversation(s) had per-conversation token caps cleared`);
  console.log(`   • ${usage.count} monthly aiUsageCounter row(s) zeroed for ${year}-${String(month).padStart(2, '0')}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
