-- CreateEnum (only if not exists)
DO $$ BEGIN
    CREATE TYPE "MemoryType" AS ENUM ('preference', 'condition', 'allergy', 'medication', 'family_history', 'lifestyle', 'note');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "patient_memories" (
    "memory_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "memory_type" "MemoryType" NOT NULL,
    "memory_key" TEXT NOT NULL,
    "memory_value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source_conversation_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_memories_pkey" PRIMARY KEY ("memory_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "conversation_summaries" (
    "summary_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "key_topics" TEXT[],
    "sentiment" TEXT,
    "action_items" JSONB NOT NULL DEFAULT '[]',
    "message_count" INTEGER NOT NULL,
    "start_message_id" UUID,
    "end_message_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("summary_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_memories_patient_id_is_active_idx" ON "patient_memories"("patient_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "patient_memories_patient_id_memory_type_memory_key_key" ON "patient_memories"("patient_id", "memory_type", "memory_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_summaries_conversation_id_created_at_idx" ON "conversation_summaries"("conversation_id", "created_at" DESC);

-- AddForeignKey (only if not exists)
DO $$ BEGIN
    ALTER TABLE "patient_memories" ADD CONSTRAINT "patient_memories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "patient_memories" ADD CONSTRAINT "patient_memories_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
