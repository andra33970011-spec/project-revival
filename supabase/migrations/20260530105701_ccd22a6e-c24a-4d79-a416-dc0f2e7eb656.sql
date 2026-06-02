
CREATE OR REPLACE FUNCTION public.rate_limit_increment(_bucket text, _identifier text, _scope text, _subject text, _window_start timestamptz, _window_seconds integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cnt integer;
BEGIN
  INSERT INTO public.rate_limit_hits (bucket, identifier, window_start, count)
  VALUES (_bucket || ':' || COALESCE(_scope,'') || ':' || COALESCE(_subject,''), _identifier, _window_start, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1, updated_at = now()
  RETURNING count INTO _cnt;
  RETURN _cnt;
END $$;
