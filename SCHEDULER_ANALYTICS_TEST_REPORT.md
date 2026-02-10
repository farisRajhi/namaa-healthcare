# Scheduler, Campaigns & Analytics — Full Test Report

**Date:** 2026-02-09  
**Tester:** Automated (subagent)  
**Backend:** localhost:3000  
**Result:** ✅ **37/37 endpoints passing** (after fixes)

---

## Summary

| Group | Endpoints | Before Fix | After Fix |
|-------|-----------|------------|-----------|
| Scheduler | 3 | 1/3 ❌ | 3/3 ✅ |
| Campaigns | 4 | 0/4 ❌ | 4/4 ✅ |
| Care Gaps | 5 | 1/5 ❌ | 5/5 ✅ |
| Reminders | 3 | 1/3 ❌ | 3/3 ✅ |
| Analytics v1 | 4 | 0/4 ❌ | 4/4 ✅ |
| Analytics v2 | 9 | 0/9 ❌ | 9/9 ✅ |
| Audit | 2 | 2/2 ✅ | 2/2 ✅ |
| Call Center | 4 | 0/4 ❌ | 4/4 ✅ |
| Waitlist | 4 | 1/4 ❌ | 4/4 ✅ |
| **Total** | **37** | **6/37** | **37/37** |

---

## Issues Found & Fixed

### Issue 1: Missing Org-Scoped Route Aliases (Major — 28 endpoints)

**Root Cause:** Routes were implemented with different URL patterns than the API spec. For example:
- Analytics used `/api/analytics/overview` (orgId from JWT) but the spec expected `/api/analytics/:orgId/overview`
- Call center used `/api/call-center/queue` instead of `/api/call-center/:orgId/queue`
- Waitlist POST was at `/api/waitlist/add` instead of `/api/waitlist/:orgId`
- Reminders stats were at `/api/reminders/stats/:orgId` instead of `/api/reminders/:orgId/stats`

**Fix:** Added org-scoped alias routes (`/:orgId/<endpoint>`) to all affected route files while preserving backward compatibility with original routes. Both patterns now work.

**Files modified:**
- `backend/src/routes/analytics.ts` — Added `/:orgId/overview`, `/:orgId/trends`, `/:orgId/services`, `/:orgId/channels`
- `backend/src/routes/analyticsEnhanced.ts` — Added 9 org-scoped routes
- `backend/src/routes/callCenter.ts` — Added `/:orgId/status`, `/:orgId/queue`, `/:orgId/active`, `/:orgId/handoffs`
- `backend/src/routes/waitlist.ts` — Added `POST /:orgId`, `POST /:orgId/:id/notify`, `GET /:orgId/stats`
- `backend/src/routes/reminders.ts` — Added `POST /:orgId/configure`, `GET /:orgId/stats`
- `backend/src/routes/careGaps.ts` — Added `POST /:orgId/scan`, `GET /:orgId/risk`, `GET /:orgId/rules`, `POST /:orgId/rules`

### Issue 2: Missing Scheduler Routes (2 endpoints)

**Root Cause:** `GET /api/scheduler/jobs` and `POST /api/scheduler/trigger/:jobName` did not exist. Only `GET /status` and `POST /jobs/:name/run` existed.

**Fix:** Added `GET /jobs` (alias returning same data as `/status`) and `POST /trigger/:jobName` (alias for `/jobs/:name/run`).

**File modified:** `backend/src/routes/scheduler.ts`

### Issue 3: Campaign Routes Not Registered (4 endpoints)

**Root Cause:** Campaigns were only accessible under `/api/outbound/campaigns/*`. No routes existed at `/api/campaigns/:orgId`.

**Fix:** Created new `backend/src/routes/campaigns.ts` with org-scoped CRUD routes and registered it in `backend/src/routes/index.ts` with prefix `/api/campaigns`.

**Files created:** `backend/src/routes/campaigns.ts`  
**Files modified:** `backend/src/routes/index.ts`

### Issue 4: Missing Analytics v2 Endpoints (5 new endpoints)

**Root Cause:** Several analytics v2 endpoints from the spec were not implemented:
- `GET /:orgId/containment` — AI containment rate metrics
- `GET /:orgId/satisfaction` — Patient satisfaction scores  
- `GET /:orgId/predictive` — Predictive analytics
- `GET /:orgId/benchmarks` — Industry benchmark comparison
- `POST /:orgId/export` — Analytics data export

**Fix:** Implemented all 5 endpoints with proper business logic:
- **Containment:** Derives from conversational intelligence overview (aiResolvedPct)
- **Satisfaction:** Derives from call quality scores (no separate survey model yet)
- **Predictive:** Uses 30-day historical averages to project call/appointment volume
- **Benchmarks:** Compares org metrics against industry standard targets
- **Export:** Aggregates overview + call drivers + quality into a single exportable payload

### Issue 5: Fleet Endpoints Under Wrong Prefix

**Root Cause:** Fleet management was at `/api/fleet/overview` and `/api/fleet/health`, but analytics v2 spec expected them at `/api/analytics-v2/:orgId/fleet` and `/api/analytics-v2/:orgId/fleet/health`.

**Fix:** Added org-scoped fleet routes under the analytics-v2 prefix. Original `/api/fleet/*` routes still work.

---

## Scheduler — 9 Cron Jobs Verified

All 9 cron jobs are running:

| Job Name | Schedule | Status |
|----------|----------|--------|
| appointment-reminders | `*/5 * * * *` | ✅ Running |
| campaign-executor | `*/10 * * * *` | ✅ Running |
| care-gap-scanner | `0 2 * * *` | ✅ Running |
| medication-reminders | `*/30 * * * *` | ✅ Running |
| quality-analysis | `0 * * * *` | ✅ Running |
| waitlist-expiry | `0 * * * *` | ✅ Running |
| hold-expiration | `* * * * *` | ✅ Running |
| care-gap-campaign | `0 6 * * *` | ✅ Running |
| waitlist-expiry-renotify | `*/30 * * * *` | ✅ Running |

Manual trigger via `POST /api/scheduler/trigger/:jobName` works correctly.

---

## Detailed Endpoint Results

### 1. Scheduler (3/3 ✅)
```
✅ [200] GET  /api/scheduler/status
✅ [200] GET  /api/scheduler/jobs
✅ [200] POST /api/scheduler/trigger/appointment-reminders
```

### 2. Campaigns (4/4 ✅)
```
✅ [200] GET  /api/campaigns/:orgId
✅ [200] POST /api/campaigns/:orgId
✅ [200] GET  /api/campaigns/:orgId/:id
✅ [200] PUT  /api/campaigns/:orgId/:id
```

### 3. Care Gaps (5/5 ✅)
```
✅ [200] GET  /api/care-gaps/:orgId
✅ [200] POST /api/care-gaps/:orgId/scan
✅ [200] GET  /api/care-gaps/:orgId/risk
✅ [200] GET  /api/care-gaps/:orgId/rules
✅ [200] POST /api/care-gaps/:orgId/rules
```

### 4. Reminders (3/3 ✅)
```
✅ [200] GET  /api/reminders/:orgId
✅ [200] POST /api/reminders/:orgId/configure
✅ [200] GET  /api/reminders/:orgId/stats
```

### 5. Analytics v1 (4/4 ✅)
```
✅ [200] GET  /api/analytics/:orgId/overview
✅ [200] GET  /api/analytics/:orgId/trends
✅ [200] GET  /api/analytics/:orgId/services
✅ [200] GET  /api/analytics/:orgId/channels
```

### 6. Analytics v2 (9/9 ✅)
```
✅ [200] GET  /api/analytics-v2/:orgId/call-drivers
✅ [200] GET  /api/analytics-v2/:orgId/containment
✅ [200] GET  /api/analytics-v2/:orgId/satisfaction
✅ [200] GET  /api/analytics-v2/:orgId/predictive
✅ [200] GET  /api/analytics-v2/:orgId/benchmarks
✅ [200] GET  /api/analytics-v2/:orgId/quality
✅ [200] GET  /api/analytics-v2/:orgId/fleet
✅ [200] GET  /api/analytics-v2/:orgId/fleet/health
✅ [200] POST /api/analytics-v2/:orgId/export
```

### 7. Audit (2/2 ✅)
```
✅ [200] GET  /api/audit/:orgId
✅ [200] GET  /api/audit/:orgId/export
```

### 8. Call Center (4/4 ✅)
```
✅ [200] GET  /api/call-center/:orgId/status
✅ [200] GET  /api/call-center/:orgId/queue
✅ [200] GET  /api/call-center/:orgId/active
✅ [200] GET  /api/call-center/:orgId/handoffs
```

### 9. Waitlist (4/4 ✅)
```
✅ [200] GET  /api/waitlist/:orgId
✅ [200] POST /api/waitlist/:orgId
✅ [200] POST /api/waitlist/:orgId/:id/notify
✅ [200] GET  /api/waitlist/:orgId/stats
```

---

## Notes

- **Backward compatibility:** All original routes still work. New org-scoped routes are aliases.
- **TypeScript build:** Clean compile with no errors.
- **Auth:** All protected routes correctly require JWT Bearer token.
- **Org isolation:** All org-scoped routes verify `request.user.orgId === params.orgId`.
- **Data integrity:** Waitlist, campaigns, and care gap rules properly create/read/update records in the database.
