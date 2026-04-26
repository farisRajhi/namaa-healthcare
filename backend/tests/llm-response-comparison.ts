/**
 * Direct LLM response comparison: Old prompt vs New WhatsApp prompt.
 * Sends the same Arabic messages and compares AI behavior.
 *
 * Run: cd backend && npx tsx tests/llm-response-comparison.ts
 */
import { PrismaClient } from '@prisma/client';
import { buildSystemPrompt, buildWhatsAppSystemPrompt } from '../src/services/systemPrompt.js';
import { getLLMService } from '../src/services/llm.js';

const prisma = new PrismaClient();

const TEST_MESSAGES = [
  { label: 'Greeting + booking', message: 'السلام عليكم أبغى موعد' },
  { label: 'Vague request', message: 'أبغى موعد بس ما أدري وش أحتاج عندي ألم في ظهري' },
  { label: 'Direct question', message: 'وش المواعيد المتاحة بكرا؟' },
];

function analyzeResponse(response: string) {
  const hasArabic = /[\u0600-\u06FF]/.test(response);
  const hasEnglishSentences = /[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(response);
  const hasUUID = /[0-9a-f]{8}-[0-9a-f]{4}/i.test(response);
  const hasTestLeak = response.includes('TEST') || response.includes('business owner');
  const lineCount = response.split('\n').filter(l => l.trim()).length;
  const warmPhrases = ['حياك', 'الله يعافيك', 'إن شاء الله', 'على راسي', 'الله يشفيك', 'تفضل', 'زين', 'تمام'];
  const warmCount = warmPhrases.filter(p => response.includes(p)).length;
  const isGulf = /أبغى|وش|شلون|تبي|أقدر|خلني|يناسبك|عندك|بكرا/.test(response);
  const isMSA = /يمكنني|لديك|الرجاء|نرحب|يسعدنا|بإمكان/.test(response);

  return {
    arabic: hasArabic,
    englishSentences: hasEnglishSentences,
    uuid: hasUUID,
    testLeak: hasTestLeak,
    lines: lineCount,
    warmCount,
    isGulf,
    isMSA,
    dialect: isGulf && !isMSA ? 'Gulf' : isMSA && !isGulf ? 'MSA' : isGulf && isMSA ? 'Mixed' : 'Neutral',
  };
}

async function main() {
  const org = await prisma.org.findFirst();
  if (!org) { console.log('No org found'); process.exit(1); }

  const llm = getLLMService();
  const oldPrompt = await buildSystemPrompt(prisma, org.orgId);
  const newPrompt = await buildWhatsAppSystemPrompt(prisma, org.orgId);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  LLM RESPONSE COMPARISON: Old vs New WhatsApp Prompt`);
  console.log(`  Org: ${org.name} | Model: ${process.env.LLM_MODEL || 'gemini-2.5-flash'}`);
  console.log(`${'═'.repeat(70)}\n`);

  for (const test of TEST_MESSAGES) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  TEST: ${test.label}`);
    console.log(`  Patient: "${test.message}"`);
    console.log(`${'─'.repeat(70)}`);

    // Old prompt
    try {
      const oldResponse = await llm.chat(
        [{ role: 'user', content: test.message }],
        oldPrompt,
      );
      const oldAnalysis = analyzeResponse(oldResponse);
      console.log(`\n  ┌── OLD PROMPT (English-first) ──`);
      console.log(`  │ ${oldResponse.replace(/\n/g, '\n  │ ')}`);
      console.log(`  │`);
      console.log(`  │ Dialect: ${oldAnalysis.dialect} | Lines: ${oldAnalysis.lines} | Warm phrases: ${oldAnalysis.warmCount}`);
      console.log(`  │ English sentences: ${oldAnalysis.englishSentences} | UUID: ${oldAnalysis.uuid} | TEST leak: ${oldAnalysis.testLeak}`);
      console.log(`  └──`);
    } catch (err: any) {
      console.log(`  OLD PROMPT ERROR: ${err.message}`);
    }

    // New prompt
    try {
      const newResponse = await llm.chat(
        [{ role: 'user', content: test.message }],
        newPrompt,
      );
      const newAnalysis = analyzeResponse(newResponse);
      console.log(`\n  ┌── NEW PROMPT (Arabic-first WhatsApp) ──`);
      console.log(`  │ ${newResponse.replace(/\n/g, '\n  │ ')}`);
      console.log(`  │`);
      console.log(`  │ Dialect: ${newAnalysis.dialect} | Lines: ${newAnalysis.lines} | Warm phrases: ${newAnalysis.warmCount}`);
      console.log(`  │ English sentences: ${newAnalysis.englishSentences} | UUID: ${newAnalysis.uuid} | TEST leak: ${newAnalysis.testLeak}`);
      console.log(`  └──`);
    } catch (err: any) {
      console.log(`  NEW PROMPT ERROR: ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}\n`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
