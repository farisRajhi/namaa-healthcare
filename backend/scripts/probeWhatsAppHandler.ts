/**
 * Diagnostic: invoke WhatsAppHandler.handleIncoming with skipSend=true against
 * the real org/conversation that has been failing, and print the exception.
 *
 * Run from backend/: `npx tsx scripts/probeWhatsAppHandler.ts`
 *
 * SAFE: skipSend=true means no WhatsApp message is actually sent. Saves an
 * inbound message row + (on success) an outbound row to the DB, same as a
 * real conversation turn would.
 */

import { PrismaClient } from '@prisma/client';
import { WhatsAppHandler } from '../src/services/messaging/whatsappHandler.js';

// Match the failing case from the conversation_messages dump
const ORG_ID = 'b14d24da-866d-4296-abfe-8deda80bfac1';
const PHONE = '+966507434470';
const TEST_MESSAGE = 'ابغى احجز موعد اسنان';

const prisma = new PrismaClient();
const fakeLog = {
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};

async function main() {
  console.log('Probing WhatsAppHandler with:');
  console.log('  orgId:', ORG_ID);
  console.log('  phone:', PHONE);
  console.log('  body :', TEST_MESSAGE);
  console.log('');

  const handler = new WhatsAppHandler(prisma, fakeLog);

  try {
    const reply = await handler.handleIncoming(
      PHONE,
      TEST_MESSAGE,
      `probe-${Date.now()}`,
      ORG_ID,
      /*skipSend*/ true,
      /*aiAutoReply*/ true,
    );
    console.log('\n=== SUCCESS ===');
    console.log('Reply length:', reply?.length);
    console.log('Reply preview:', (reply || '').slice(0, 400));
  } catch (err: unknown) {
    const e = err as Error & { code?: string; meta?: unknown };
    console.error('\n=== EXCEPTION ===');
    console.error('name   :', e?.name);
    console.error('message:', e?.message);
    if (e?.code) console.error('code   :', e.code);
    if (e?.meta) console.error('meta   :', JSON.stringify(e.meta));
    console.error('stack  :', e?.stack);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
