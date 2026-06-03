-- =====================================================
-- SPRINT B — Absensi ASN Production (additive)
-- =====================================================

-- 1) attendance_shifts (master shift per OPD)
CREATE TABLE IF NOT EXISTS public.attendance_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id uuid REFERENCES public.opd(id) ON DELETE CASCADE,
  nama text NOT NULL,
  jam_masuk time NOT NULL,
  jam_pulang time NOT NULL,
  toleransi_menit int NOT NULL DEFAULT 15,
  jenis text NOT NULL DEFAULT 'pagi' CHECK (jenis IN ('pagi','malam','khusus')),
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.attendance_shifts TO authenticated;
GRANT ALL ON public.attendance_shifts TO service_role;

ALTER TABLE public.attendance_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts read auth" ON public.attendance_shifts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts manage admin" ON public.attendance_shifts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE TRIGGER trg_attendance_shifts_updated
BEFORE UPDATE ON public.attendance_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) attendance_shift_assignment (rentang tanggal)
CREATE TABLE IF NOT EXISTS public.attendance_shift_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.attendance_shifts(id) ON DELETE CASCADE,
  dari date NOT NULL,
  sampai date,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_attendance_shift_assignment_user
  ON public.attendance_shift_assignment(user_id, dari);

GRANT SELECT ON public.attendance_shift_assignment TO authenticated;
GRANT ALL ON public.attendance_shift_assignment TO service_role;

ALTER TABLE public.attendance_shift_assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "att_shift_assign self read" ON public.attendance_shift_assignment
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'super_admin')
         OR public.has_role(auth.uid(),'admin_opd'));

CREATE POLICY "att_shift_assign admin manage" ON public.attendance_shift_assignment
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));

-- 3) leave_balances (saldo cuti tahunan)
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tahun int NOT NULL,
  jenis text NOT NULL,
  kuota int NOT NULL DEFAULT 0,
  terpakai int NOT NULL DEFAULT 0,
  catatan text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tahun, jenis)
);

GRANT SELECT ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_balance self read" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'super_admin')
         OR public.has_role(auth.uid(),'admin_opd'));

CREATE POLICY "leave_balance admin manage" ON public.leave_balances
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin_opd'));

CREATE TRIGGER trg_leave_balances_updated
BEFORE UPDATE ON public.leave_balances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend pengajuan_izin (additive)
ALTER TABLE public.pengajuan_izin
  ADD COLUMN IF NOT EXISTS mengurangi_saldo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS saldo_terpotong int NOT NULL DEFAULT 0;

-- 4) overtime_requests (SPL/lembur)
CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  tanggal date NOT NULL,
  jam_mulai time NOT NULL,
  jam_selesai time NOT NULL,
  alasan text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','dibatalkan')),
  approver_id uuid,
  approved_at timestamptz,
  catatan_approval text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_overtime_user_tanggal
  ON public.overtime_requests(user_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_overtime_opd_status
  ON public.overtime_requests(opd_id, status);

GRANT SELECT, INSERT, UPDATE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime self read" ON public.overtime_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE POLICY "overtime self insert" ON public.overtime_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "overtime self cancel" ON public.overtime_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "overtime admin manage" ON public.overtime_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE TRIGGER trg_overtime_updated
BEFORE UPDATE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) payroll_periods (lock periode payroll/absensi)
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id uuid REFERENCES public.opd(id) ON DELETE CASCADE,
  tahun int NOT NULL,
  bulan int NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  locked_at timestamptz,
  locked_by uuid,
  unlocked_at timestamptz,
  unlocked_by uuid,
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opd_id, tahun, bulan)
);

GRANT SELECT ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll read" ON public.payroll_periods
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "payroll manage admin" ON public.payroll_periods
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

-- 6) geofence_audit (log validasi server-side geofence)
CREATE TABLE IF NOT EXISTS public.geofence_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  absensi_id uuid REFERENCES public.absensi_asn(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  opd_id uuid REFERENCES public.opd(id) ON DELETE SET NULL,
  lat numeric, lng numeric,
  dist_m numeric, radius_m numeric,
  valid boolean NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geofence_audit_user ON public.geofence_audit(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.geofence_audit TO authenticated;
GRANT ALL ON public.geofence_audit TO service_role;

ALTER TABLE public.geofence_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geofence self read" ON public.geofence_audit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'super_admin')
         OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));

CREATE POLICY "geofence insert any auth" ON public.geofence_audit
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

-- 7) Helper: cek apakah periode terkunci
CREATE OR REPLACE FUNCTION public.is_payroll_locked(_opd_id uuid, _ts timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payroll_periods
    WHERE (opd_id = _opd_id OR opd_id IS NULL)
      AND tahun = EXTRACT(YEAR FROM _ts)::int
      AND bulan = EXTRACT(MONTH FROM _ts)::int
      AND locked_at IS NOT NULL
      AND unlocked_at IS NULL
  );
$$;

-- 8) Trigger: block UPDATE/DELETE pada absensi_asn jika periode locked (kecuali super_admin)
CREATE OR REPLACE FUNCTION public.trg_block_locked_attendance()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ts timestamptz;
BEGIN
  IF public.has_role(auth.uid(),'super_admin') THEN RETURN COALESCE(NEW, OLD); END IF;
  v_ts := COALESCE(NEW.waktu, OLD.waktu);
  IF v_ts IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF public.is_payroll_locked(COALESCE(NEW.opd_id, OLD.opd_id), v_ts) THEN
    RAISE EXCEPTION 'Periode payroll sudah dikunci. Tidak dapat mengubah/menghapus absensi pada periode ini.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_block_locked_attendance_upd ON public.absensi_asn;
CREATE TRIGGER trg_block_locked_attendance_upd
BEFORE UPDATE OR DELETE ON public.absensi_asn
FOR EACH ROW EXECUTE FUNCTION public.trg_block_locked_attendance();

-- 9) Notify on leave decision sudah ada (notify_izin_decision). Tambah trigger overtime decision.
CREATE OR REPLACE FUNCTION public.notify_overtime_decision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved','rejected') THEN
    INSERT INTO public.notifications(user_id, tipe, judul, body, link, meta)
    VALUES (NEW.user_id, 'lembur_status',
      'Pengajuan lembur ' || CASE NEW.status WHEN 'approved' THEN 'disetujui' ELSE 'ditolak' END,
      COALESCE(NEW.catatan_approval, NEW.alasan),
      '/asn/lembur', jsonb_build_object('overtime_id', NEW.id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_overtime ON public.overtime_requests;
CREATE TRIGGER trg_notify_overtime
AFTER UPDATE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_overtime_decision();

-- 10) Feature flags Sprint B
INSERT INTO public.feature_flags(flag_key, enabled, description) VALUES
  ('absensi.geofence_strict', false, 'Tolak absensi jika koordinat di luar radius geofence OPD'),
  ('absensi.payroll_lock', true, 'Aktifkan blokir edit absensi pada periode payroll terkunci'),
  ('absensi.shift_v2', false, 'Gunakan attendance_shifts (rentang) menggantikan shift_assignment harian')
ON CONFLICT (flag_key) DO NOTHING;
