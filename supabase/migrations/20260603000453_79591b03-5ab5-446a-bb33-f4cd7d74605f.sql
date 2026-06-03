-- =========================================================================
-- KINERJA OPD: RPC tren, drill-down layanan, skor komposit, benchmark
-- =========================================================================

CREATE OR REPLACE FUNCTION public.opd_kinerja_trend(_opd uuid DEFAULT NULL, _months int DEFAULT 12)
RETURNS TABLE(bulan text, masuk bigint, selesai bigint, on_time bigint, selesai_dengan_sla bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - make_interval(months => GREATEST(_months,1)-1),
      date_trunc('month', now()),
      interval '1 month'
    )::date AS m
  )
  SELECT to_char(months.m, 'YYYY-MM') AS bulan,
    COUNT(p.id) FILTER (WHERE p.tanggal_masuk >= months.m AND p.tanggal_masuk < months.m + interval '1 month')::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.updated_at >= months.m AND p.updated_at < months.m + interval '1 month')::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL AND p.updated_at <= p.tenggat
                        AND p.updated_at >= months.m AND p.updated_at < months.m + interval '1 month')::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL
                        AND p.updated_at >= months.m AND p.updated_at < months.m + interval '1 month')::bigint
  FROM months
  LEFT JOIN public.permohonan p ON (_opd IS NULL OR p.opd_id = _opd)
  GROUP BY months.m
  ORDER BY months.m;
$$;

REVOKE ALL ON FUNCTION public.opd_kinerja_trend(uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opd_kinerja_trend(uuid,int) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.layanan_kinerja_agg()
RETURNS TABLE(layanan_id uuid, layanan_judul text, opd_id uuid, opd_singkatan text, kategori text,
              total bigint, selesai bigint, on_time bigint, selesai_dengan_sla bigint,
              rata_hari_selesai numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.judul, l.opd_id, o.singkatan, l.slug,
    COUNT(p.id)::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai')::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL AND p.updated_at <= p.tenggat)::bigint,
    COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL)::bigint,
    COALESCE(AVG(EXTRACT(EPOCH FROM (p.updated_at - p.tanggal_masuk))/86400.0)
             FILTER (WHERE p.status='selesai'), 0)::numeric
  FROM public.layanan_publik l
  LEFT JOIN public.opd o ON o.id = l.opd_id
  LEFT JOIN public.permohonan p ON p.opd_id = l.opd_id AND lower(p.kategori) = lower(l.judul)
  WHERE l.aktif = true
  GROUP BY l.id, l.judul, l.opd_id, o.singkatan, l.slug;
$$;

REVOKE ALL ON FUNCTION public.layanan_kinerja_agg() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.layanan_kinerja_agg() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.opd_skor_komposit()
RETURNS TABLE(opd_id uuid, opd_nama text, opd_singkatan text, kategori text[],
              total bigint, selesai bigint, sla_pct numeric, rating_avg numeric,
              completion_pct numeric, skor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT o.id, o.nama, o.singkatan, o.kategori,
      COUNT(p.id)::bigint AS total,
      COUNT(p.id) FILTER (WHERE p.status='selesai')::bigint AS selesai,
      COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL AND p.updated_at <= p.tenggat)::bigint AS on_time,
      COUNT(p.id) FILTER (WHERE p.status='selesai' AND p.tenggat IS NOT NULL)::bigint AS sla_total,
      COALESCE(AVG(r.skor) FILTER (WHERE r.skor IS NOT NULL), 0)::numeric AS rating_avg
    FROM public.opd o
    LEFT JOIN public.permohonan p ON p.opd_id = o.id
    LEFT JOIN public.permohonan_rating r ON r.permohonan_id = p.id
    GROUP BY o.id, o.nama, o.singkatan, o.kategori
  )
  SELECT id, nama, singkatan, kategori, total, selesai,
    CASE WHEN sla_total > 0 THEN ROUND(100.0 * on_time / sla_total, 2) ELSE NULL END,
    ROUND(rating_avg, 2),
    CASE WHEN total > 0 THEN ROUND(100.0 * selesai / total, 2) ELSE NULL END,
    ROUND(
      0.4 * COALESCE(CASE WHEN sla_total > 0 THEN 100.0 * on_time / sla_total ELSE 0 END, 0)
      + 0.3 * COALESCE(rating_avg * 20, 0)
      + 0.3 * COALESCE(CASE WHEN total > 0 THEN 100.0 * selesai / total ELSE 0 END, 0),
      2
    )
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.opd_skor_komposit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opd_skor_komposit() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.opd_kategori_benchmark(_kategori text)
RETURNS TABLE(opd_id uuid, opd_singkatan text, total bigint, sla_pct numeric, rating_avg numeric, skor numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT opd_id, opd_singkatan, total, sla_pct, rating_avg, skor
  FROM public.opd_skor_komposit()
  WHERE _kategori = ANY(kategori)
  ORDER BY skor DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.opd_kategori_benchmark(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opd_kategori_benchmark(text) TO anon, authenticated, service_role;

-- =========================================================================
-- ABSENSI ASN: izin/cuti, hari libur, device alert, rekap, foto wajib
-- =========================================================================

-- ----- Tabel HARI LIBUR -----
CREATE TABLE IF NOT EXISTS public.hari_libur (
  tanggal date PRIMARY KEY,
  nama text NOT NULL,
  nasional boolean NOT NULL DEFAULT true,
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hari_libur TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hari_libur TO authenticated;
GRANT ALL ON public.hari_libur TO service_role;

ALTER TABLE public.hari_libur ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hari libur baca semua" ON public.hari_libur FOR SELECT USING (true);
CREATE POLICY "Super admin kelola hari libur" ON public.hari_libur FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER set_hari_libur_updated_at BEFORE UPDATE ON public.hari_libur
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----- Tabel PENGAJUAN IZIN -----
DO $$ BEGIN
  CREATE TYPE public.jenis_izin AS ENUM ('cuti_tahunan','cuti_sakit','dinas_luar','wfh','lainnya');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.status_izin AS ENUM ('pending','approved','rejected','dibatalkan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pengajuan_izin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opd_id uuid,
  jenis public.jenis_izin NOT NULL,
  dari date NOT NULL,
  sampai date NOT NULL,
  alasan text NOT NULL,
  lampiran_url text,
  status public.status_izin NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  catatan_approval text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sampai >= dari)
);

CREATE INDEX IF NOT EXISTS idx_pengajuan_izin_user_periode ON public.pengajuan_izin(user_id, dari, sampai);
CREATE INDEX IF NOT EXISTS idx_pengajuan_izin_opd_status ON public.pengajuan_izin(opd_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pengajuan_izin TO authenticated;
GRANT ALL ON public.pengajuan_izin TO service_role;

ALTER TABLE public.pengajuan_izin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "izin self read" ON public.pengajuan_izin FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'super_admin')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
);
CREATE POLICY "izin self insert" ON public.pengajuan_izin FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "izin self cancel" ON public.pengajuan_izin FOR UPDATE TO authenticated USING (
  user_id = auth.uid() AND status = 'pending'
);
CREATE POLICY "izin admin approve" ON public.pengajuan_izin FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
);
CREATE POLICY "izin super delete" ON public.pengajuan_izin FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER set_pengajuan_izin_updated_at BEFORE UPDATE ON public.pengajuan_izin
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger notifikasi saat izin diputuskan
CREATE OR REPLACE FUNCTION public.notify_izin_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications(user_id, tipe, judul, body, link, meta)
    VALUES (NEW.user_id, 'izin_status',
      'Pengajuan izin Anda ' || CASE NEW.status::text WHEN 'approved' THEN 'disetujui' ELSE 'ditolak' END,
      COALESCE(NEW.catatan_approval, NEW.alasan),
      '/asn/izin', jsonb_build_object('izin_id', NEW.id, 'status', NEW.status::text));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_izin_decision ON public.pengajuan_izin;
CREATE TRIGGER trg_notify_izin_decision AFTER UPDATE ON public.pengajuan_izin
  FOR EACH ROW EXECUTE FUNCTION public.notify_izin_decision();

-- ----- Kolom device_fingerprint_hash + foto_url konsistensi -----
ALTER TABLE public.absensi_asn
  ADD COLUMN IF NOT EXISTS device_fingerprint_hash text;
CREATE INDEX IF NOT EXISTS idx_absensi_device_fp ON public.absensi_asn(device_fingerprint_hash) WHERE device_fingerprint_hash IS NOT NULL;

-- ----- RPC attendance_compliance: refactor exclude izin & hari libur -----
CREATE OR REPLACE FUNCTION public.attendance_compliance(_user_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH days AS (
    SELECT generate_series(_from, _to, interval '1 day')::date AS d
  ),
  libur AS (SELECT tanggal FROM public.hari_libur WHERE tanggal BETWEEN _from AND _to),
  izin AS (
    SELECT generate_series(GREATEST(dari,_from), LEAST(sampai,_to), interval '1 day')::date AS d, jenis
    FROM public.pengajuan_izin
    WHERE user_id=_user_id AND status='approved'
      AND NOT (sampai < _from OR dari > _to)
  ),
  absen AS (
    SELECT waktu::date AS d, bool_or(tipe='masuk') AS masuk, bool_or(is_late) AS terlambat
    FROM public.absensi_asn
    WHERE user_id=_user_id AND waktu::date BETWEEN _from AND _to
    GROUP BY waktu::date
  ),
  joined AS (
    SELECT days.d,
      EXTRACT(DOW FROM days.d)::int AS dow,
      EXISTS(SELECT 1 FROM libur l WHERE l.tanggal = days.d) AS is_libur,
      (SELECT jenis::text FROM izin WHERE izin.d = days.d LIMIT 1) AS izin_jenis,
      absen.masuk, absen.terlambat
    FROM days LEFT JOIN absen ON absen.d = days.d
  )
  SELECT jsonb_build_object(
    'periode_from', _from,
    'periode_to', _to,
    'total_hari', COUNT(*),
    'hari_kerja', COUNT(*) FILTER (WHERE NOT is_libur AND dow BETWEEN 1 AND 5),
    'libur', COUNT(*) FILTER (WHERE is_libur OR dow IN (0,6)),
    'hadir', COUNT(*) FILTER (WHERE masuk = true),
    'terlambat', COUNT(*) FILTER (WHERE terlambat = true),
    'izin', COUNT(*) FILTER (WHERE izin_jenis IS NOT NULL),
    'alpa', COUNT(*) FILTER (WHERE NOT is_libur AND dow BETWEEN 1 AND 5 AND masuk IS NOT TRUE AND izin_jenis IS NULL AND d < CURRENT_DATE)
  )
  FROM joined;
$$;

REVOKE ALL ON FUNCTION public.attendance_compliance(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_compliance(uuid,date,date) TO authenticated, service_role;

-- ----- RPC rekap bulanan -----
CREATE OR REPLACE FUNCTION public.attendance_rekap_bulanan(_user_id uuid, _year int, _month int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _from date := make_date(_year,_month,1);
  _to date := (_from + interval '1 month' - interval '1 day')::date;
BEGIN
  RETURN public.attendance_compliance(_user_id, _from, _to);
END $$;

REVOKE ALL ON FUNCTION public.attendance_rekap_bulanan(uuid,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_rekap_bulanan(uuid,int,int) TO authenticated, service_role;

-- ----- RPC alert device dipakai banyak ASN -----
CREATE OR REPLACE FUNCTION public.attendance_device_alert(_days int DEFAULT 7)
RETURNS TABLE(device_fingerprint_hash text, jumlah_user bigint, user_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.device_fingerprint_hash,
    COUNT(DISTINCT a.user_id)::bigint,
    array_agg(DISTINCT a.user_id)
  FROM public.absensi_asn a
  WHERE a.device_fingerprint_hash IS NOT NULL
    AND a.waktu >= now() - make_interval(days => _days)
  GROUP BY a.device_fingerprint_hash
  HAVING COUNT(DISTINCT a.user_id) > 1;
$$;

REVOKE ALL ON FUNCTION public.attendance_device_alert(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_device_alert(int) TO authenticated, service_role;