-- Remove sensitive memory types from patient_memories.
-- Drops existing rows of removed types, then narrows the MemoryType enum
-- from 11 values down to 5 (preference, note, service_interest, behavioral, satisfaction).

-- 1. Delete existing rows of removed types
DELETE FROM "patient_memories"
WHERE "memory_type" IN ('allergy', 'condition', 'medication', 'family_history', 'lifestyle', 'interest');

-- 2. Recreate the enum without the removed values
ALTER TYPE "MemoryType" RENAME TO "MemoryType_old";

CREATE TYPE "MemoryType" AS ENUM (
  'preference',
  'note',
  'service_interest',
  'behavioral',
  'satisfaction'
);

ALTER TABLE "patient_memories"
  ALTER COLUMN "memory_type" TYPE "MemoryType"
  USING "memory_type"::text::"MemoryType";

DROP TYPE "MemoryType_old";
