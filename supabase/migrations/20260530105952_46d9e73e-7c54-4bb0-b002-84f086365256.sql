
-- Add missing columns referenced by server code
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS granted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.retry_queue
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

ALTER TABLE public.dead_letter_jobs
  ADD COLUMN IF NOT EXISTS resolution_note text;

ALTER TABLE public.form_submission_versions
  ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Add 3-arg overload for rate_limit_increment used by checkRateLimit
CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  _scope text,
  _subject text,
  _window_start timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limit_hits (scope, subject, window_start, count)
  VALUES (_scope, _subject, _window_start, 1)
  ON CONFLICT (scope, subject, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamptz) TO authenticated, service_role;
