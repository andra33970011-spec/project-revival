-- Rate limit ledger (sliding-window bucket counters).
-- Compact rows per (key, window_start) keep storage bounded.
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,                -- e.g. 'upload.signed_url'
  subject TEXT NOT NULL,              -- e.g. user_id or ip
  window_start TIMESTAMPTZ NOT NULL,  -- bucket start (truncated to window)
  count INTEGER NOT NULL DEFAULT 1,
  last_hit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (scope, subject, window_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Only service_role accesses this table; no anon/authenticated policies on purpose.

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON public.rate_limit_hits (scope, subject, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_cleanup
  ON public.rate_limit_hits (last_hit_at);

-- Atomic increment helper. Returns the post-increment count for the bucket.
CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  _scope TEXT,
  _subject TEXT,
  _window_start TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count INTEGER;
BEGIN
  INSERT INTO public.rate_limit_hits (scope, subject, window_start, count, last_hit_at)
  VALUES (_scope, _subject, _window_start, 1, now())
  ON CONFLICT (scope, subject, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1, last_hit_at = now()
  RETURNING count INTO _count;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_increment(TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_increment(TEXT, TEXT, TIMESTAMPTZ) TO service_role;