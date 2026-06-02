-- F3.7 dashboard_summary RPC. SECURITY DEFINER, scoped by role + opd param.
CREATE OR REPLACE FUNCTION public.dashboard_summary(_opd uuid DEFAULT NULL, _days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_super boolean;
  _scope_opd uuid;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  _is_super := public.has_role(_uid, 'super_admin');

  IF _is_super THEN
    _scope_opd := _opd; -- nullable = all
  ELSE
    _scope_opd := public.get_user_opd(_uid);
    IF _scope_opd IS NULL THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  WITH base AS (
    SELECT p.id, p.status::text AS status, p.kategori, p.tanggal_masuk, p.tenggat, p.updated_at, p.opd_id
    FROM public.permohonan p
    WHERE (_scope_opd IS NULL OR p.opd_id = _scope_opd)
      AND p.tanggal_masuk >= (now() - make_interval(days => GREATEST(_days, 1)))
  ),
  kpi AS (
    SELECT
      COUNT(*) FILTER (WHERE status='baru')::int AS baru,
      COUNT(*) FILTER (WHERE status='diproses')::int AS diproses,
      COUNT(*) FILTER (WHERE status='selesai')::int AS selesai,
      COUNT(*) FILTER (WHERE status='ditolak')::int AS ditolak,
      COUNT(*)::int AS total
    FROM base
  ),
  days AS (
    SELECT generate_series(
      date_trunc('day', now()) - make_interval(days => GREATEST(_days,1)-1),
      date_trunc('day', now()),
      interval '1 day'
    )::date AS d
  ),
  trend AS (
    SELECT d::text AS key,
      COALESCE((SELECT COUNT(*) FROM base b WHERE b.tanggal_masuk::date = d), 0)::int AS masuk,
      COALESCE((SELECT COUNT(*) FROM base b WHERE b.status='selesai' AND b.updated_at::date = d), 0)::int AS selesai
    FROM days
  ),
  kategori AS (
    SELECT kategori AS nama, COUNT(*)::int AS jumlah
    FROM base GROUP BY kategori ORDER BY jumlah DESC LIMIT 8
  ),
  sla AS (
    SELECT
      b.kategori AS nama,
      COUNT(*) FILTER (WHERE b.status='selesai')::int AS total,
      COUNT(*) FILTER (
        WHERE b.status='selesai' AND b.tenggat IS NOT NULL AND b.updated_at <= b.tenggat
      )::int AS on_time
    FROM base b
    GROUP BY b.kategori
    ORDER BY total DESC LIMIT 6
  ),
  backlog AS (
    SELECT b.opd_id, o.singkatan, o.nama,
      COUNT(*) FILTER (WHERE b.status='baru')::int AS baru,
      COUNT(*) FILTER (WHERE b.status='diproses')::int AS diproses
    FROM base b
    LEFT JOIN public.opd o ON o.id = b.opd_id
    WHERE _scope_opd IS NULL
    GROUP BY b.opd_id, o.singkatan, o.nama
    ORDER BY (COUNT(*) FILTER (WHERE b.status='baru')
            + COUNT(*) FILTER (WHERE b.status='diproses')) DESC
    LIMIT 8
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object('opd_id', _scope_opd, 'is_super', _is_super, 'days', _days),
    'kpi', (SELECT row_to_json(k.*) FROM kpi k),
    'trend', COALESCE((SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.key) FROM trend t), '[]'::jsonb),
    'kategori', COALESCE((SELECT jsonb_agg(row_to_json(c.*)) FROM kategori c), '[]'::jsonb),
    'sla', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM sla s), '[]'::jsonb),
    'backlog', COALESCE((SELECT jsonb_agg(row_to_json(bl.*)) FROM backlog bl), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_summary(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(uuid, int) TO authenticated, service_role;
