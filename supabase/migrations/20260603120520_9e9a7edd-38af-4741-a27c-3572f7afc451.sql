-- =====================================================================
-- M2: Migrasi data asn_type HONORER → PPPK_PW (asn_type = 'pppk_paruh_waktu')
-- =====================================================================
-- Pertahankan nilai lama tetap valid (kolom text, jadi tidak ada enum drop).
UPDATE public.profiles
   SET asn_type = 'pppk_paruh_waktu'
 WHERE asn_type = 'honorer';

-- Tambah kolom pimpinan_type ke profiles (additive, nullable).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pimpinan_type public.pimpinan_type;

-- =====================================================================
-- M3: Permissions baru — masukkan ke katalog & auto-grant ke admin_pemda / pimpinan
-- =====================================================================
INSERT INTO public.permissions (code, label, kategori, description) VALUES
  ('view_all_opd',             'Lihat Semua OPD',              'pemda', 'Akses baca seluruh data OPD'),
  ('view_all_submissions',     'Lihat Semua Submisi',          'pemda', 'Akses baca seluruh permohonan & submission form'),
  ('view_all_attendance',      'Lihat Semua Absensi',          'pemda', 'Akses baca absensi ASN lintas OPD'),
  ('view_all_assets',          'Lihat Semua Aset',             'pemda', 'Akses baca aset lintas OPD'),
  ('view_all_datasets',        'Lihat Semua Pelaporan Data',   'pemda', 'Akses baca dataset & laporan data lintas OPD'),
  ('view_all_reports',         'Lihat Semua Laporan',          'pemda', 'Akses baca pengaduan masyarakat lintas OPD'),
  ('view_all_performance',     'Lihat Semua Kinerja',          'pemda', 'Akses baca KPI & kinerja lintas OPD'),
  ('view_all_surveys',         'Lihat Semua Survei IKM',       'pemda', 'Akses baca IKM lintas OPD'),
  ('view_kabupaten_dashboard', 'Dashboard Kabupaten',          'executive', 'Akses dashboard tingkat kabupaten'),
  ('view_executive_dashboard', 'Dashboard Eksekutif',          'executive', 'Akses dashboard pimpinan daerah'),
  ('view_cross_opd_analytics', 'Analitik Lintas-OPD',          'executive', 'Akses analitik lintas-OPD')
ON CONFLICT (code) DO NOTHING;

-- Auto-grant permission baru ke semua user dengan role admin_pemda.
INSERT INTO public.user_permissions (user_id, permission_code, granted, reason)
SELECT ur.user_id, p.code, true, 'auto-grant admin_pemda Fase 2'
  FROM public.user_roles ur
 CROSS JOIN public.permissions p
 WHERE ur.role = 'admin_pemda'
   AND p.code IN ('view_all_opd','view_all_submissions','view_all_attendance',
                  'view_all_assets','view_all_datasets','view_all_reports',
                  'view_all_performance','view_all_surveys',
                  'view_kabupaten_dashboard','view_executive_dashboard','view_cross_opd_analytics')
ON CONFLICT (user_id, permission_code) DO NOTHING;

-- Auto-grant permission view ke semua user dengan role pimpinan.
INSERT INTO public.user_permissions (user_id, permission_code, granted, reason)
SELECT ur.user_id, p.code, true, 'auto-grant pimpinan Fase 2'
  FROM public.user_roles ur
 CROSS JOIN public.permissions p
 WHERE ur.role = 'pimpinan'
   AND p.code IN ('view_executive_dashboard','view_kabupaten_dashboard','view_cross_opd_analytics',
                  'view_all_performance','view_all_surveys')
ON CONFLICT (user_id, permission_code) DO NOTHING;

-- =====================================================================
-- M4: Helper functions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin_pemda(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin_pemda'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.is_pimpinan(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'pimpinan'::public.app_role)
$$;

-- Read-elevated: super_admin | admin_pemda | pimpinan (semua boleh baca lintas-OPD).
CREATE OR REPLACE FUNCTION public.is_elevated_view(_uid uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'super_admin'::public.app_role)
      OR public.has_role(_uid, 'admin_pemda'::public.app_role)
      OR public.has_role(_uid, 'pimpinan'::public.app_role)
$$;

-- =====================================================================
-- M5: RLS additive — tambah policy SELECT untuk admin_pemda & pimpinan
-- pada tabel cross-OPD. JANGAN drop policy lama. Pimpinan READ-ONLY.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'permohonan','form_submissions','absensi_asn','aset',
    'dataset_submission','laporan_masyarakat','audit_log',
    'ikm_responses','permohonan_rating','profiles',
    'pengajuan_izin','overtime_requests','aset_riwayat','permohonan_riwayat',
    'aset_bast','aset_bast_items','aset_opname','aset_opname_items',
    'aset_penyusutan_history','form_submission_comments','nomor_surat_issued',
    'submission_sla_events','disposisi','dataset_submission_review','consent_log',
    'compliance_checklist','opd','desa','pejabat','layanan_publik',
    'form_fields','form_targets','forms','user_roles','rate_limit_hits',
    'cron_history','dead_letter_jobs','job_queue','backup_snapshot',
    'leave_balances','attendance_shifts','attendance_shift_assignment','payroll_periods',
    'geofence_audit','hari_libur','notifications','rbac_audit',
    'permissions','user_permissions','feature_flags','site_settings'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS pemda_read_all ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY pemda_read_all ON public.%I FOR SELECT TO authenticated USING (public.is_admin_pemda(auth.uid()))',
        t
      );
      EXECUTE format('DROP POLICY IF EXISTS pimpinan_read_all ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY pimpinan_read_all ON public.%I FOR SELECT TO authenticated USING (public.is_pimpinan(auth.uid()))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- Executive summary RPC (dipakai oleh /executive & /pemda)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.executive_summary()
  RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'kabupaten', jsonb_build_object(
      'permohonan_total',   (SELECT COUNT(*) FROM public.permohonan),
      'permohonan_bulan',   (SELECT COUNT(*) FROM public.permohonan WHERE tanggal_masuk >= date_trunc('month', now())),
      'permohonan_selesai', (SELECT COUNT(*) FROM public.permohonan WHERE status = 'selesai'),
      'permohonan_overdue', (SELECT COUNT(*) FROM public.permohonan WHERE status NOT IN ('selesai','dibatalkan','ditolak') AND tenggat IS NOT NULL AND tenggat < now()),
      'laporan_total',      (SELECT COUNT(*) FROM public.laporan_masyarakat),
      'laporan_open',       (SELECT COUNT(*) FROM public.laporan_masyarakat WHERE status <> 'selesai'),
      'aset_total',         (SELECT COUNT(*) FROM public.aset),
      'aset_rusak',         (SELECT COUNT(*) FROM public.aset WHERE kondisi = 'rusak'),
      'ikm_responses_30d',  (SELECT COUNT(*) FROM public.ikm_responses WHERE created_at >= now() - interval '30 days'),
      'opd_count',          (SELECT COUNT(*) FROM public.opd),
      'asn_count',          (SELECT COUNT(*) FROM public.user_roles WHERE role = 'asn')
    ),
    'generated_at', now()
  )
$$;

REVOKE EXECUTE ON FUNCTION public.executive_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.executive_summary() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin_pemda(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_pimpinan(uuid)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_elevated_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_pemda(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pimpinan(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_elevated_view(uuid) TO authenticated;