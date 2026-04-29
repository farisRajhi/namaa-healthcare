// Probe: mint a JWT for the org's user and hit POST /api/baileys-whatsapp/send
// to test the live backend's manager.sendMessage path. This SENDS a real
// WhatsApp message — only run when you want to test the send path end-to-end.

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerEnc = b64url(JSON.stringify(header));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 300 };
  const payloadEnc = b64url(JSON.stringify(fullPayload));
  const signingInput = `${headerEnc}.${payloadEnc}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${signingInput}.${sig}`;
}

// Load .env
const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

const ORG_ID = 'b14d24da-866d-4296-abfe-8deda80bfac1';
const USER_ID = '5a847f2d-8677-44df-816e-0c632a1846f9';
const EMAIL = 'fariisuni@gmail.com';
const TARGET_PHONE = '+966507434470'; // Faris's personal phone (the test recipient)
const TEST_TEXT = '[diagnostic-probe] تمام يا فارس، وش الخدمة اللي تبيها في قسم الأسنان؟ 🦷';

const token = signJwt(
  { userId: USER_ID, orgId: ORG_ID, email: EMAIL },
  process.env.JWT_SECRET,
);

console.log('JWT minted, len:', token.length);
console.log('Calling POST /api/baileys-whatsapp/send …');

const res = await fetch('http://localhost:3007/api/baileys-whatsapp/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    phones: [TARGET_PHONE],
    text: TEST_TEXT,
  }),
});

console.log('HTTP status:', res.status);
const body = await res.text();
console.log('Body:', body.slice(0, 1500));
