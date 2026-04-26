-- Add trial_ends_at to orgs for free-trial tracking.
-- New orgs get a 14-day trial set at registration (see routes/auth.ts).
-- Existing orgs created within the last 14 days are back-filled; older orgs
-- stay null (they either already subscribed or need to re-engage through sales).
ALTER TABLE "orgs" ADD COLUMN "trial_ends_at" TIMESTAMPTZ(6);

UPDATE "orgs"
SET "trial_ends_at" = NOW() + INTERVAL '14 days'
WHERE "trial_ends_at" IS NULL
  AND "created_at" > NOW() - INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM "tawafud_subscriptions" s
    WHERE s."org_id" = "orgs"."org_id"
      AND s."status" = 'active'
      AND s."end_date" > NOW()
  );
