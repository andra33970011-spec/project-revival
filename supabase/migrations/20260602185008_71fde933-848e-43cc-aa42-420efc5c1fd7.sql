-- ============================================================
-- PART 3/3 — Patch kolom & RPC yang masih dirujuk kode
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'verified';

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.absensi_asn
  ADD COLUMN IF NOT EXISTS is_late boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_id uuid;

ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'supabase';

ALTER TABLE public.cron_history
  ADD COLUMN IF NOT EXISTS affected_rows integer,
  ADD COLUMN IF NOT EXISTS detail jsonb;

ALTER TABLE public.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS failed_at timestamptz DEFAULT now();

ALTER TABLE public.uat_scenarios
  ADD COLUMN IF NOT EXISTS code text;

UPDATE public.uat_scenarios SET code = 'uat-' || substr(id::text, 1, 8) WHERE code IS NULL;

-- ============================================================
-- RPC: rate_limit_increment (bucketed counter)
-- Increments per (scope, subject, window_start) and returns the
-- post-increment count.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  _scope text,
  _subject text,
  _window_start timestamptz
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limit_hits (bucket, identifier, count, window_start, last_hit_at)
  VALUES (_scope, _subject, 1, _window_start, now())
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1,
                last_hit_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamptz) TO authenticated, service_role;