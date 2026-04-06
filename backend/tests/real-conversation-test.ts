/**
 * Simulates the EXACT real conversation from the user's WhatsApp test.
 * Tests the improved prompt against the same message sequence.
 *
 * Run: cd backend && npx tsx tests/real-conversation-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildWhatsAppSystemPrompt } from '../src/services/systemPrompt.js';
import { getLLMService, ChatMessage } from '../src/services/llm.js';

const prisma = new PrismaClient();

const TURNS = [
  'السلام عليكم',
  'ابغى احجز موعد',
  'اسنان',
  'تم',          // Patient confirms the day — AI should show times, not ask "what time?"
  '9',            // Patient picks 9:00
  'فارس محمد',   // Patient gives name only (phone should be auto from WhatsApp)
  'ايوه',         // Final confirmation
];

async function main() {
  const org = await prisma.org.findFirst();
  if (!org) { console.log('No org found'); process.exit(1); }

  const llm = getLLMService();
  const basePrompt = await buildWhatsAppSystemPrompt(prisma, org.orgId);

  // Simulate phone number injection (like buildContext does for WhatsApp)
  const phone = '+966501234567';
  const prompt = basePrompt + `\n## رقم جوال المريض (من الواتساب)\n- رقم الجوال: ${phone}\n- **لا تسألي المريض عن رقم جواله** — عندك رقمه من الواتساب\n- عند استخدام book_appointment_guest، استخدمي هذا الرقم مباشرة\n- اطلبي فقط الاسم الأول والأخير\n`;

  const history: ChatMessage[] = [];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  REAL CONVERSATION REPLAY (Improved Prompt)`);
  console.log(`  Org: ${org.name} | Phone: ${phone}`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let i = 0; i < TURNS.length; i++) {
    const userMsg = TURNS[i];
    history.push({ role: 'user', content: userMsg });

    console.log(`  👤 [${i + 1}] ${userMsg}`);

    const response = await llm.chat(history, prompt);
    history.push({ role: 'assistant', content: response });

    // Check for issues
    const issues: string[] = [];
    if (i > 0 && (response.includes('وعليكم السلام') || response.includes('حياك الله في'))) {
      issues.push('⚠️ REPEATED GREETING');
    }
    if (response.includes('رقم الجوال') || response.includes('رقم جوالك') || response.includes('phone')) {
      issues.push('⚠️ ASKED FOR PHONE (should use WhatsApp number)');
    }
    if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(response)) {
      issues.push('⚠️ UUID LEAKED');
    }
    if (response.includes('TEST') || response.includes('business owner')) {
      issues.push('⚠️ TEST MODE LEAK');
    }

    const lines = response.split('\n').filter(l => l.trim()).length;
    console.log(`  🤖 ${response.replace(/\n/g, '\n     ')}`);
    if (issues.length > 0) {
      console.log(`     ${issues.join(' | ')}`);
    }
    console.log(`     [${lines} lines]`);
    console.log();
  }

  console.log(`${'═'.repeat(60)}\n`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
