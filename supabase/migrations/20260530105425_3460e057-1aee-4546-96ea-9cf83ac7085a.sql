
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nip text,
  ADD COLUMN IF NOT EXISTS jabatan text,
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS asn_type text,
  ADD COLUMN IF NOT EXISTS system_position text;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS meta jsonb;

ALTER TABLE public.rbac_audit
  ADD COLUMN IF NOT EXISTS entitas text,
  ADD COLUMN IF NOT EXISTS data_sebelum jsonb,
  ADD COLUMN IF NOT EXISTS data_sesudah jsonb;

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS schema_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.form_assignments
  ADD COLUMN IF NOT EXISTS opd_id uuid,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS opd_id uuid,
  ADD COLUMN IF NOT EXISTS schema_version_snapshot jsonb;
