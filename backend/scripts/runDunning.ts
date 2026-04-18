/**
 * Manually trigger one dunning pass. Useful for testing renewals end-to-end
 * without waiting for the 4:30 AM Asia/Riyadh cron.
 *
 * Usage: npm run billing:run-dunning
 */

import { PrismaClient } from '@prisma/client';
import { runDunning } from '../src/services/billing/dunning.js';

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await runDunning(prisma);
    console.log('Dunning result:', result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
