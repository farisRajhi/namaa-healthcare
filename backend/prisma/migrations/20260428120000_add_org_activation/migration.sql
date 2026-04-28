-- Add platform-admin gated activation to orgs.
-- New orgs default to is_activated=false (admin must activate from platform panel).
-- Existing orgs are grandfathered to is_activated=true so current users keep access.
ALTER TABLE "orgs" ADD COLUMN "is_activated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orgs" ADD COLUMN "activated_at" TIMESTAMPTZ(6);
ALTER TABLE "orgs" ADD COLUMN "activated_by_platform_admin_id" UUID;

-- Backfill: every existing org becomes activated, stamped with creation time.
UPDATE "orgs"
SET "is_activated" = true,
    "activated_at" = COALESCE("created_at", NOW())
WHERE "is_activated" = false;
