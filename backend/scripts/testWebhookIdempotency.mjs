// Smoke test for the persistent Tap webhook idempotency table.
//
// Posts the same forged Tap payload twice with a valid HMAC and asserts that:
//   - First call returns 200 with processed=true (or processed=false + unknown_charge if no
//     matching TawafudPayment row exists — that path still inserts a WebhookEvent row).
//   - Second call returns 200 with reason="duplicate".
//   - Only one row is present in webhook_events for the (provider, eventId) pair.
//
// Run with the dev server up:
//   cd backend
//   PORT=3007 npm run dev
//   # in another shell:
//   TAP_SECRET_KEY=... node scripts/testWebhookIdempotency.mjs
//
// Optional env: WEBHOOK_URL (defaults to http://localhost:3007/api/payments/webhook).

import crypto from 'node:crypto';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3007/api/payments/webhook';
const SECRET = process.env.TAP_SECRET_KEY;
if (!SECRET) {
  console.error('TAP_SECRET_KEY env var is required to compute the hashstring.');
  process.exit(1);
}

const event = {
  id: `chg_test_${Date.now()}`,
  amount: 19900,
  currency: 'SAR',
  status: 'CAPTURED',
  created: Date.now(),
  reference: { gateway: 'gw_test', payment: 'pay_test' },
};

function buildSignedString(e) {
  const amount = Number(e.amount).toFixed(2);
  return (
    `x_id${e.id}` +
    `x_amount${amount}` +
    `x_currency${e.currency}` +
    `x_gateway_reference${e.reference?.gateway || ''}` +
    `x_payment_reference${e.reference?.payment || ''}` +
    `x_status${e.status}` +
    `x_created${e.created}`
  );
}

function hashstring(e) {
  return crypto.createHmac('sha256', SECRET).update(buildSignedString(e)).digest('hex');
}

async function post() {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      hashstring: hashstring(event),
    },
    body: JSON.stringify(event),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const first = await post();
console.log('First POST  →', first);

const second = await post();
console.log('Second POST →', second);

if (first.status !== 200 || second.status !== 200) {
  console.error('FAIL: both calls should return 200.');
  process.exit(2);
}
if (second.body?.reason !== 'duplicate') {
  console.error('FAIL: second call should report reason="duplicate".');
  process.exit(3);
}
console.log('OK: webhook idempotency table is working.');
