/**
 * Compare old vs new system prompts side by side.
 * Run: cd backend && npx tsx tests/prompt-comparison.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildSystemPrompt, buildWhatsAppSystemPrompt } from '../src/services/systemPrompt.js';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.org.findFirst();
  if (!org) {
    console.log('No org found in database');
    process.exit(1);
  }

  console.log(`\n=== Organization: ${org.name} (${org.orgId.slice(0, 8)}...) ===\n`);

  // ── OLD prompt (used by web chat) ──
  const oldPrompt = await buildSystemPrompt(prisma, org.orgId);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║            OLD SYSTEM PROMPT (Web Chat)                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(oldPrompt.slice(0, 600));
  console.log(`\n... [${oldPrompt.length} total chars]\n`);

  // ── NEW prompt (used by WhatsApp) ──
  const newPrompt = await buildWhatsAppSystemPrompt(prisma, org.orgId);
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          NEW WHATSAPP PROMPT (Arabic-First)             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(newPrompt.slice(0, 1200));
  console.log(`\n... [${newPrompt.length} total chars]\n`);

  // ── Key differences ──
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                  KEY DIFFERENCES                        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Old prompt length: ${oldPrompt.length} chars`);
  console.log(`New prompt length: ${newPrompt.length} chars`);
  console.log(`Old starts with English: ${oldPrompt.startsWith('You are')}`);
  console.log(`New starts with Arabic:  ${/^[\u0600-\u06FF]/.test(newPrompt.charAt(0)) || newPrompt.startsWith('أنت')}`);
  console.log(`Old has "TEST conversation": ${oldPrompt.includes('TEST conversation')}`);
  console.log(`New has "TEST conversation": ${newPrompt.includes('TEST conversation')}`);
  console.log(`Old has personality section: ${oldPrompt.includes('شخصيتك')}`);
  console.log(`New has personality section: ${newPrompt.includes('شخصيتك')}`);
  console.log(`Old has few-shot examples:  ${oldPrompt.includes('أمثلة على المحادثة')}`);
  console.log(`New has few-shot examples:  ${newPrompt.includes('أمثلة على المحادثة')}`);
  console.log(`Old has vague-request handling: ${oldPrompt.includes('ما يعرف وش يحتاج')}`);
  console.log(`New has vague-request handling: ${newPrompt.includes('ما يعرف وش يحتاج')}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
