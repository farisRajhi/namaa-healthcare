// Quick probe: hits Vertex AI Gemini exactly the way llm.ts does, and prints
// the raw response/error. Read-only — does NOT modify anything.
//
// Usage: from backend/, run `node scripts/probeGemini.mjs`

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';

// Manually load .env (backend uses tsx --env-file in dev, not dotenv)
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
} catch (e) {
  console.warn('Could not load .env:', e.message);
}

const useVertex = process.env.GEMINI_USE_VERTEX === 'true';
const model = process.env.LLM_MODEL || 'gemini-2.5-flash';
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

console.log('=== Config ===');
console.log('GEMINI_USE_VERTEX:', useVertex);
console.log('LLM_MODEL:', model);
console.log('GOOGLE_CLOUD_PROJECT:', project);
console.log('GOOGLE_CLOUD_LOCATION:', location);
console.log('GOOGLE_APPLICATION_CREDENTIALS:', credsPath);
console.log('GEMINI_API_KEY set:', !!process.env.GEMINI_API_KEY);
console.log('LLM_FALLBACK_MODEL:', process.env.LLM_FALLBACK_MODEL);
console.log('');

async function getVertexToken() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res.token) throw new Error('Vertex AI: failed to obtain access token');
  return res.token;
}

async function main() {
  let url;
  const headers = { 'Content-Type': 'application/json' };
  let backendLabel;

  if (useVertex) {
    if (!project) {
      console.error('GOOGLE_CLOUD_PROJECT env var required when GEMINI_USE_VERTEX=true');
      process.exit(1);
    }
    console.log('Getting Vertex access token…');
    const token = await getVertexToken();
    console.log('Got token, length:', token.length);
    url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    headers.Authorization = `Bearer ${token}`;
    backendLabel = 'Vertex AI';
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    backendLabel = 'Gemini API';
  }

  console.log(`\nCalling ${backendLabel} at:`);
  console.log(url.replace(/key=[^&]+/, 'key=REDACTED'));

  // === Test 1: simple chat (no tools) ===
  await runOnce('simple chat', url, headers, {
    systemInstruction: { parts: [{ text: 'You are a helpful assistant. Reply in one short sentence.' }] },
    contents: [{ role: 'user', parts: [{ text: 'Say hi.' }] }],
    generationConfig: { maxOutputTokens: 64, temperature: 0.3 },
  });

  // === Test 2: tools that match what WhatsApp pipeline sends ===
  // Includes one with empty properties (get_today_date) — suspected to break Vertex.
  const whatsappLikeTools = [{
    functionDeclarations: [
      {
        name: 'get_today_date',
        description: "Get today's date and time.",
        parameters: { type: 'OBJECT', properties: {}, required: [] },  // ← EMPTY
      },
      {
        name: 'check_availability',
        description: 'Check available time slots.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'YYYY-MM-DD' },
          },
          required: ['date'],
        },
      },
    ],
  }];

  await runOnce('chat WITH tools (incl. empty-properties tool)', url, headers, {
    systemInstruction: { parts: [{ text: 'You are a helpful clinic receptionist.' }] },
    contents: [{ role: 'user', parts: [{ text: 'What is the date today?' }] }],
    tools: whatsappLikeTools,
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 256, temperature: 0.3 },
  });

  // === Test 3: same but only the no-properties tool to isolate ===
  const onlyEmptyTool = [{
    functionDeclarations: [
      {
        name: 'get_today_date',
        description: "Get today's date and time.",
        parameters: { type: 'OBJECT', properties: {}, required: [] },
      },
    ],
  }];

  await runOnce('chat WITH only empty-properties tool', url, headers, {
    systemInstruction: { parts: [{ text: 'You are a helpful clinic receptionist.' }] },
    contents: [{ role: 'user', parts: [{ text: 'What is the date today?' }] }],
    tools: onlyEmptyTool,
    tool_config: { function_calling_config: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 256, temperature: 0.3 },
  });
}

async function runOnce(label, url, headers, body) {
  console.log(`\n────── Test: ${label} ──────`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  console.log('HTTP status:', res.status, res.statusText);
  const text = await res.text();
  if (!res.ok) {
    console.error('ERROR BODY:', text.slice(0, 1500));
    return;
  }
  try {
    const data = JSON.parse(text);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const fc = data?.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
    console.log('Finish reason:', data?.candidates?.[0]?.finishReason);
    if (reply) console.log('Reply text:', reply.slice(0, 200));
    if (fc) console.log('Function call:', fc.functionCall.name, JSON.stringify(fc.functionCall.args).slice(0, 200));
  } catch {
    console.log('Non-JSON:', text.slice(0, 300));
  }
}

main().catch(err => {
  console.error('=== UNEXPECTED ERROR ===');
  console.error(err);
  process.exit(3);
});
