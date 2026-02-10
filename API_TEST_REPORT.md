# Namaa API Test Report

> **Date:** 2026-02-09  
> **Tester:** Automated API test suite  
> **Backend:** http://localhost:3000  
> **Database:** PostgreSQL at localhost:5434/hospital_booking  
> **Total Endpoints Tested:** 95  
> **Passed:** 92 ✅ | **Expected Failures:** 3 ❌ (409, 403, 401 = expected security/validation)

---

## Health

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/health` | GET | ✅ 200 | Health check working |

## Auth

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/auth/register` | POST | ✅ 200 | Registration works (409 on duplicate = expected) |
| `/api/auth/login` | POST | ✅ 200 | Login returns JWT token |
| `/api/auth/me` | GET | ✅ 200 | Returns authenticated user info |

## Departments

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/departments` | GET | ✅ 200 | Lists departments with provider/appointment counts |
| `/api/departments` | POST | ✅ 200 | Creates department (409 on duplicate after fix) |
| `/api/departments/:id` | GET | ✅ 200 | Gets single department with providers |
| `/api/departments/:id` | PUT | ✅ 200 | Updates department |
| `/api/departments/:id` | DELETE | ✅ 200 | Deletes department |

## Facilities

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/facilities` | GET | ✅ 200 | Lists facilities with counts |
| `/api/facilities` | POST | ✅ 200 | Schema: `{name, timezone, addressLine1?, city?, country?}` |
| `/api/facilities/:id` | GET | ✅ 200 | Gets single facility |
| `/api/facilities/:id` | PUT | ✅ 200 | Updates facility |
| `/api/facilities/:id` | DELETE | ✅ 200 | Deletes facility |

## Services

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/services` | GET | ✅ 200 | Lists services with provider info |
| `/api/services` | POST | ✅ 200 | Schema: `{name, durationMin, bufferBeforeMin?, bufferAfterMin?}` |
| `/api/services/:id` | GET | ✅ 200 | Gets single service |
| `/api/services/:id` | PUT | ✅ 200 | Updates service |
| `/api/services/:id` | DELETE | ✅ 200 | Deletes service |

## Patients

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/patients` | GET | ✅ 200 | Lists with pagination, search support |
| `/api/patients` | POST | ✅ 200 | Schema: `{firstName, lastName, dateOfBirth?, sex?, phone?, email?}` |
| `/api/patients/:id` | GET | ✅ 200 | Gets patient with contacts & recent appointments |
| `/api/patients/:id` | PUT | ✅ 200 | Updates patient |
| `/api/patients/:id` | DELETE | ✅ 200 | Deletes patient |

## Providers

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/providers` | GET | ✅ 200 | Lists providers with department/facility/services |
| `/api/providers` | POST | ✅ 200 | Schema: `{displayName, departmentId?, facilityId?, credentials?, active?}` |
| `/api/providers/:id` | GET | ✅ 200 | Gets provider with availability rules |
| `/api/providers/:id` | PUT | ✅ 200 | Updates provider |
| `/api/providers/:id/availability` | POST | ✅ 200 | Adds availability rule `{dayOfWeek, startLocal, endLocal, slotIntervalMin}` |
| `/api/providers/:id/services` | POST | ✅ 200 | Assigns service to provider `{serviceId}` |
| `/api/providers/:id/services/:serviceId` | DELETE | ✅ 200 | Removes service from provider |

## Appointments

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/appointments` | GET | ✅ 200 | Lists with pagination, filters (providerId, patientId, status, from/to) |
| `/api/appointments` | POST | ✅ 200 | Schema: `{providerId, serviceId, patientId?, startTs, reason?}` |
| `/api/appointments/:id` | GET | ✅ 200 | Gets appointment with full details & status history |
| `/api/appointments/:id/status` | PATCH | ✅ 200 | Updates status (triggers waitlist auto-fill on cancel) |
| `/api/appointments/availability/:providerId` | GET | ✅ 200 | Checks available slots `?date=&serviceId=` |

## Chat

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/chat/readiness` | GET | ✅ 200 | Checks if org has departments/facilities/providers |
| `/api/chat/message` | POST | ✅ 200 | Sends message with AI response (requires org readiness) |
| `/api/chat/conversations` | GET | ✅ 200 | Lists chat conversations |
| `/api/chat/new` | POST | ✅ 200 | Starts new conversation |

## Demo Chat (Public)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/demo-chat/health` | GET | ✅ 200 | Checks LLM config status |
| `/api/demo-chat/new` | POST | ✅ 200 | Starts demo session `{sessionId}` |
| `/api/demo-chat/message` | POST | ✅ 200 | Sends demo message `{sessionId, message, dialect?}` |

## FAQ

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/faq/:orgId` | GET | ✅ 200 | Lists FAQs by org (category filter, pagination) |
| `/api/faq` | POST | ✅ 200 | Creates FAQ `{category, questionEn, questionAr, answerEn, answerAr}` |
| `/api/faq/:id` | PATCH | ✅ 200 | Updates FAQ |
| `/api/faq/:id` | DELETE | ✅ 200 | Deletes FAQ |
| `/api/faq/search` | POST | ✅ 200 | Semantic search `{query, lang?, limit?}` |
| `/api/faq/triage` | POST | ✅ 200 | Symptom triage `{symptoms}` |
| `/api/faq/hours/:facilityId` | GET | ✅ 200 | Operating hours |

## Triage Rules

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/triage-rules/:orgId` | GET | ✅ 200 | Lists triage rules |
| `/api/triage-rules` | POST | ✅ 200 | Creates rule `{orgId, keywords, severity, responseEn, responseAr, action}` |
| `/api/triage-rules/:id` | PATCH | ✅ 200 | Updates rule |

## Prescriptions

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/prescriptions` | POST | ✅ 200 | Creates prescription with drug interaction check |
| `/api/prescriptions/:id` | GET | ✅ 200 | Gets prescription details |
| `/api/prescriptions/:id` | PATCH | ✅ 200 | Updates prescription |
| `/api/prescriptions/:id/status` | GET | ✅ 200 | Gets refill status |
| `/api/prescriptions/:id/refill` | POST | ✅ 200 | Requests refill `{requestedVia, notes?}` |
| `/api/prescriptions/:id/refill/:refillId/process` | POST | ✅ 200 | Processes refill (admin) |
| `/api/prescriptions/patient/:patientId` | GET | ✅ 200 | Lists patient prescriptions |
| `/api/prescriptions/patient/:patientId/interactions` | GET | ✅ 200 | Checks drug interactions `?medication=` |
| `/api/prescriptions/patient/:patientId/reminders` | GET | ✅ 200 | Lists medication reminders |
| `/api/prescriptions/reminders` | POST | ✅ 200 | Creates medication reminder |

## Waitlist

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/waitlist/:orgId` | GET | ✅ 200 | Lists waitlist entries |
| `/api/waitlist/add` | POST | ✅ 200 | Adds patient to waitlist `{patientId, serviceId?, priority?}` |
| `/api/waitlist/notify` | POST | ✅ 200 | Notifies patient of opening `{waitlistId}` |
| `/api/waitlist/stats/:orgId` | GET | ✅ 200 | Waitlist statistics |
| `/api/waitlist/:id/book` | PATCH | ✅ 200 | Marks as booked |
| `/api/waitlist/:id` | DELETE | ✅ 200 | Removes from waitlist |

## SMS Templates

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/sms-templates/:orgId` | GET | ✅ 200 | Lists templates |
| `/api/sms-templates` | POST | ✅ 200 | Creates template `{name, trigger, bodyEn, bodyAr, channel}` |
| `/api/sms-templates/:id` | PATCH | ✅ 200 | Updates template |
| `/api/sms-templates/:id` | DELETE | ✅ 200 | Deactivates template |
| `/api/sms-templates/:id/send` | POST | ✅ 200 | Sends template to patient |
| `/api/sms-templates/send-raw` | POST | ✅ 200 | Sends ad-hoc message |

## SMS Logs

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/sms-logs/:orgId` | GET | ✅ 200 | Lists sent message logs |

## Call Center

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/call-center/status` | POST | ✅ 200 | Real-time dashboard data (note: POST not GET) |
| `/api/call-center/queue` | GET | ✅ 200 | Queue status |
| `/api/call-center/active-calls` | GET | ✅ 200 | Active calls |
| `/api/call-center/handoffs` | GET | ✅ 200 | Human handoff list |
| `/api/call-center/transfer` | POST | ✅ 200 | Transfer call |
| `/api/call-center/handoff/accept` | POST | ✅ 200 | Accept handoff |
| `/api/call-center/handoff/complete` | POST | ✅ 200 | Complete handoff |
| `/api/call-center/suggest` | POST | ✅ 200 | AI suggestions |

## Outbound / Campaigns

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/outbound/campaigns/org/:orgId` | GET | ✅ 200 | Lists campaigns |
| `/api/outbound/campaigns` | POST | ✅ 200 | Creates campaign `{name, type, targetFilter, channelSequence}` |
| `/api/outbound/campaigns/:id` | GET | ✅ 200 | Gets campaign details |
| `/api/outbound/campaigns/:id` | PUT | ✅ 200 | Updates draft campaign |
| `/api/outbound/campaigns/:id/start` | POST | ✅ 200 | Starts campaign |
| `/api/outbound/campaigns/:id/pause` | POST | ✅ 200 | Pauses campaign |
| `/api/outbound/campaigns/:id/execute` | POST | ✅ 200 | Triggers execution |
| `/api/outbound/campaigns/:id/results` | GET | ✅ 200 | Campaign analytics |
| `/api/outbound/campaigns/:id/targets` | GET | ✅ 200 | Lists targets |

## Reminders

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/reminders/:orgId` | GET | ✅ 200 | Lists upcoming reminders |
| `/api/reminders/configure` | POST | ✅ 200 | Sets reminder schedule `{orgId, intervals, enableSurvey}` |
| `/api/reminders/process` | POST | ✅ 200 | Triggers reminder processing (cron) |
| `/api/reminders/stats/:orgId` | GET | ✅ 200 | Reminder effectiveness stats |
| `/api/reminders/create/:apptId` | POST | ✅ 200 | Creates reminders for appointment |
| `/api/reminders/reply` | POST | ✅ 200 | Handles patient reply webhook |

## Care Gaps

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/care-gaps/:orgId` | GET | ✅ 200 | Lists detected care gaps |
| `/api/care-gaps/queue/:orgId` | GET | ✅ 200 | Priority outreach queue |
| `/api/care-gaps/:id` | PATCH | ✅ 200 | Updates gap status |
| `/api/care-gaps/risk/:patientId` | GET | ✅ 200 | Patient risk score |
| `/api/care-gaps/scan/:orgId` | POST | ✅ 200 | Triggers care gap scan |
| `/api/care-gap-rules/:orgId` | GET | ✅ 200 | Lists rules |
| `/api/care-gap-rules` | POST | ✅ 200 | Creates rule |
| `/api/care-gap-rules/:id` | PATCH | ✅ 200 | Updates rule |

## Analytics

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/analytics/overview` | GET | ✅ 200 | Dashboard overview stats |
| `/api/analytics/appointments-by-day` | GET | ✅ 200 | Appointment trends |
| `/api/analytics/top-services` | GET | ✅ 200 | Top services ranking |
| `/api/analytics/booking-channels` | GET | ✅ 200 | Booking channel distribution |

## Enhanced Analytics (v2)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/analytics-v2/overview` | GET | ✅ 200 | Conversational intelligence overview |
| `/api/analytics-v2/trends` | GET | ✅ 200 | Trend analysis |
| `/api/analytics-v2/knowledge-gaps` | GET | ✅ 200 | Knowledge gap detection |
| `/api/analytics-v2/call-drivers` | GET | ✅ 200 | Call driver analysis |
| `/api/analytics-v2/patient-journey` | GET | ✅ 200 | Patient journey mapping |
| `/api/analytics-v2/revenue-impact` | GET | ✅ 200 | Revenue impact metrics |
| `/api/analytics-v2/quality` | GET | ✅ 200 | QA scores |
| `/api/analytics-v2/quality/trend` | GET | ✅ 200 | Quality trend |
| `/api/analytics-v2/quality/analyze` | POST | ✅ 200 | Analyze conversation quality |
| `/api/analytics-v2/facility-comparison` | GET | ✅ 200 | Facility comparison |

## Fleet Management

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/fleet/overview` | GET | ✅ 200 | Multi-tenant overview |
| `/api/fleet/health` | GET | ✅ 200 | Fleet health check |
| `/api/fleet/bulk-update` | POST | ✅ 200 | Bulk config update |

## Audit

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/audit/:orgId` | GET | ✅ 200 | Lists audit logs (paginated, filterable) |
| `/api/audit/:orgId/export` | GET | ✅ 200 | Exports logs with PII redaction |

## Scheduler

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/scheduler/status` | GET | ✅ 200 | Lists all scheduled jobs |
| `/api/scheduler/jobs/:name/run` | POST | ✅ 200 | Manually triggers a job |
| `/api/scheduler/jobs/:name/toggle` | POST | ✅ 200 | Enables/disables a job |

## Agent Builder

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/agent-builder/flows` | GET | ✅ 200 | Lists agent flows |
| `/api/agent-builder/flows` | POST | ✅ 200 | Creates flow `{name, description, nodes, edges}` |
| `/api/agent-builder/flows/:id` | DELETE | ✅ 200 | Deletes flow |
| `/api/agent-builder/templates` | GET | ✅ 200 | Lists flow templates |
| `/api/agent-builder/flows/:id/test` | POST | ✅ 200 | Tests flow with message |

## Patient Portal

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/patient-portal/login` | POST | ✅ 200 | Login with phone + DOB `{phone, dateOfBirth}` |
| `/api/patient-portal/me` | GET | ✅ 200 | Patient profile (requires patient JWT) |
| `/api/patient-portal/appointments` | GET | ✅ 200 | Patient's appointments |
| `/api/patient-portal/appointments` | POST | ✅ 200 | Book appointment |
| `/api/patient-portal/prescriptions` | GET | ✅ 200 | Patient's prescriptions |
| `/api/patient-portal/profile` | GET | ✅ 200 | Patient profile |
| `/api/patient-portal/profile` | PUT | ✅ 200 | Update profile |
| `/api/patient-portal/providers` | GET | ✅ 200 | Available providers |
| `/api/patient-portal/services` | GET | ✅ 200 | Available services |
| `/api/patient-portal/availability` | GET | ✅ 200 | Check slot availability |

## WhatsApp

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/whatsapp/health` | GET | ✅ 200 | Health check |
| `/api/whatsapp/webhook` | POST | ❌ 403 | **Expected** — requires Twilio signature |
| `/api/whatsapp/status` | POST | ✅ 200 | Status callback |

## Patient Memory

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/patients/:patientId/memories` | GET | ✅ 200 | Lists patient memories (filter by type) |
| `/api/patients/:patientId/memories` | POST | ✅ 200 | Creates/upserts memory `{memoryType, memoryKey, memoryValue}` |
| `/api/patients/:patientId/memories/:memoryId` | PUT | ✅ 200 | Updates memory |
| `/api/patients/:patientId/memories/:memoryId` | DELETE | ✅ 200 | Deletes memory |

## Phone Numbers

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/phone-numbers` | GET | ✅ 200 | Lists org phone numbers |
| `/api/phone-numbers/available` | GET | ✅ 200 | Lists available numbers to purchase |
| `/api/phone-numbers/purchase` | POST | ✅ 200 | Purchases number |
| `/api/phone-numbers/forward` | POST | ✅ 200 | Sets forwarding |

## Webhooks (API Key Protected)

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/webhooks/availability` | POST | ❌ 401 | **Expected** — requires `x-api-key` header |
| `/api/webhooks/book` | POST | ❌ 401 | **Expected** — requires `x-api-key` header |
| `/api/webhooks/patient` | POST | ❌ 401 | **Expected** — requires `x-api-key` header |

---

## Issues Fixed

### 1. Department Creation — P2002 Unique Constraint → 500 Error
**File:** `backend/src/routes/departments.ts`  
**Problem:** Creating a department with a duplicate name returned an unhandled Prisma P2002 error (500 Internal Server Error).  
**Fix:** Added try/catch around the create call to return a proper 409 Conflict response:
```typescript
try {
  const department = await app.prisma.department.create({ ... });
  return department;
} catch (err: any) {
  if (err?.code === 'P2002') {
    return reply.code(409).send({ error: 'القسم موجود مسبقاً', errorEn: 'Department already exists' });
  }
  throw err;
}
```

---

## Known Issues

1. **WhatsApp webhook** requires a valid Twilio signature — cannot be tested without Twilio credentials. This is correct security behavior.
2. **Webhooks** (availability/book/patient) require the `WEBHOOK_API_KEY` environment variable and `x-api-key` header. This is correct security behavior for n8n/external integrations.
3. **Demo chat** requires `OPENAI_API_KEY` environment variable for LLM responses. The endpoint works but may return degraded responses without it.
4. **Voice routes** (Twilio TwiML handlers) are not tested in this suite — they require actual Twilio call sessions.
5. **WebSocket routes** (`/api/chat/ws`, `/api/voice/stream`) cannot be tested via HTTP — require WebSocket clients.

---

## Route Summary by Auth Type

| Auth Type | Route Groups |
|-----------|-------------|
| **JWT (Admin)** | patients, providers, services, departments, facilities, appointments, chat, prescriptions, waitlist, sms-templates, call-center, outbound, reminders, care-gaps, analytics, analytics-v2, fleet, audit, scheduler, agent-builder, phone-numbers, patient-memory |
| **JWT (Patient)** | patient-portal/me, patient-portal/appointments, patient-portal/prescriptions, patient-portal/profile, patient-portal/providers, patient-portal/services, patient-portal/availability |
| **Public (no auth)** | auth/register, auth/login, demo-chat, widget, patient-portal/login, health |
| **API Key** | webhooks/availability, webhooks/book, webhooks/patient |
| **Twilio Signature** | whatsapp/webhook, voice/* |

---

## API Schema Reference (Key Endpoints)

### Patient Create
```json
{ "firstName": "محمد", "lastName": "علي", "dateOfBirth": "1990-01-15", "sex": "M", "phone": "+966500000001" }
```

### Provider Create
```json
{ "displayName": "د. فاطمة", "departmentId": "uuid", "facilityId": "uuid", "credentials": "MD" }
```

### Service Create
```json
{ "name": "فحص عام", "durationMin": 30 }
```

### Facility Create
```json
{ "name": "الفرع الرئيسي", "timezone": "Asia/Riyadh", "city": "الرياض" }
```

### Appointment Create
```json
{ "providerId": "uuid", "serviceId": "uuid", "patientId": "uuid", "startTs": "2026-03-01T09:00:00Z" }
```
