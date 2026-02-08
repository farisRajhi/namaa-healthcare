-- hospital_booking.sql
-- Run once inside the hospital_booking DB

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Types ----------
DO $$ BEGIN
  CREATE TYPE channel AS ENUM ('telegram','whatsapp','web','phone','front_desk','api');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('active','closed','handoff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_direction AS ENUM ('in','out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'held','booked','confirmed','checked_in','in_progress','completed',
    'cancelled','no_show','expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Core tables ----------
CREATE TABLE IF NOT EXISTS orgs (
  org_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facilities (
  facility_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS departments (
  department_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS providers (
  provider_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(department_id),
  facility_id uuid REFERENCES facilities(facility_id),
  display_name text NOT NULL,
  credentials text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  service_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min > 0),
  buffer_before_min integer NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
  buffer_after_min  integer NOT NULL DEFAULT 0 CHECK (buffer_after_min  >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS provider_services (
  provider_id uuid NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES services(service_id)  ON DELETE CASCADE,
  PRIMARY KEY (provider_id, service_id)
);

CREATE TABLE IF NOT EXISTS provider_availability_rules (
  rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_local time NOT NULL,
  end_local   time NOT NULL CHECK (end_local > start_local),
  slot_interval_min integer NOT NULL DEFAULT 15 CHECK (slot_interval_min IN (5,10,15,20,30,60)),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to   date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_time_off (
  time_off_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
  start_ts timestamptz NOT NULL,
  end_ts   timestamptz NOT NULL CHECK (end_ts > start_ts),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Patients + messaging identity ----------
CREATE TABLE IF NOT EXISTS patients (
  patient_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name  text NOT NULL,
  date_of_birth date,
  sex text,
  mrn text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, mrn)
);

CREATE TABLE IF NOT EXISTS patient_contacts (
  contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('phone','email')),
  contact_value text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_contacts_lookup
  ON patient_contacts (contact_type, contact_value);

CREATE TABLE IF NOT EXISTS messaging_users (
  messaging_user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  channel channel NOT NULL,
  external_user_id text NOT NULL,
  phone_e164 text,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel, external_user_id)
);

CREATE TABLE IF NOT EXISTS messaging_user_patient_links (
  messaging_user_id uuid NOT NULL REFERENCES messaging_users(messaging_user_id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'self',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (messaging_user_id, patient_id)
);

-- ---------- Conversations + messages ----------
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  messaging_user_id uuid NOT NULL REFERENCES messaging_users(messaging_user_id) ON DELETE CASCADE,
  channel channel NOT NULL,
  external_thread_id text NOT NULL,
  patient_id uuid REFERENCES patients(patient_id) ON DELETE SET NULL,
  status conversation_status NOT NULL DEFAULT 'active',
  current_step text NOT NULL DEFAULT 'start',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, channel, external_thread_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  platform_message_id text,
  direction message_direction NOT NULL,
  body_text text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, platform_message_id)
);

-- ---------- Appointments ----------
CREATE TABLE IF NOT EXISTS appointments (
  appointment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  facility_id uuid REFERENCES facilities(facility_id),
  department_id uuid REFERENCES departments(department_id),
  provider_id uuid NOT NULL REFERENCES providers(provider_id),
  patient_id  uuid REFERENCES patients(patient_id),
  service_id  uuid NOT NULL REFERENCES services(service_id),

  start_ts timestamptz NOT NULL,
  end_ts   timestamptz NOT NULL CHECK (end_ts > start_ts),

  status appointment_status NOT NULL,
  hold_expires_at timestamptz,

  booked_via channel NOT NULL DEFAULT 'api',
  booked_by_messaging_user_id uuid REFERENCES messaging_users(messaging_user_id),
  conversation_id uuid REFERENCES conversations(conversation_id),

  reason text,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Avoid double-booking per provider
DO $$ BEGIN
  ALTER TABLE appointments
    ADD CONSTRAINT no_overlapping_appointments
    EXCLUDE USING gist (
      provider_id WITH =,
      tstzrange(start_ts, end_ts, '[)') WITH &&
    )
    WHERE (status IN ('held','booked','confirmed','checked_in','in_progress'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_provider_time
  ON appointments (provider_id, start_ts DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_time
  ON appointments (patient_id, start_ts DESC);

CREATE TABLE IF NOT EXISTS appointment_status_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(appointment_id) ON DELETE CASCADE,
  old_status appointment_status,
  new_status appointment_status NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Outbox for reliable sends ----------
CREATE TABLE IF NOT EXISTS outbox_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  visible_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed
  ON outbox_events (visible_at)
  WHERE processed_at IS NULL;

COMMIT;
