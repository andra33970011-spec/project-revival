
-- ============ WORK SCHEDULE ============
CREATE TABLE IF NOT EXISTS public.work_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  opd_id uuid NULL,
  hari_kerja int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  jam_masuk time NOT NULL DEFAULT '08:00',
  jam_pulang time NOT NULL DEFAULT '16:00',
  toleransi_menit int NOT NULL DEFAULT 15,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_schedule TO authenticated;
GRANT ALL ON public.work_schedule TO service_role;
ALTER TABLE public.work_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Jadwal baca login" ON public.work_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin kelola jadwal" ON public.work_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Admin OPD kelola jadwal opd" ON public.work_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()));
CREATE TRIGGER trg_ws_updated BEFORE UPDATE ON public.work_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.work_schedule_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.work_schedule(id) ON DELETE CASCADE,
  berlaku_dari date NOT NULL DEFAULT CURRENT_DATE,
  berlaku_sampai date NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wsa_user ON public.work_schedule_assignment(user_id, berlaku_dari DESC);
GRANT SELECT ON public.work_schedule_assignment TO authenticated;
GRANT ALL ON public.work_schedule_assignment TO service_role;
ALTER TABLE public.work_schedule_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "WSA lihat sendiri/admin" ON public.work_schedule_assignment FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));
CREATE POLICY "WSA super admin kelola" ON public.work_schedule_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "WSA admin opd kelola" ON public.work_schedule_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND user_id IN (SELECT id FROM public.profiles WHERE opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND user_id IN (SELECT id FROM public.profiles WHERE opd_id = public.get_user_opd(auth.uid())));

-- ============ SHIFT ============
CREATE TABLE IF NOT EXISTS public.shift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  kode text NOT NULL UNIQUE,
  jam_mulai time NOT NULL,
  jam_selesai time NOT NULL,
  warna text NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shift TO authenticated;
GRANT ALL ON public.shift TO service_role;
ALTER TABLE public.shift ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shift baca login" ON public.shift FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin kelola shift" ON public.shift FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.shift_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shift_id uuid NOT NULL REFERENCES public.shift(id) ON DELETE CASCADE,
  tanggal date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tanggal)
);
CREATE INDEX IF NOT EXISTS idx_sa_user_tgl ON public.shift_assignment(user_id, tanggal DESC);
GRANT SELECT ON public.shift_assignment TO authenticated;
GRANT ALL ON public.shift_assignment TO service_role;
ALTER TABLE public.shift_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shift assign lihat sendiri/admin" ON public.shift_assignment FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));
CREATE POLICY "Shift assign super admin" ON public.shift_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Shift assign admin opd" ON public.shift_assignment FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND user_id IN (SELECT id FROM public.profiles WHERE opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND user_id IN (SELECT id FROM public.profiles WHERE opd_id = public.get_user_opd(auth.uid())));

-- ============ ABSENSI: kolom kepatuhan ============
ALTER TABLE public.absensi_asn
  ADD COLUMN IF NOT EXISTS is_late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_id uuid NULL,
  ADD COLUMN IF NOT EXISTS shift_id uuid NULL;

-- ============ ASET: lifecycle status ============
ALTER TABLE public.aset
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'aktif',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz NULL;

-- ============ VERIFICATION CAMPAIGN ============
CREATE TABLE IF NOT EXISTS public.aset_verification_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  deskripsi text NULL,
  periode_mulai date NOT NULL,
  periode_selesai date NOT NULL,
  target_opd_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'aktif',
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aset_verification_campaign TO authenticated;
GRANT ALL ON public.aset_verification_campaign TO service_role;
ALTER TABLE public.aset_verification_campaign ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Campaign baca login" ON public.aset_verification_campaign FOR SELECT TO authenticated USING (true);
CREATE POLICY "Campaign super admin" ON public.aset_verification_campaign FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_avc_updated BEFORE UPDATE ON public.aset_verification_campaign
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.aset_verification_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.aset_verification_campaign(id) ON DELETE CASCADE,
  aset_id uuid NOT NULL,
  opd_id uuid NULL,
  status text NOT NULL DEFAULT 'belum',
  verified_at timestamptz NULL,
  verified_by uuid NULL,
  lat numeric NULL,
  lng numeric NULL,
  lokasi_text text NULL,
  foto_url text NULL,
  catatan text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, aset_id)
);
CREATE INDEX IF NOT EXISTS idx_avi_campaign ON public.aset_verification_item(campaign_id);
CREATE INDEX IF NOT EXISTS idx_avi_aset ON public.aset_verification_item(aset_id);
GRANT SELECT, INSERT, UPDATE ON public.aset_verification_item TO authenticated;
GRANT ALL ON public.aset_verification_item TO service_role;
ALTER TABLE public.aset_verification_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AVI baca login" ON public.aset_verification_item FOR SELECT TO authenticated USING (true);
CREATE POLICY "AVI super admin kelola" ON public.aset_verification_item FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "AVI admin opd kelola" ON public.aset_verification_item FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()));
CREATE POLICY "AVI asn update milik opd" ON public.aset_verification_item FOR UPDATE TO authenticated
  USING (opd_id = public.get_user_opd(auth.uid())) WITH CHECK (opd_id = public.get_user_opd(auth.uid()));

-- ============ COMPLIANCE RPC ============
CREATE OR REPLACE FUNCTION public.attendance_compliance(_user_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'hadir', COUNT(*) FILTER (WHERE tipe='masuk'),
    'terlambat', COUNT(*) FILTER (WHERE tipe='masuk' AND is_late),
    'pulang', COUNT(*) FILTER (WHERE tipe='pulang'),
    'hari_unik', COUNT(DISTINCT (waktu::date))
  )
  FROM public.absensi_asn
  WHERE user_id = _user_id
    AND waktu::date BETWEEN _from AND _to;
$$;

CREATE OR REPLACE FUNCTION public.opd_attendance_today(_opd_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hadir AS (
    SELECT DISTINCT user_id FROM public.absensi_asn
    WHERE opd_id = _opd_id AND tipe='masuk' AND waktu::date = CURRENT_DATE
  ),
  late AS (
    SELECT DISTINCT user_id FROM public.absensi_asn
    WHERE opd_id = _opd_id AND tipe='masuk' AND is_late AND waktu::date = CURRENT_DATE
  ),
  total AS (
    SELECT COUNT(*)::int n FROM public.profiles WHERE opd_id = _opd_id
  )
  SELECT jsonb_build_object(
    'total_asn', (SELECT n FROM total),
    'hadir', (SELECT COUNT(*) FROM hadir),
    'terlambat', (SELECT COUNT(*) FROM late),
    'belum_hadir', GREATEST(0, (SELECT n FROM total) - (SELECT COUNT(*) FROM hadir))
  );
$$;

CREATE OR REPLACE FUNCTION public.aset_compliance(_opd_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT * FROM public.aset WHERE (_opd_id IS NULL OR opd_id = _opd_id)
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM a),
    'aktif', (SELECT COUNT(*) FROM a WHERE lifecycle_status='aktif'),
    'rusak', (SELECT COUNT(*) FROM a WHERE lifecycle_status='rusak'),
    'hilang', (SELECT COUNT(*) FROM a WHERE lifecycle_status='hilang'),
    'maintenance', (SELECT COUNT(*) FROM a WHERE lifecycle_status='maintenance'),
    'terverifikasi_90d', (SELECT COUNT(*) FROM a WHERE last_verified_at > now() - interval '90 days'),
    'belum_verifikasi', (SELECT COUNT(*) FROM a WHERE last_verified_at IS NULL OR last_verified_at <= now() - interval '90 days')
  );
$$;
