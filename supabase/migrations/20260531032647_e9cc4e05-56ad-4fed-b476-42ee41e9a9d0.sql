-- F3.2 Performance indexes (idempotent). All IF NOT EXISTS, no schema changes.
CREATE INDEX IF NOT EXISTS idx_permohonan_opd_tgl ON public.permohonan (opd_id, tanggal_masuk DESC);
CREATE INDEX IF NOT EXISTS idx_permohonan_pemohon_tgl ON public.permohonan (pemohon_id, tanggal_masuk DESC);
CREATE INDEX IF NOT EXISTS idx_permohonan_status_opd ON public.permohonan (status, opd_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_status ON public.form_submissions (form_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_updated ON public.form_submissions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_assignments_user_status ON public.form_assignments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_form_assignments_opd_status ON public.form_assignments (opd_id, status);

CREATE INDEX IF NOT EXISTS idx_aset_opd_updated ON public.aset (opd_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_aset_pemegang ON public.aset (pemegang_user_id);

CREATE INDEX IF NOT EXISTS idx_absensi_user_waktu ON public.absensi_asn (user_id, waktu DESC);
CREATE INDEX IF NOT EXISTS idx_absensi_opd_waktu ON public.absensi_asn (opd_id, waktu DESC);
