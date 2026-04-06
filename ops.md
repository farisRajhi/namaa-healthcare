# Tawafud — Ops & Security Status

> Last updated: 2026-02-23 | QA Re-test after critical-fixes patch

---

## QA / Security Re-test Results

| # | Fix | Status | Evidence |
|---|-----|--------|----------|
| 1 | **Twilio Signature — appointments** `/cancel-by-sms` | ✅ | `preHandler: validateTwilioSignature` at line 295 |
| 2 | **Twilio Signature — voice** `/fallback`, `/outbound-response`, `/outbound-script` | ✅ | lines 199/307/441 — all three use `validateTwilioSignature` as `preHandler` |
| 3 | **Voice Auth** `/make-call` requires `app.authenticate` | ✅ | `preHandler: [app.authenticate]` at line 221 |
| 4 | **Rate Limiting** patientAuth — 5 attempts / 15 min per IP | ✅ | `@fastify/rate-limit` registered with `max:5`, `timeWindow:'15 minutes'`, returns HTTP 429 |
| 5 | **JWT Guard** — server refuses to start without real `JWT_SECRET` | ✅ | `app.ts` checks `INSECURE_DEFAULTS` set + empty string, calls `process.exit(1)` if missing |
| 6 | **Sex Enum** `patients.ts` uses `z.enum(['male','female'])` | ✅ | line 9 in patients.ts |
| 7 | **HTTP Status** appointments + payments return 404/400 on errors | ✅ | appointments: 404 (not found), 400 (bad input); payments: 400, 404, 401, 500 all used correctly |
| 8 | **Moyasar Webhook** signature always enforced (no NODE_ENV gate) | ✅ | No `NODE_ENV` in payments.ts; comment reads "always enforced regardless of environment" |
| 9 | **TypeScript** `npx tsc --noEmit` | ✅ | Zero errors (clean exit, no output) |

---

## VERDICT: ✅ PASS

All 8 critical fixes are correctly implemented and TypeScript compiles cleanly.

---

## Notes

- `twilioVerify.ts` skips verification ONLY when `NODE_ENV=development` AND `SKIP_TWILIO_VERIFY=true` are both set — acceptable for local dev, not a bypass in staging/production.
- Moyasar webhook uses `crypto.timingSafeEqual` to prevent timing attacks.
- JWT guard blocks known insecure defaults (`secret`, `changeme`, `your-super-secret-key-change-in-production`, empty string).
- Rate limit on patient login is scoped per IP (not per phone), which is appropriate for a shared-NAT environment.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (Fastify) |
| ORM | Prisma + PostgreSQL |
| Voice | Twilio + ElevenLabs |
| AI | OpenAI / Gemini |
| Payments | Moyasar |
