import fs from 'fs';

const BASE = 'http://localhost:3000';
const TOKEN = fs.readFileSync('test-token.txt', 'utf8').trim();
const results = [];
let createdPatientId = null;
let createdProviderId = null;
let createdAppointmentId = null;
let createdServiceId = null;
let createdDepartmentId = null;
let createdFacilityId = null;

function headers(extra = {}) {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`, ...extra };
}

async function test(group, endpoint, method, path, body = null, opts = {}) {
  const url = `${BASE}${path}`;
  const fetchOpts = { method, headers: opts.noAuth ? { 'Content-Type': 'application/json' } : headers() };
  if (body) fetchOpts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(url, fetchOpts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    
    const status = res.status;
    const ok = status >= 200 && status < 300;
    const icon = ok ? '✅' : '❌';
    const note = ok ? '' : (typeof data === 'object' ? JSON.stringify(data).slice(0, 200) : String(data).slice(0, 200));
    
    console.log(`${icon} [${status}] ${method} ${path} ${note}`);
    results.push({ group, endpoint, method, path, status, ok, note, data });
    return { status, ok, data };
  } catch (err) {
    console.log(`❌ [ERR] ${method} ${path} - ${err.message}`);
    results.push({ group, endpoint, method, path, status: 'ERR', ok: false, note: err.message, data: null });
    return { status: 'ERR', ok: false, data: null };
  }
}

async function run() {
  console.log('=== TAWAFUD API ENDPOINT TESTS ===\n');

  // ==================== AUTH ====================
  console.log('\n--- AUTH ---');
  await test('Auth', 'Register (duplicate)', 'POST', '/api/auth/register', {
    orgName: 'Test2', orgNameAr: 'تست2', email: 'testapi@shifa.sa', password: 'Test1234!', name: 'Test', nameAr: 'تست'
  }, { noAuth: true });
  
  const loginRes = await test('Auth', 'Login', 'POST', '/api/auth/login', {
    email: 'testapi@shifa.sa', password: 'Test1234!'
  }, { noAuth: true });
  
  await test('Auth', 'Me', 'GET', '/api/auth/me');

  // ==================== PATIENTS ====================
  console.log('\n--- PATIENTS ---');
  await test('Patients', 'List', 'GET', '/api/patients');
  
  const patRes = await test('Patients', 'Create', 'POST', '/api/patients', {
    name: 'محمد علي', nameAr: 'محمد علي', phone: '+966500000001',
    email: 'mohammed@test.sa', dateOfBirth: '1990-01-15',
    gender: 'male', nationalId: '1234567890'
  });
  if (patRes.ok && patRes.data?.id) {
    createdPatientId = patRes.data.id;
  } else if (patRes.ok && patRes.data?.patient?.id) {
    createdPatientId = patRes.data.patient.id;
  }
  
  if (createdPatientId) {
    await test('Patients', 'Get by ID', 'GET', `/api/patients/${createdPatientId}`);
    await test('Patients', 'Update', 'PUT', `/api/patients/${createdPatientId}`, { name: 'محمد علي أحمد' });
  } else {
    // Try listing and getting first patient
    console.log('   (no patient created, trying to list)');
  }

  // ==================== PROVIDERS ====================
  console.log('\n--- PROVIDERS ---');
  await test('Providers', 'List', 'GET', '/api/providers');
  
  const provRes = await test('Providers', 'Create', 'POST', '/api/providers', {
    name: 'د. فاطمة', nameAr: 'د. فاطمة الزهراء', specialty: 'general',
    specialtyAr: 'طب عام', email: 'fatima@test.sa', phone: '+966500000002',
    licenseNumber: 'LIC-001'
  });
  if (provRes.ok && provRes.data?.id) createdProviderId = provRes.data.id;
  else if (provRes.ok && provRes.data?.provider?.id) createdProviderId = provRes.data.provider.id;

  // ==================== SERVICES ====================
  console.log('\n--- SERVICES ---');
  await test('Services', 'List', 'GET', '/api/services');
  
  const svcRes = await test('Services', 'Create', 'POST', '/api/services', {
    name: 'فحص عام', nameAr: 'فحص عام', duration: 30, price: 200,
    category: 'consultation', categoryAr: 'استشارة'
  });
  if (svcRes.ok && svcRes.data?.id) createdServiceId = svcRes.data.id;
  else if (svcRes.ok && svcRes.data?.service?.id) createdServiceId = svcRes.data.service.id;

  // ==================== DEPARTMENTS ====================
  console.log('\n--- DEPARTMENTS ---');
  await test('Departments', 'List', 'GET', '/api/departments');
  
  const deptRes = await test('Departments', 'Create', 'POST', '/api/departments', {
    name: 'الطب العام', nameAr: 'الطب العام', description: 'General Medicine',
    descriptionAr: 'قسم الطب العام'
  });
  if (deptRes.ok && deptRes.data?.id) createdDepartmentId = deptRes.data.id;
  else if (deptRes.ok && deptRes.data?.department?.id) createdDepartmentId = deptRes.data.department.id;

  // ==================== FACILITIES ====================
  console.log('\n--- FACILITIES ---');
  await test('Facilities', 'List', 'GET', '/api/facilities');
  
  const facRes = await test('Facilities', 'Create', 'POST', '/api/facilities', {
    name: 'الفرع الرئيسي', nameAr: 'الفرع الرئيسي', address: '123 Main St',
    addressAr: 'شارع الرئيسي 123', phone: '+966500000003', type: 'clinic'
  });
  if (facRes.ok && facRes.data?.id) createdFacilityId = facRes.data.id;
  else if (facRes.ok && facRes.data?.facility?.id) createdFacilityId = facRes.data.facility.id;

  // ==================== APPOINTMENTS ====================
  console.log('\n--- APPOINTMENTS ---');
  await test('Appointments', 'List', 'GET', '/api/appointments');
  
  const apptBody = {
    patientId: createdPatientId || 'dummy-id',
    providerId: createdProviderId || 'dummy-id',
    serviceId: createdServiceId || undefined,
    date: '2026-03-01',
    startTime: '2026-03-01T09:00:00Z',
    endTime: '2026-03-01T09:30:00Z',
    type: 'consultation',
    notes: 'Test appointment'
  };
  const apptRes = await test('Appointments', 'Create', 'POST', '/api/appointments', apptBody);
  if (apptRes.ok && apptRes.data?.id) createdAppointmentId = apptRes.data.id;
  else if (apptRes.ok && apptRes.data?.appointment?.id) createdAppointmentId = apptRes.data.appointment.id;

  if (createdAppointmentId) {
    await test('Appointments', 'Get by ID', 'GET', `/api/appointments/${createdAppointmentId}`);
  }

  // ==================== CHAT ====================
  console.log('\n--- CHAT ---');
  await test('Chat', 'Send message', 'POST', '/api/chat/message', {
    message: 'مرحبا، أريد حجز موعد', language: 'ar'
  });
  
  await test('Chat', 'Get history', 'GET', '/api/chat/history');

  // ==================== DEMO CHAT ====================
  console.log('\n--- DEMO CHAT ---');
  await test('Demo Chat', 'Send', 'POST', '/api/demo-chat/message', {
    message: 'Hello, what services do you offer?', language: 'en'
  }, { noAuth: true });

  // ==================== FAQ ====================
  console.log('\n--- FAQ ---');
  await test('FAQ', 'List', 'GET', '/api/faq');
  await test('FAQ', 'Search', 'GET', '/api/faq/search?q=appointment');
  await test('FAQ', 'Create', 'POST', '/api/faq', {
    question: 'ما هي ساعات العمل؟', questionAr: 'ما هي ساعات العمل؟',
    answer: 'من 8 صباحاً إلى 10 مساءً', answerAr: 'من 8 صباحاً إلى 10 مساءً',
    category: 'general'
  });

  // ==================== WAITLIST ====================
  console.log('\n--- WAITLIST ---');
  await test('Waitlist', 'List', 'GET', '/api/waitlist');
  if (createdPatientId) {
    await test('Waitlist', 'Add', 'POST', '/api/waitlist', {
      patientId: createdPatientId,
      serviceId: createdServiceId || undefined,
      providerId: createdProviderId || undefined,
      priority: 'normal',
      notes: 'Test waitlist entry'
    });
  }

  // ==================== SMS TEMPLATES ====================
  console.log('\n--- SMS TEMPLATES ---');
  await test('SMS Templates', 'List', 'GET', '/api/sms-templates');
  await test('SMS Templates', 'Create', 'POST', '/api/sms-templates', {
    name: 'تذكير موعد', nameAr: 'تذكير موعد', type: 'appointment_reminder',
    body: 'مرحبا {{patientName}}، لديك موعد يوم {{date}}',
    bodyAr: 'مرحبا {{patientName}}، لديك موعد يوم {{date}}'
  });

  // ==================== SMS LOGS ====================
  console.log('\n--- SMS LOGS ---');
  await test('SMS Logs', 'List', 'GET', '/api/sms-logs');

  // ==================== CALL CENTER ====================
  console.log('\n--- CALL CENTER ---');
  await test('Call Center', 'Status', 'GET', '/api/call-center/status');
  await test('Call Center', 'Queue', 'GET', '/api/call-center/queue');
  await test('Call Center', 'Agents', 'GET', '/api/call-center/agents');

  // ==================== OUTBOUND / CAMPAIGNS ====================
  console.log('\n--- OUTBOUND / CAMPAIGNS ---');
  await test('Outbound', 'List campaigns', 'GET', '/api/outbound/campaigns');
  await test('Outbound', 'Create campaign', 'POST', '/api/outbound/campaigns', {
    name: 'حملة تذكير', type: 'reminder', status: 'draft',
    message: 'تذكير بموعدك القادم'
  });

  // ==================== REMINDERS ====================
  console.log('\n--- REMINDERS ---');
  await test('Reminders', 'List', 'GET', '/api/reminders');
  await test('Reminders', 'Config', 'GET', '/api/reminders/config');

  // ==================== CARE GAPS ====================
  console.log('\n--- CARE GAPS ---');
  await test('Care Gaps', 'List', 'GET', '/api/care-gaps');
  await test('Care Gaps', 'Summary', 'GET', '/api/care-gaps/summary');
  await test('Care Gap Rules', 'List', 'GET', '/api/care-gap-rules');

  // ==================== ANALYTICS ====================
  console.log('\n--- ANALYTICS ---');
  await test('Analytics', 'Overview', 'GET', '/api/analytics/overview');
  await test('Analytics', 'Appointments', 'GET', '/api/analytics/appointments');
  await test('Analytics', 'Patients', 'GET', '/api/analytics/patients');
  await test('Analytics', 'Revenue', 'GET', '/api/analytics/revenue');

  // ==================== ENHANCED ANALYTICS ====================
  console.log('\n--- ENHANCED ANALYTICS (v2) ---');
  await test('Analytics V2', 'Overview', 'GET', '/api/analytics-v2/overview');
  await test('Analytics V2', 'Conversations', 'GET', '/api/analytics-v2/conversations');
  await test('Analytics V2', 'Call drivers', 'GET', '/api/analytics-v2/call-drivers');
  await test('Analytics V2', 'QA scores', 'GET', '/api/analytics-v2/qa-scores');

  // ==================== FLEET ====================
  console.log('\n--- FLEET ---');
  await test('Fleet', 'Overview', 'GET', '/api/fleet/overview');
  await test('Fleet', 'Facilities', 'GET', '/api/fleet/facilities');

  // ==================== AUDIT ====================
  console.log('\n--- AUDIT ---');
  await test('Audit', 'List', 'GET', '/api/audit');
  await test('Audit', 'Stats', 'GET', '/api/audit/stats');

  // ==================== SCHEDULER ====================
  console.log('\n--- SCHEDULER ---');
  await test('Scheduler', 'Status', 'GET', '/api/scheduler/status');
  await test('Scheduler', 'Jobs', 'GET', '/api/scheduler/jobs');

  // ==================== AGENT BUILDER ====================
  console.log('\n--- AGENT BUILDER ---');
  await test('Agent Builder', 'List flows', 'GET', '/api/agent-builder/flows');
  await test('Agent Builder', 'List templates', 'GET', '/api/agent-builder/templates');
  await test('Agent Builder', 'Create flow', 'POST', '/api/agent-builder/flows', {
    name: 'تدفق الحجز', description: 'تدفق حجز المواعيد',
    nodes: [], edges: []
  });

  // ==================== PATIENT PORTAL ====================
  console.log('\n--- PATIENT PORTAL ---');
  await test('Patient Portal', 'Login', 'POST', '/api/patient-portal/login', {
    phone: '+966500000001', otp: '123456'
  }, { noAuth: true });
  
  await test('Patient Portal', 'Request OTP', 'POST', '/api/patient-portal/request-otp', {
    phone: '+966500000001'
  }, { noAuth: true });

  // ==================== WHATSAPP ====================
  console.log('\n--- WHATSAPP ---');
  await test('WhatsApp', 'Webhook GET (verify)', 'GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test&hub.challenge=test123', null, { noAuth: true });
  await test('WhatsApp', 'Webhook POST', 'POST', '/api/whatsapp/webhook', {
    From: 'whatsapp:+966500000001', Body: 'مرحبا'
  }, { noAuth: true });

  // ==================== PATIENT MEMORY ====================
  console.log('\n--- PATIENT MEMORY ---');
  if (createdPatientId) {
    await test('Patient Memory', 'List', 'GET', `/api/patients/${createdPatientId}/memory`);
    await test('Patient Memory', 'Add', 'POST', `/api/patients/${createdPatientId}/memory`, {
      type: 'preference', key: 'preferred_language', value: 'ar',
      note: 'Patient prefers Arabic'
    });
  } else {
    await test('Patient Memory', 'List (no patient)', 'GET', '/api/patients/dummy-id/memory');
  }

  // ==================== TRIAGE RULES ====================
  console.log('\n--- TRIAGE RULES ---');
  await test('Triage Rules', 'List', 'GET', '/api/triage-rules');

  // ==================== PHONE NUMBERS ====================
  console.log('\n--- PHONE NUMBERS ---');
  await test('Phone Numbers', 'List', 'GET', '/api/phone-numbers');

  // ==================== WEBHOOKS ====================
  console.log('\n--- WEBHOOKS ---');
  await test('Webhooks', 'Twilio status', 'POST', '/api/webhooks/twilio/status', {
    CallSid: 'test', CallStatus: 'completed'
  }, { noAuth: true });

  // ==================== HEALTH ====================
  console.log('\n--- HEALTH ---');
  await test('Health', 'Health check', 'GET', '/health', null, { noAuth: true });

  // ==================== SUMMARY ====================
  console.log('\n\n========== SUMMARY ==========');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Total: ${results.length} | Passed: ${passed} ✅ | Failed: ${failed} ❌`);
  
  console.log('\n--- FAILURES ---');
  results.filter(r => !r.ok).forEach(r => {
    console.log(`  ❌ [${r.status}] ${r.method} ${r.path} - ${r.note}`);
  });

  // Save results to JSON for report generation
  fs.writeFileSync('test-results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to test-results.json');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
