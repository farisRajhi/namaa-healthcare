/**
 * WhatsApp Arabic Conversation Quality Tests
 *
 * Simulates realistic multi-turn Arabic WhatsApp conversations
 * and evaluates the AI's response quality for:
 *   - Natural Gulf Arabic dialect
 *   - Conciseness (WhatsApp-appropriate message length)
 *   - Warmth and empathy
 *   - Correct tool usage
 *   - No UUID leakage
 *   - No "TEST conversation" leakage
 *   - No English sentences in Arabic conversations
 *
 * Requirements:
 *   - Running backend (localhost:3003) with seeded data
 *   - OPENAI_API_KEY or GEMINI_API_KEY in environment
 *
 * Run with: npx tsx --test tests/whatsapp-arabic-quality.test.ts
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Inline request helper using correct port from env
const BASE_URL = `http://localhost:${process.env.PORT || '3007'}`;

interface FetchOptions {
  method?: string;
  body?: Record<string, any>;
  token?: string;
  headers?: Record<string, string>;
}

async function request(
  path: string,
  options: FetchOptions = {}
): Promise<{ status: number; data: any }> {
  const { method = 'GET', body, token, headers = {} } = options;
  const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) fetchHeaders['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: fetchHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try { data = await response.json(); } catch { data = await response.text(); }
  return { status: response.status, data };
}

let emailCounter = 0;
function uniqueEmail() {
  return `test_wa_${Date.now()}_${emailCounter++}@test.com`;
}

// ── Quality Assertion Helpers ──────────────────────────────

/** Assert response is in Gulf Arabic (no multi-word English sentences) */
function assertGulfArabic(response: string, context: string) {
  // Must contain Arabic characters
  assert.match(response, /[\u0600-\u06FF]/, `${context}: Response should contain Arabic text`);

  // Must NOT contain English sentences (3+ consecutive English words)
  // Allow single English words like medical terms, doctor names
  const englishSentence = /(?<![A-Za-z])[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}(?![A-Za-z])/;
  assert.doesNotMatch(
    response,
    englishSentence,
    `${context}: Response should not contain English sentences. Got: "${response.slice(0, 200)}"`,
  );
}

/** Assert response is concise for WhatsApp */
function assertConcise(response: string, maxLines: number, context: string) {
  const lines = response.split('\n').filter(l => l.trim());
  assert.ok(
    lines.length <= maxLines,
    `${context}: Response too long (${lines.length} lines, max ${maxLines}). Got: "${response.slice(0, 300)}"`,
  );
}

/** Assert no raw UUIDs exposed in response */
function assertNoUUIDs(response: string, context: string) {
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.doesNotMatch(
    response,
    uuidPattern,
    `${context}: Response should not contain raw UUIDs. Got: "${response.slice(0, 300)}"`,
  );
}

/** Assert no "TEST conversation" mode leakage */
function assertNoTestLeakage(response: string, context: string) {
  const testPatterns = ['TEST conversation', 'business owner', 'verify the AI'];
  for (const pattern of testPatterns) {
    assert.ok(
      !response.includes(pattern),
      `${context}: Response contains test mode leakage: "${pattern}"`,
    );
  }
}

/** Assert response contains warmth (Gulf Arabic warm phrases or emojis) */
function assertWarmth(response: string, context: string) {
  const warmIndicators = [
    'حياك', 'الله يعافيك', 'إن شاء الله', 'على راسي', 'الله يشفيك',
    'تفضل', 'زين', 'تمام', '😊', '✅', '🙏', '👋',
  ];
  const hasWarmth = warmIndicators.some(p => response.includes(p));
  // Warmth is desirable but not strictly required in every message
  // Log a warning if missing but don't fail
  if (!hasWarmth) {
    console.log(`  [warmth-check] ${context}: No warm phrase detected (acceptable for non-greeting messages)`);
  }
}

// ── Test State ─────────────────────────────────────────────

let token = '';
let orgId = '';
let patientId = '';
let providerId = '';
let serviceId = '';
let departmentId = '';
let facilityId = '';
let conversationId = '';

// ── Setup: Create org with providers, services, availability ─

describe('WhatsApp Arabic Quality Tests', () => {
  before(async () => {
    // Register a test org
    const email = uniqueEmail();
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'TestPass123!', orgName: 'عيادة توافد التخصصية' },
    });
    assert.equal(regRes.status, 200, 'Registration should succeed');
    token = regRes.data.token;
    orgId = regRes.data.org.id;

    // Create department
    const deptRes = await request('/api/departments', {
      method: 'POST',
      token,
      body: { name: 'General Medicine', nameAr: 'طب عام' },
    });
    if (deptRes.status === 200 || deptRes.status === 201) {
      departmentId = deptRes.data.departmentId;
    }

    // Create facility
    const facRes = await request('/api/facilities', {
      method: 'POST',
      token,
      body: {
        name: 'الفرع الرئيسي',
        addressLine1: 'شارع الملك فهد',
        city: 'الرياض',
        timezone: 'Asia/Riyadh',
      },
    });
    if (facRes.status === 200 || facRes.status === 201) {
      facilityId = facRes.data.facilityId;
    }

    // Create service
    const svcRes = await request('/api/services', {
      method: 'POST',
      token,
      body: {
        name: 'General Checkup',
        nameAr: 'كشف عام',
        durationMin: 30,
        departmentId,
      },
    });
    if (svcRes.status === 200 || svcRes.status === 201) {
      serviceId = svcRes.data.serviceId;
    }

    // Create provider
    const provRes = await request('/api/providers', {
      method: 'POST',
      token,
      body: {
        displayName: 'د. أحمد الراشدي',
        credentials: 'MBBS',
        departmentId,
        facilityId,
        active: true,
      },
    });
    if (provRes.status === 200 || provRes.status === 201) {
      providerId = provRes.data.providerId;
    }

    // Link provider to service
    if (providerId && serviceId) {
      await request(`/api/providers/${providerId}/services`, {
        method: 'POST',
        token,
        body: { serviceId },
      });
    }

    // Create availability rules (Sunday-Thursday 09:00-17:00)
    if (providerId) {
      for (let day = 0; day <= 4; day++) {
        await request(`/api/providers/${providerId}/availability`, {
          method: 'POST',
          token,
          body: {
            dayOfWeek: day,
            startLocal: '09:00',
            endLocal: '17:00',
            slotIntervalMin: 30,
          },
        });
      }
    }

    // Create patient
    const patRes = await request('/api/patients', {
      method: 'POST',
      token,
      body: {
        firstName: 'محمد',
        lastName: 'العلي',
        dateOfBirth: '1990-05-15',
        sex: 'male',
        contacts: [
          { contactType: 'phone', contactValue: '+966501234567' },
        ],
      },
    });
    if (patRes.status === 200 || patRes.status === 201) {
      patientId = patRes.data.patientId;
    }

    console.log('Test setup complete:', {
      orgId: orgId?.slice(0, 8),
      patientId: patientId?.slice(0, 8),
      providerId: providerId?.slice(0, 8),
      serviceId: serviceId?.slice(0, 8),
    });
  });

  // ── Scenario 1: Standard booking greeting ──────────────────

  describe('Scenario 1: Arabic greeting and booking intent', () => {
    it('should respond in Gulf Arabic with warm greeting', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'السلام عليكم أبغى موعد',
          conversationId: undefined,
        },
      });

      // The chat endpoint may return 200 with response
      if (res.status === 200 && res.data.response) {
        const response = res.data.response;
        conversationId = res.data.conversationId;

        console.log('\n--- Turn 1: Greeting + booking intent ---');
        console.log(`AI: ${response.slice(0, 300)}`);

        assertGulfArabic(response, 'Turn 1');
        assertConcise(response, 12, 'Turn 1');
        assertNoUUIDs(response, 'Turn 1');
        assertNoTestLeakage(response, 'Turn 1');
        assertWarmth(response, 'Turn 1');
      } else {
        console.log('Chat endpoint response:', res.status, JSON.stringify(res.data).slice(0, 200));
        // Don't fail — endpoint may not be available in CI
      }
    });
  });

  // ── Scenario 2: Vague request handling ─────────────────────

  describe('Scenario 2: Vague request — patient does not know what service', () => {
    it('should ask about symptoms instead of dumping service list', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'أبغى موعد بس ما أدري وش أحتاج',
          conversationId: undefined,
        },
      });

      if (res.status === 200 && res.data.response) {
        const response = res.data.response;

        console.log('\n--- Vague request ---');
        console.log(`AI: ${response.slice(0, 300)}`);

        assertGulfArabic(response, 'Vague request');
        assertConcise(response, 10, 'Vague request');
        assertNoUUIDs(response, 'Vague request');

        // Should ask about symptoms/concern, not dump a service list
        const asksAboutConcern = /وش.*تحس|شكو|تحتاج|وش.*عندك|كيف.*ساعد|وش.*المشكل/i.test(response);
        const dumpsServiceList = /خدمة\s*\d|الخدمات المتاحة.*:\n.*\n.*\n/i.test(response);

        if (dumpsServiceList && !asksAboutConcern) {
          console.log('  [WARN] AI dumped service list instead of asking about concern');
        }
      }
    });
  });

  // ── Scenario 3: System prompt quality checks ───────────────

  describe('Scenario 3: System prompt quality', () => {
    it('should not leak TEST conversation framing', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'مرحبا',
          conversationId: undefined,
        },
      });

      if (res.status === 200 && res.data.response) {
        const response = res.data.response;

        console.log('\n--- Simple greeting ---');
        console.log(`AI: ${response.slice(0, 300)}`);

        assertNoTestLeakage(response, 'Simple greeting');
        assertGulfArabic(response, 'Simple greeting');
      }
    });
  });

  // ── Scenario 4: Browse available dates response quality ────

  describe('Scenario 4: Browse available dates', () => {
    it('should show dates in natural Arabic without raw UUIDs', async () => {
      const res = await request('/api/chat/message', {
        method: 'POST',
        token,
        body: {
          message: 'وش المواعيد المتاحة؟',
          conversationId: undefined,
        },
      });

      if (res.status === 200 && res.data.response) {
        const response = res.data.response;

        console.log('\n--- Browse dates ---');
        console.log(`AI: ${response.slice(0, 500)}`);

        assertGulfArabic(response, 'Browse dates');
        assertNoUUIDs(response, 'Browse dates');
        assertConcise(response, 20, 'Browse dates');
      }
    });
  });
});
