import fs from 'fs';
import crypto from 'crypto';

const BASE = 'http://localhost:3000';
const TOKEN = fs.readFileSync('test-token.txt', 'utf8').trim();
const payload = JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64').toString());
const ORG_ID = payload.orgId;
const USER_ID = payload.userId;

const results = [];
let createdPatientId = null;
let createdProviderId = null;
let createdServiceId = null;
let createdDepartmentId = null;
let createdFacilityId = null;
let createdAppointmentId = null;
let createdFaqId = null;
let createdPrescriptionId = null;
let createdWaitlistId = null;
let createdTemplateId = null;
let createdFlowId = null;

function headers() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };
}
function noAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}

async function test(group, endpoint, method, path, body = null, opts = {}) {
  const url = `${BASE}${path}`;
  const h = opts.noAuth ? noAuthHeaders() : headers();
  const fetchOpts = { method, headers: h };
  if (body) fetchOpts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    const status = res.status;
    const ok = status >= 200 && status < 300;
    const icon = ok ? '✅' : '❌';
    const note = ok ? '' : (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data).slice(0, 300));

    console.log(`${icon} [${status}] ${method.padEnd(6)} ${path}${note ? ' → ' + note : ''}`);
    results.push({ group, endpoint, method, path, status, ok, note, data });
    return { status, ok, data };
  } catch (err) {
    console.log(`❌ [ERR] ${method.padEnd(6)} ${path} → ${err.message}`);
    results.push({ group, endpoint, method, path, status: 'ERR', ok: false, note: err.message, data: null });
    return { status: 'ERR', ok: false, data: null };
  }
}

async function run() {
  console.log('========================================');
  console.log('    NAMAA API COMPREHENSIVE TEST');
  console.log(`    Org: ${ORG_ID}`);
  console.log('========================================\n');

  // ==================== HEALTH ====================
  console.log('─── HEALTH ───');
  await test('Health', 'Health check', 'GET', '/health', null, { noAuth: true });

  // ==================== AUTH ====================
  console.log('\n─── AUTH ───');
  await test('Auth', 'Register (dup → 409 expected)', 'POST', '/api/auth/register', {
    orgName: 'Test2', orgNameAr: 'تست2', email: 'testapi@shifa.sa', password: 'Test1234!', name: 'Test', nameAr: 'تست'
  }, { noAuth: true });

  await test('Auth', 'Login', 'POST', '/api/auth/login', {
    email: 'testapi@shifa.sa', password: 'Test1234!'
  }, { noAuth: true });

  await test('Auth', 'Me', 'GET', '/api/auth/me');

  // ==================== DEPARTMENTS ====================
  console.log('\n─── DEPARTMENTS ───');
  await test('Departments', 'List', 'GET', '/api/departments');

  const deptRes = await test('Departments', 'Create', 'POST', '/api/departments', {
    name: 'الطب العام', nameAr: 'الطب العام', description: 'General Medicine', descriptionAr: 'قسم الطب العام'
  });
  if (deptRes.ok) createdDepartmentId = deptRes.data?.departmentId || deptRes.data?.id;

  // ==================== FACILITIES ====================
  console.log('\n─── FACILITIES ───');
  await test('Facilities', 'List', 'GET', '/api/facilities');

  const facRes = await test('Facilities', 'Create', 'POST', '/api/facilities', {
    name: 'الفرع الرئيسي', timezone: 'Asia/Riyadh', addressLine1: 'شارع الملك فهد', city: 'الرياض', country: 'SA'
  });
  if (facRes.ok) createdFacilityId = facRes.data?.facilityId || facRes.data?.id;

  // ==================== SERVICES ====================
  console.log('\n─── SERVICES ───');
  await test('Services', 'List', 'GET', '/api/services');

  const svcRes = await test('Services', 'Create', 'POST', '/api/services', {
    name: 'فحص عام', durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 5
  });
  if (svcRes.ok) createdServiceId = svcRes.data?.serviceId || svcRes.data?.id;

  // ==================== PATIENTS ====================
  console.log('\n─── PATIENTS ───');
  await test('Patients', 'List', 'GET', '/api/patients');

  const patRes = await test('Patients', 'Create', 'POST', '/api/patients', {
    firstName: 'محمد', lastName: 'علي', dateOfBirth: '1990-01-15', sex: 'M',
    phone: '+966500000001', email: 'mohammed@test.sa'
  });
  if (patRes.ok) createdPatientId = patRes.data?.patientId || patRes.data?.id;

  if (createdPatientId) {
    await test('Patients', 'Get by ID', 'GET', `/api/patients/${createdPatientId}`);
    await test('Patients', 'Update', 'PUT', `/api/patients/${createdPatientId}`, { firstName: 'محمد أحمد' });
  }

  // ==================== PROVIDERS ====================
  console.log('\n─── PROVIDERS ───');
  await test('Providers', 'List', 'GET', '/api/providers');

  const provRes = await test('Providers', 'Create', 'POST', '/api/providers', {
    displayName: 'د. فاطمة الزهراء', departmentId: createdDepartmentId || undefined,
    facilityId: createdFacilityId || undefined, credentials: 'MD', active: true
  });
  if (provRes.ok) createdProviderId = provRes.data?.providerId || provRes.data?.id;

  if (createdProviderId) {
    await test('Providers', 'Get by ID', 'GET', `/api/providers/${createdProviderId}`);
    await test('Providers', 'Add availability', 'POST', `/api/providers/${createdProviderId}/availability`, {
      dayOfWeek: 0, startLocal: '09:00', endLocal: '17:00', slotIntervalMin: 15
    });
    if (createdServiceId) {
      await test('Providers', 'Assign service', 'POST', `/api/providers/${createdProviderId}/services`, {
        serviceId: createdServiceId
      });
    }
  }

  // ==================== APPOINTMENTS ====================
  console.log('\n─── APPOINTMENTS ───');
  await test('Appointments', 'List', 'GET', '/api/appointments');

  if (createdProviderId && createdServiceId) {
    const apptRes = await test('Appointments', 'Create', 'POST', '/api/appointments', {
      providerId: createdProviderId, serviceId: createdServiceId,
      patientId: createdPatientId || undefined,
      facilityId: createdFacilityId || undefined,
      startTs: '2026-03-01T09:00:00Z', reason: 'فحص عام'
    });
    if (apptRes.ok) createdAppointmentId = apptRes.data?.appointmentId || apptRes.data?.id;
  }

  if (createdAppointmentId) {
    await test('Appointments', 'Get by ID', 'GET', `/api/appointments/${createdAppointmentId}`);
    await test('Appointments', 'Update status', 'PATCH', `/api/appointments/${createdAppointmentId}/status`, {
      status: 'confirmed'
    });
  }

  if (createdProviderId && createdServiceId) {
    await test('Appointments', 'Check availability', 'GET',
      `/api/appointments/availability/${createdProviderId}?date=2026-03-02&serviceId=${createdServiceId}`);
  }

  // ==================== CHAT ====================
  console.log('\n─── CHAT ───');
  await test('Chat', 'Readiness', 'GET', '/api/chat/readiness');
  await test('Chat', 'Send message', 'POST', '/api/chat/message', {
    message: 'مرحبا، أريد حجز موعد'
  });
  await test('Chat', 'Conversations', 'GET', '/api/chat/conversations');
  await test('Chat', 'New conversation', 'POST', '/api/chat/new', {});

  // ==================== DEMO CHAT ====================
  console.log('\n─── DEMO CHAT ───');
  const sessionId = crypto.randomUUID();
  await test('Demo Chat', 'Health', 'GET', '/api/demo-chat/health', null, { noAuth: true });
  await test('Demo Chat', 'New session', 'POST', '/api/demo-chat/new', {
    sessionId
  }, { noAuth: true });
  await test('Demo Chat', 'Send message', 'POST', '/api/demo-chat/message', {
    sessionId, message: 'أبي أحجز موعد أسنان', dialect: 'gulf'
  }, { noAuth: true });

  // ==================== FAQ ====================
  console.log('\n─── FAQ ───');
  await test('FAQ', 'List (by orgId)', 'GET', `/api/faq/${ORG_ID}`);

  const faqRes = await test('FAQ', 'Create', 'POST', '/api/faq', {
    category: 'general', questionEn: 'What are your working hours?',
    questionAr: 'ما هي ساعات العمل؟', answerEn: '8 AM to 10 PM',
    answerAr: 'من 8 صباحاً إلى 10 مساءً', priority: 1
  });
  if (faqRes.ok && faqRes.data?.data?.faqEntryId) createdFaqId = faqRes.data.data.faqEntryId;

  await test('FAQ', 'Search', 'POST', '/api/faq/search', {
    query: 'working hours', limit: 5
  });

  await test('FAQ', 'Triage', 'POST', '/api/faq/triage', {
    symptoms: 'chest pain and difficulty breathing'
  });

  // ==================== TRIAGE RULES ====================
  console.log('\n─── TRIAGE RULES ───');
  await test('Triage Rules', 'List', 'GET', `/api/triage-rules/${ORG_ID}`);
  await test('Triage Rules', 'Create', 'POST', '/api/triage-rules', {
    orgId: ORG_ID, keywords: ['chest pain', 'breathing'], severity: 'emergency',
    responseEn: 'Call 911 immediately', responseAr: 'اتصل بالطوارئ فوراً', action: 'call_emergency'
  });

  // ==================== PRESCRIPTIONS ====================
  console.log('\n─── PRESCRIPTIONS ───');
  if (createdPatientId && createdProviderId) {
    const rxRes = await test('Prescriptions', 'Create', 'POST', '/api/prescriptions', {
      patientId: createdPatientId, providerId: createdProviderId,
      medicationName: 'Paracetamol', medicationNameAr: 'باراسيتامول',
      dosage: '500mg', frequency: 'twice_daily', refillsTotal: 3,
      startDate: '2026-02-09', endDate: '2026-03-09', notes: 'Take with food'
    });
    if (rxRes.ok) createdPrescriptionId = rxRes.data?.data?.prescriptionId;

    await test('Prescriptions', 'List by patient', 'GET', `/api/prescriptions/patient/${createdPatientId}`);

    if (createdPrescriptionId) {
      await test('Prescriptions', 'Get by ID', 'GET', `/api/prescriptions/${createdPrescriptionId}`);
      await test('Prescriptions', 'Refill status', 'GET', `/api/prescriptions/${createdPrescriptionId}/status`);
      await test('Prescriptions', 'Request refill', 'POST', `/api/prescriptions/${createdPrescriptionId}/refill`, {
        requestedVia: 'web', notes: 'Need refill'
      });
    }

    await test('Prescriptions', 'Check interactions', 'GET',
      `/api/prescriptions/patient/${createdPatientId}/interactions?medication=Ibuprofen`);
  }

  // ==================== WAITLIST ====================
  console.log('\n─── WAITLIST ───');
  await test('Waitlist', 'List', 'GET', `/api/waitlist/${ORG_ID}`);

  if (createdPatientId) {
    const wlRes = await test('Waitlist', 'Add', 'POST', '/api/waitlist/add', {
      patientId: createdPatientId, serviceId: createdServiceId || undefined,
      providerId: createdProviderId || undefined, priority: 5, preferredTime: 'morning'
    });
    if (wlRes.ok) createdWaitlistId = wlRes.data?.data?.waitlistId;
  }

  await test('Waitlist', 'Stats', 'GET', `/api/waitlist/stats/${ORG_ID}`);

  if (createdWaitlistId) {
    await test('Waitlist', 'Notify', 'POST', '/api/waitlist/notify', {
      waitlistId: createdWaitlistId
    });
  }

  // ==================== SMS TEMPLATES ====================
  console.log('\n─── SMS TEMPLATES ───');
  await test('SMS Templates', 'List', 'GET', `/api/sms-templates/${ORG_ID}`);

  const tplRes = await test('SMS Templates', 'Create', 'POST', '/api/sms-templates', {
    name: 'تذكير موعد', trigger: 'reminder',
    bodyEn: 'Hi {{patientName}}, your appointment is on {{date}}',
    bodyAr: 'مرحبا {{patientName}}، لديك موعد يوم {{date}}',
    variables: ['patientName', 'date'], channel: 'sms'
  });
  if (tplRes.ok) createdTemplateId = tplRes.data?.data?.smsTemplateId;

  // ==================== SMS LOGS ====================
  console.log('\n─── SMS LOGS ───');
  await test('SMS Logs', 'List', 'GET', `/api/sms-logs/${ORG_ID}`);

  // ==================== CALL CENTER ====================
  console.log('\n─── CALL CENTER ───');
  await test('Call Center', 'Status (POST)', 'POST', '/api/call-center/status', {});
  await test('Call Center', 'Queue', 'GET', '/api/call-center/queue');
  await test('Call Center', 'Active calls', 'GET', '/api/call-center/active-calls');
  await test('Call Center', 'Handoffs', 'GET', '/api/call-center/handoffs');

  // ==================== OUTBOUND / CAMPAIGNS ====================
  console.log('\n─── OUTBOUND / CAMPAIGNS ───');
  await test('Outbound', 'List campaigns', 'GET', `/api/outbound/campaigns/org/${ORG_ID}`);

  const campRes = await test('Outbound', 'Create campaign', 'POST', '/api/outbound/campaigns', {
    name: 'حملة استدعاء', type: 'recall',
    targetFilter: { lastVisitDaysAgo: 90, noAppointmentDays: 60 },
    channelSequence: ['sms', 'voice']
  });

  // ==================== REMINDERS ====================
  console.log('\n─── REMINDERS ───');
  await test('Reminders', 'List', 'GET', `/api/reminders/${ORG_ID}`);
  await test('Reminders', 'Configure', 'POST', '/api/reminders/configure', {
    orgId: ORG_ID,
    intervals: [{ hoursBefore: 24, channel: 'sms' }, { hoursBefore: 2, channel: 'whatsapp' }],
    enableSurvey: true, surveyDelayHours: 2
  });
  await test('Reminders', 'Stats', 'GET', `/api/reminders/stats/${ORG_ID}`);

  // ==================== CARE GAPS ====================
  console.log('\n─── CARE GAPS ───');
  await test('Care Gaps', 'List', 'GET', `/api/care-gaps/${ORG_ID}`);
  await test('Care Gaps', 'Scan', 'POST', `/api/care-gaps/scan/${ORG_ID}`, {});
  await test('Care Gap Rules', 'List', 'GET', `/api/care-gap-rules/${ORG_ID}`);
  await test('Care Gap Rules', 'Create', 'POST', '/api/care-gap-rules', {
    orgId: ORG_ID, name: 'Diabetes follow-up', priority: 'high', action: 'outbound_call',
    condition: { lastVisitDaysAgo: 90, hasConditions: ['diabetes'] },
    messageEn: 'Time for diabetes check-up', messageAr: 'حان وقت فحص السكري'
  });

  if (createdPatientId) {
    await test('Care Gaps', 'Patient risk', 'GET', `/api/care-gaps/risk/${createdPatientId}`);
  }

  // ==================== ANALYTICS ====================
  console.log('\n─── ANALYTICS ───');
  await test('Analytics', 'Overview', 'GET', '/api/analytics/overview');
  await test('Analytics', 'Appointments by day', 'GET', '/api/analytics/appointments-by-day');
  await test('Analytics', 'Top services', 'GET', '/api/analytics/top-services');
  await test('Analytics', 'Booking channels', 'GET', '/api/analytics/booking-channels');

  // ==================== ENHANCED ANALYTICS v2 ====================
  console.log('\n─── ENHANCED ANALYTICS (v2) ───');
  await test('Analytics V2', 'Overview', 'GET', '/api/analytics-v2/overview');
  await test('Analytics V2', 'Trends', 'GET', '/api/analytics-v2/trends');
  await test('Analytics V2', 'Knowledge gaps', 'GET', '/api/analytics-v2/knowledge-gaps');
  await test('Analytics V2', 'Call drivers', 'GET', '/api/analytics-v2/call-drivers');
  await test('Analytics V2', 'Patient journey', 'GET', '/api/analytics-v2/patient-journey');
  await test('Analytics V2', 'Revenue impact', 'GET', '/api/analytics-v2/revenue-impact');
  await test('Analytics V2', 'Quality', 'GET', '/api/analytics-v2/quality');
  await test('Analytics V2', 'Quality trend', 'GET', '/api/analytics-v2/quality/trend');
  await test('Analytics V2', 'Facility comparison', 'GET', '/api/analytics-v2/facility-comparison');

  // ==================== FLEET ====================
  console.log('\n─── FLEET ───');
  await test('Fleet', 'Overview', 'GET', '/api/fleet/overview');
  await test('Fleet', 'Health', 'GET', '/api/fleet/health');

  // ==================== AUDIT ====================
  console.log('\n─── AUDIT ───');
  await test('Audit', 'List', 'GET', `/api/audit/${ORG_ID}`);
  await test('Audit', 'Export', 'GET', `/api/audit/${ORG_ID}/export`);

  // ==================== SCHEDULER ====================
  console.log('\n─── SCHEDULER ───');
  await test('Scheduler', 'Status', 'GET', '/api/scheduler/status');

  // ==================== AGENT BUILDER ====================
  console.log('\n─── AGENT BUILDER ───');
  await test('Agent Builder', 'List flows', 'GET', '/api/agent-builder/flows');
  await test('Agent Builder', 'List templates', 'GET', '/api/agent-builder/templates');

  const flowRes = await test('Agent Builder', 'Create flow', 'POST', '/api/agent-builder/flows', {
    name: 'تدفق الحجز', description: 'تدفق حجز المواعيد', nodes: [], edges: []
  });
  if (flowRes.ok) createdFlowId = flowRes.data?.agentFlowId || flowRes.data?.id;

  // ==================== PATIENT PORTAL (Auth) ====================
  console.log('\n─── PATIENT PORTAL ───');
  // Login requires phone + dateOfBirth - test with our created patient
  if (createdPatientId) {
    await test('Patient Portal', 'Login', 'POST', '/api/patient-portal/login', {
      phone: '+966500000001', dateOfBirth: '1990-01-15'
    }, { noAuth: true });
  }

  // ==================== WHATSAPP ====================
  console.log('\n─── WHATSAPP ───');
  await test('WhatsApp', 'Health', 'GET', '/api/whatsapp/health', null, { noAuth: true });
  // Webhook POST requires Twilio signature — 403 is expected
  await test('WhatsApp', 'Webhook POST (no sig → 403)', 'POST', '/api/whatsapp/webhook', {
    From: 'whatsapp:+966500000001', Body: 'مرحبا'
  }, { noAuth: true });

  // ==================== PATIENT MEMORY ====================
  console.log('\n─── PATIENT MEMORY ───');
  if (createdPatientId) {
    await test('Patient Memory', 'List', 'GET', `/api/patients/${createdPatientId}/memories`);
    const memRes = await test('Patient Memory', 'Create', 'POST', `/api/patients/${createdPatientId}/memories`, {
      memoryType: 'preference', memoryKey: 'preferred_language', memoryValue: 'ar', confidence: 1.0
    });
    await test('Patient Memory', 'Create allergy', 'POST', `/api/patients/${createdPatientId}/memories`, {
      memoryType: 'allergy', memoryKey: 'penicillin', memoryValue: 'Allergic to penicillin', confidence: 0.9
    });
    await test('Patient Memory', 'List (filter by type)', 'GET', `/api/patients/${createdPatientId}/memories?type=preference`);
  }

  // ==================== PHONE NUMBERS ====================
  console.log('\n─── PHONE NUMBERS ───');
  await test('Phone Numbers', 'List', 'GET', '/api/phone-numbers');
  await test('Phone Numbers', 'Available', 'GET', '/api/phone-numbers/available');

  // ==================== WEBHOOKS ====================
  console.log('\n─── WEBHOOKS ───');
  await test('Webhooks', 'Check availability', 'POST', '/api/webhooks/availability', {
    orgId: ORG_ID, serviceId: createdServiceId || crypto.randomUUID(), date: '2026-03-01'
  }, { noAuth: true });

  // ==================== SUMMARY ====================
  console.log('\n\n════════════════════════════════════════');
  console.log('              SUMMARY');
  console.log('════════════════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const expected = results.filter(r => !r.ok && (r.status === 409 || r.status === 403)).length;
  console.log(`Total: ${results.length} | Passed: ${passed} ✅ | Failed: ${failed} ❌ | Expected failures: ${expected}`);

  if (failed > expected) {
    console.log('\n─── UNEXPECTED FAILURES ───');
    results.filter(r => !r.ok && r.status !== 409 && r.status !== 403).forEach(r => {
      console.log(`  ❌ [${r.status}] ${r.method} ${r.path}`);
      if (r.note) console.log(`     ${r.note.slice(0, 200)}`);
    });
  }

  // Save for report generation
  fs.writeFileSync('test-results-v2.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to test-results-v2.json');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
