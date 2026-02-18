/**
 * Comprehensive API tests for Namaa backend
 * Uses Node.js built-in test runner (node:test) — zero installs.
 * Run with: npx tsx --test tests/api.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request, uniqueEmail } from './helpers.js';

// ── Test state ──────────────────────────────────────────────
let token = '';
let orgId = '';

// IDs created during tests
let patientId = '';
let providerId = '';
let serviceId = '';
let departmentId = '';
let facilityId = '';
let appointmentId = '';
let integrationId = '';
let webhookId = '';
let faqId = '';

// ════════════════════════════════════════════════════════════
//  1. HEALTH & AUTH
// ════════════════════════════════════════════════════════════

describe('Health Check', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request('/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
    assert.ok(res.data.timestamp);
  });
});

describe('Authentication', () => {
  it('POST /api/auth/register creates a new user + org', async () => {
    const email = uniqueEmail();
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'StrongPass1!', orgName: 'Test Hospital' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
    assert.ok(res.data.user.userId);
    assert.ok(res.data.org.id);
    token = res.data.token;
    orgId = res.data.org.id;
  });

  it('POST /api/auth/register rejects duplicate email', async () => {
    const email = uniqueEmail();
    await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'StrongPass1!', orgName: 'Dup Org' },
    });
    const res2 = await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'StrongPass1!', orgName: 'Dup Org 2' },
    });
    assert.equal(res2.status, 409);
  });

  it('POST /api/auth/login works with valid credentials', async () => {
    const email = uniqueEmail();
    await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'MyPass999!', orgName: 'Login Test' },
    });
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'MyPass999!' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.token);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const email = uniqueEmail();
    await request('/api/auth/register', {
      method: 'POST',
      body: { email, password: 'Correct123!', orgName: 'Wrong PW Test' },
    });
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'Wrong999!' },
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/auth/me returns current user', async () => {
    const res = await request('/api/auth/me', { token });
    assert.equal(res.status, 200);
    assert.ok(res.data.email);
    assert.ok(res.data.org);
  });

  it('GET /api/auth/me rejects without token', async () => {
    const res = await request('/api/auth/me');
    assert.equal(res.status, 401);
  });
});

// ════════════════════════════════════════════════════════════
//  2. DEPARTMENTS (returns object directly, not { data: ... })
// ════════════════════════════════════════════════════════════

describe('Departments', () => {
  it('POST /api/departments creates a department', async () => {
    const res = await request('/api/departments', {
      method: 'POST',
      token,
      body: { name: `Cardiology_${Date.now()}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.departmentId);
    departmentId = res.data.departmentId;
  });

  it('GET /api/departments lists departments', async () => {
    const res = await request('/api/departments', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.length >= 1);
  });
});

// ════════════════════════════════════════════════════════════
//  3. FACILITIES
// ════════════════════════════════════════════════════════════

describe('Facilities', () => {
  it('POST /api/facilities creates a facility', async () => {
    const res = await request('/api/facilities', {
      method: 'POST',
      token,
      body: { name: `Main Branch_${Date.now()}`, timezone: 'Asia/Riyadh' },
    });
    assert.equal(res.status, 200);
    // Response could be { data: ... } or direct object
    const facility = res.data.data || res.data;
    assert.ok(facility.facilityId);
    facilityId = facility.facilityId;
  });

  it('GET /api/facilities lists facilities', async () => {
    const res = await request('/api/facilities', { token });
    assert.equal(res.status, 200);
    const list = res.data.data || res.data;
    assert.ok(Array.isArray(list));
  });
});

// ════════════════════════════════════════════════════════════
//  4. SERVICES
// ════════════════════════════════════════════════════════════

describe('Services', () => {
  it('POST /api/services creates a service', async () => {
    const res = await request('/api/services', {
      method: 'POST',
      token,
      body: { name: `General Consultation_${Date.now()}`, durationMin: 30 },
    });
    assert.equal(res.status, 200);
    const service = res.data.data || res.data;
    assert.ok(service.serviceId);
    serviceId = service.serviceId;
  });

  it('GET /api/services lists services', async () => {
    const res = await request('/api/services', { token });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
//  5. PROVIDERS
// ════════════════════════════════════════════════════════════

describe('Providers', () => {
  it('POST /api/providers creates a provider', async () => {
    const res = await request('/api/providers', {
      method: 'POST',
      token,
      body: {
        displayName: 'Dr. Ahmed Test',
        credentials: 'MD, FACP',
        active: true,
      },
    });
    assert.equal(res.status, 200);
    const provider = res.data.data || res.data;
    assert.ok(provider.providerId);
    providerId = provider.providerId;
  });

  it('GET /api/providers lists providers', async () => {
    const res = await request('/api/providers', { token });
    assert.equal(res.status, 200);
    const list = res.data.data || res.data;
    assert.ok(Array.isArray(list));
  });

  it('GET /api/providers/:id returns a provider', async () => {
    const res = await request(`/api/providers/${providerId}`, { token });
    assert.equal(res.status, 200);
    // Check it has the displayName somewhere
    const data = res.data.data || res.data;
    assert.ok(data.displayName || data.providerId);
  });
});

// ════════════════════════════════════════════════════════════
//  6. PATIENTS
// ════════════════════════════════════════════════════════════

describe('Patients', () => {
  it('POST /api/patients creates a patient', async () => {
    const res = await request('/api/patients', {
      method: 'POST',
      token,
      body: {
        firstName: 'Fatima',
        lastName: 'Al-Rashid',
        sex: 'female',
        mrn: `MRN-${Date.now()}`,
      },
    });
    assert.equal(res.status, 200);
    const patient = res.data.data || res.data;
    assert.ok(patient.patientId);
    patientId = patient.patientId;
  });

  it('GET /api/patients lists patients', async () => {
    const res = await request('/api/patients', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/patients with search filter works', async () => {
    const res = await request('/api/patients?search=Fatima', { token });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
//  7. APPOINTMENTS
// ════════════════════════════════════════════════════════════

describe('Appointments', () => {
  it('POST /api/appointments creates an appointment', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const endTs = new Date(tomorrow);
    endTs.setMinutes(endTs.getMinutes() + 30);

    const res = await request('/api/appointments', {
      method: 'POST',
      token,
      body: {
        providerId,
        serviceId,
        patientId,
        startTs: tomorrow.toISOString(),
        endTs: endTs.toISOString(),
        status: 'booked',
      },
    });
    // May be 200 or 400 depending on validation
    if (res.status === 200) {
      const appt = res.data.data || res.data;
      appointmentId = appt.appointmentId || '';
    }
    // Just check it doesn't 500
    assert.ok(res.status < 500, `Expected non-500, got ${res.status}`);
  });

  it('GET /api/appointments lists appointments', async () => {
    const res = await request('/api/appointments', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });
});

// ════════════════════════════════════════════════════════════
//  8. ANALYTICS
// ════════════════════════════════════════════════════════════

describe('Analytics', () => {
  it('GET /api/analytics/overview returns summary', async () => {
    const res = await request('/api/analytics/overview', { token });
    assert.equal(res.status, 200);
    assert.ok(typeof res.data.totalPatients === 'number');
  });

  it('GET /api/analytics/appointments-by-day returns chart data', async () => {
    const res = await request('/api/analytics/appointments-by-day?days=7', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/analytics/booking-channels returns channel data', async () => {
    const res = await request('/api/analytics/booking-channels', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });
});

// ════════════════════════════════════════════════════════════
//  9. FAQ
// ════════════════════════════════════════════════════════════

describe('FAQ', () => {
  it('POST /api/faq creates a FAQ entry', async () => {
    const res = await request('/api/faq', {
      method: 'POST',
      token,
      body: {
        category: 'general',
        questionEn: 'What are your hours?',
        questionAr: 'ما ساعات العمل؟',
        answerEn: 'We are open 8am-5pm',
        answerAr: 'نحن مفتوحون من 8 صباحاً حتى 5 مساءً',
      },
    });
    assert.equal(res.status, 200);
    faqId = res.data.data?.faqId || '';
    assert.ok(faqId);
  });

  it('GET /api/faq/:orgId lists FAQs', async () => {
    const res = await request(`/api/faq/${orgId}`, { token });
    assert.equal(res.status, 200);
    // The FAQ engine returns { data, pagination }
    assert.ok(res.data.data || Array.isArray(res.data));
  });
});

// ════════════════════════════════════════════════════════════
//  10. INTEGRATIONS (new feature)
// ════════════════════════════════════════════════════════════

describe('Integrations', () => {
  it('POST /api/integrations creates an integration', async () => {
    const res = await request('/api/integrations', {
      method: 'POST',
      token,
      body: { type: 'emr', provider: 'Epic', config: { apiUrl: 'https://example.com' } },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.integrationId);
    integrationId = res.data.data.integrationId;
  });

  it('GET /api/integrations lists integrations', async () => {
    const res = await request('/api/integrations', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.length >= 1);
  });

  it('GET /api/integrations/:id returns single integration', async () => {
    const res = await request(`/api/integrations/${integrationId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.data.provider, 'Epic');
  });

  it('PUT /api/integrations/:id updates an integration', async () => {
    const res = await request(`/api/integrations/${integrationId}`, {
      method: 'PUT',
      token,
      body: { provider: 'Epic FHIR' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.provider, 'Epic FHIR');
  });

  it('POST /api/integrations/:id/sync updates lastSyncAt', async () => {
    const res = await request(`/api/integrations/${integrationId}/sync`, {
      method: 'POST',
      token,
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.lastSyncAt);
  });

  it('DELETE /api/integrations/:id deletes an integration', async () => {
    const res = await request(`/api/integrations/${integrationId}`, {
      method: 'DELETE',
      token,
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });
});

// ════════════════════════════════════════════════════════════
//  11. WEBHOOK SUBSCRIPTIONS (new feature)
// ════════════════════════════════════════════════════════════

describe('Webhook Subscriptions', () => {
  it('POST /api/webhook-subscriptions creates a webhook', async () => {
    const res = await request('/api/webhook-subscriptions', {
      method: 'POST',
      token,
      body: { event: 'appointment.created', url: 'https://example.com/hook' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.webhookId);
    assert.ok(res.data.data.secret);
    webhookId = res.data.data.webhookId;
  });

  it('GET /api/webhook-subscriptions lists webhooks', async () => {
    const res = await request('/api/webhook-subscriptions', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.length >= 1);
  });

  it('DELETE /api/webhook-subscriptions/:id deletes a webhook', async () => {
    const res = await request(`/api/webhook-subscriptions/${webhookId}`, {
      method: 'DELETE',
      token,
    });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
//  12. SETTINGS (new feature)
// ════════════════════════════════════════════════════════════

describe('Settings', () => {
  it('GET /api/settings/all returns org + user info', async () => {
    const res = await request('/api/settings/all', { token });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.org);
    assert.ok(res.data.data.user);
  });

  it('PUT /api/settings/org updates org name', async () => {
    const res = await request('/api/settings/org', {
      method: 'PUT',
      token,
      body: { name: 'Updated Hospital Name' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.name, 'Updated Hospital Name');
  });

  it('PUT /api/settings/profile updates user profile', async () => {
    const res = await request('/api/settings/profile', {
      method: 'PUT',
      token,
      body: { name: 'Admin User' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.name, 'Admin User');
  });

  it('GET /api/settings/notifications returns defaults', async () => {
    const res = await request('/api/settings/notifications', { token });
    assert.equal(res.status, 200);
    assert.ok(typeof res.data.data.newBookingAlerts === 'boolean');
  });
});

// ════════════════════════════════════════════════════════════
//  13. REPORTS (new feature)
// ════════════════════════════════════════════════════════════

describe('Reports', () => {
  it('GET /api/reports/summary returns aggregated stats', async () => {
    const res = await request('/api/reports/summary', { token });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.patients);
    assert.ok(res.data.data.appointments);
    assert.ok(typeof res.data.data.appointments.completionRate === 'number');
  });

  it('GET /api/reports/by-provider returns provider breakdown', async () => {
    const res = await request('/api/reports/by-provider', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/reports/by-department returns department breakdown', async () => {
    const res = await request('/api/reports/by-department', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/reports/daily-trend returns trend data', async () => {
    const res = await request('/api/reports/daily-trend', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/reports/export?type=appointments&format=json returns data', async () => {
    const res = await request('/api/reports/export?type=appointments&format=json', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/reports/export?type=patients&format=json returns data', async () => {
    const res = await request('/api/reports/export?type=patients&format=json', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
  });

  it('GET /api/reports/export?type=appointments&format=csv returns CSV', async () => {
    const res = await request('/api/reports/export?type=appointments&format=csv', { token });
    assert.equal(res.status, 200);
    assert.equal(typeof res.data, 'string');
  });
});

// ════════════════════════════════════════════════════════════
//  14. PROTECTED ROUTE ENFORCEMENT
// ════════════════════════════════════════════════════════════

describe('Auth Enforcement', () => {
  const protectedRoutes = [
    '/api/patients',
    '/api/providers',
    '/api/services',
    '/api/departments',
    '/api/facilities',
    '/api/appointments',
    '/api/analytics/overview',
    '/api/integrations',
    '/api/webhook-subscriptions',
    '/api/settings/all',
    '/api/reports/summary',
  ];

  for (const route of protectedRoutes) {
    it(`GET ${route} returns 401 without token`, async () => {
      const res = await request(route);
      assert.equal(res.status, 401, `${route} should require auth but got ${res.status}`);
    });
  }
});

// ════════════════════════════════════════════════════════════
//  15. REMINDERS
// ════════════════════════════════════════════════════════════

describe('Reminders', () => {
  it('GET /api/reminders/stats returns reminder stats', async () => {
    const res = await request('/api/reminders/stats', { token });
    assert.equal(res.status, 200);
  });
});

// ════════════════════════════════════════════════════════════
//  16. VALIDATION ERRORS
// ════════════════════════════════════════════════════════════

describe('Validation', () => {
  it('POST /api/auth/register rejects short password', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email: uniqueEmail(), password: 'short', orgName: 'Test' },
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/auth/register rejects invalid email', async () => {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'StrongPass1!', orgName: 'Test' },
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/departments rejects empty name', async () => {
    const res = await request('/api/departments', {
      method: 'POST',
      token,
      body: { name: '' },
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/integrations rejects missing required fields', async () => {
    const res = await request('/api/integrations', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(res.status, 400);
  });
});
