/**
 * Multi-turn conversation test with the new WhatsApp prompt.
 * Simulates a 4-turn booking conversation.
 *
 * Run: cd backend && npx tsx tests/multi-turn-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildWhatsAppSystemPrompt } from '../src/services/systemPrompt.js';
import { getLLMService, ChatMessage } from '../src/services/llm.js';

const prisma = new PrismaClient();

const TURNS = [
  'السلام عليكم',
  'أبغى موعد أسنان',
  'أي دكتور عنده موعد بكرا؟',
  'الساعة ١٠ صباحاً',
];

async function main() {
  const org = await prisma.org.findFirst();
  if (!org) { console.log('No org found'); process.exit(1); }

  const llm = getLLMService();
  const prompt = await buildWhatsAppSystemPrompt(prisma, org.orgId);
  const history: ChatMessage[] = [];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MULTI-TURN ARABIC WHATSAPP CONVERSATION`);
  console.log(`  Org: ${org.name}`);
  console.log(`${'═'.repeat(60)}\n`);

  for (let i = 0; i < TURNS.length; i++) {
    const userMsg = TURNS[i];
    history.push({ role: 'user', content: userMsg });

    console.log(`  👤 المريض: ${userMsg}`);

    const response = await llm.chat(history, prompt);
    history.push({ role: 'assistant', content: response });

    // Analyze
    const isGulf = /أبغى|وش|شلون|تبي|أقدر|خلني|يناسبك|عندك|بكرا|زين/.test(response);
    const isMSA = /يمكنني|لديك|الرجاء|نرحب|يسعدنا/.test(response);
    const lines = response.split('\n').filter(l => l.trim()).length;
    const repeatsIntro = i > 0 && (response.includes('أنا توافد') || response.includes('مرحباً بك'));

    console.log(`  🤖 توافد: ${response}`);
    console.log(`     [${isGulf ? 'Gulf' : isMSA ? 'MSA' : 'Neutral'} | ${lines} lines${repeatsIntro ? ' | ⚠️ repeats intro' : ''}]`);
    console.log();
  }

  console.log(`${'═'.repeat(60)}\n`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
