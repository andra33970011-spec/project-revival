
-- ============================================================
-- SPRINT A: Governance & Layanan Masyarakat (additive)
-- ============================================================

-- Pastikan tabel feature_flags ada (idempotent)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  flag_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.feature_flags TO authenticated, anon;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "feature_flags_read_all" ON public.feature_flags FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "feature_flags_super_write" ON public.feature_flags FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.feature_flags(flag_key, enabled, description) VALUES
  ('sla.pause_enabled', false, 'Sprint A: SLA pause saat menunggu_dokumen/dikembalikan'),
  ('escalation.enabled', false, 'Sprint A: Auto-escalation L1/L2/L3'),
  ('disposisi.enabled', false, 'Sprint A: Disposisi berjenjang'),
  ('nomor_surat.enabled', false, 'Sprint A: Penomoran surat resmi'),
  ('dokumen_final.enabled', false, 'Sprint A: Generate PDF resmi'),
  ('ikm.enabled', false, 'Sprint A: Survey IKM 9 unsur')
ON CONFLICT (flag_key) DO NOTHING;

-- ============================================================
-- A1. SLA Pause/Resume
-- ============================================================
ALTER TABLE public.permohonan
  ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_total_pause_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nomor_surat text,
  ADD COLUMN IF NOT EXISTS dokumen_final_path text,
  ADD COLUMN IF NOT EXISTS current_disposition_id uuid;

CREATE TABLE IF NOT EXISTS public.submission_sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id uuid NOT NULL REFERENCES public.permohonan(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('pause','resume','overdue_l1','overdue_l2','overdue_l3')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds bigint,
  reason text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_events_permohonan ON public.submission_sla_events(permohonan_id, started_at DESC);
GRANT SELECT, INSERT ON public.submission_sla_events TO authenticated;
GRANT ALL ON public.submission_sla_events TO service_role;
ALTER TABLE public.submission_sla_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "sla_events_read" ON public.submission_sla_events FOR SELECT
    USING (
      public.has_role(auth.uid(),'super_admin')
      OR EXISTS (SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id
                 AND (p.pemohon_id = auth.uid()
                      OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid()))))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger pause/resume berdasarkan perubahan status
CREATE OR REPLACE FUNCTION public.trg_permohonan_sla_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_enabled boolean;
  v_pause_statuses text[] := ARRAY['menunggu_dokumen','dikembalikan'];
  v_was_paused boolean;
  v_is_paused boolean;
  v_dur bigint;
BEGIN
  SELECT enabled INTO v_enabled FROM public.feature_flags WHERE flag_key='sla.pause_enabled';
  IF NOT COALESCE(v_enabled,false) THEN RETURN NEW; END IF;
  IF TG_OP <> 'UPDATE' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_was_paused := OLD.status::text = ANY(v_pause_statuses);
  v_is_paused  := NEW.status::text = ANY(v_pause_statuses);

  IF NOT v_was_paused AND v_is_paused THEN
    -- Start pause
    NEW.sla_paused_at := now();
    INSERT INTO public.submission_sla_events(permohonan_id, event_type, started_at, reason, actor)
    VALUES (NEW.id, 'pause', now(), 'status='||NEW.status::text, auth.uid());
  ELSIF v_was_paused AND NOT v_is_paused AND OLD.sla_paused_at IS NOT NULL THEN
    -- End pause
    v_dur := EXTRACT(EPOCH FROM (now() - OLD.sla_paused_at))::bigint;
    NEW.sla_total_pause_seconds := COALESCE(OLD.sla_total_pause_seconds,0) + GREATEST(v_dur,0);
    NEW.sla_paused_at := NULL;
    UPDATE public.submission_sla_events
       SET ended_at = now(), duration_seconds = v_dur
     WHERE permohonan_id = NEW.id AND event_type='pause' AND ended_at IS NULL;
    INSERT INTO public.submission_sla_events(permohonan_id, event_type, started_at, duration_seconds, reason, actor)
    VALUES (NEW.id, 'resume', now(), v_dur, 'status='||NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_permohonan_sla_pause ON public.permohonan;
CREATE TRIGGER trg_permohonan_sla_pause
  BEFORE UPDATE ON public.permohonan
  FOR EACH ROW EXECUTE FUNCTION public.trg_permohonan_sla_pause();

-- Helper: durasi SLA efektif (detik)
CREATE OR REPLACE FUNCTION public.fn_permohonan_effective_sla_seconds(_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(p.updated_at, now()) - p.tanggal_masuk))::bigint
    - COALESCE(p.sla_total_pause_seconds,0)
    - CASE WHEN p.sla_paused_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (now() - p.sla_paused_at))::bigint
           ELSE 0 END,
    0)
  FROM public.permohonan p WHERE p.id = _id;
$$;

-- ============================================================
-- A2. Escalation config + events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.escalation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opd_id uuid REFERENCES public.opd(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 3),
  threshold_days int NOT NULL CHECK (threshold_days > 0),
  target_role text NOT NULL DEFAULT 'admin_opd',
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(opd_id, level)
);
GRANT SELECT ON public.escalation_config TO authenticated;
GRANT ALL ON public.escalation_config TO service_role;
ALTER TABLE public.escalation_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "esc_cfg_read" ON public.escalation_config FOR SELECT
    USING (public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND (opd_id IS NULL OR opd_id = public.get_user_opd(auth.uid()))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "esc_cfg_super_write" ON public.escalation_config FOR ALL
    USING (public.has_role(auth.uid(),'super_admin'))
    WITH CHECK (public.has_role(auth.uid(),'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.escalation_config(opd_id, level, threshold_days, target_role) VALUES
  (NULL, 1, 1, 'admin_opd'),
  (NULL, 2, 3, 'admin_opd'),
  (NULL, 3, 7, 'super_admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- A3. Disposisi berjenjang
-- ============================================================
CREATE TABLE IF NOT EXISTS public.submission_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id uuid NOT NULL REFERENCES public.permohonan(id) ON DELETE CASCADE,
  from_user uuid,
  to_user uuid NOT NULL,
  level text NOT NULL CHECK (level IN ('kepala_opd','kabid','staf','review')),
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','done','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_disposisi_to_user ON public.submission_dispositions(to_user, status);
CREATE INDEX IF NOT EXISTS idx_disposisi_permohonan ON public.submission_dispositions(permohonan_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.submission_dispositions TO authenticated;
GRANT ALL ON public.submission_dispositions TO service_role;
ALTER TABLE public.submission_dispositions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "disp_read" ON public.submission_dispositions FOR SELECT
    USING (
      public.has_role(auth.uid(),'super_admin')
      OR to_user = auth.uid() OR from_user = auth.uid()
      OR EXISTS (SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id
                 AND (p.pemohon_id = auth.uid()
                      OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid()))))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "disp_insert_admin" ON public.submission_dispositions FOR INSERT
    WITH CHECK (
      public.has_role(auth.uid(),'super_admin')
      OR (public.has_role(auth.uid(),'admin_opd')
          AND EXISTS (SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id
                      AND p.opd_id = public.get_user_opd(auth.uid())))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "disp_update_recipient" ON public.submission_dispositions FOR UPDATE
    USING (to_user = auth.uid() OR public.has_role(auth.uid(),'super_admin'))
    WITH CHECK (to_user = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Notifikasi disposisi masuk
CREATE OR REPLACE FUNCTION public.trg_notify_disposisi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_kode text;
BEGIN
  SELECT kode INTO v_kode FROM public.permohonan WHERE id = NEW.permohonan_id;
  INSERT INTO public.notifications(user_id, tipe, judul, body, link, meta)
  VALUES (NEW.to_user, 'disposisi',
    'Disposisi baru: '||COALESCE(v_kode,'permohonan'),
    LEFT(COALESCE(NEW.note,''),200),
    '/permohonan/'||NEW.permohonan_id::text,
    jsonb_build_object('permohonan_id',NEW.permohonan_id,'level',NEW.level));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_disposisi ON public.submission_dispositions;
CREATE TRIGGER trg_notify_disposisi
  AFTER INSERT ON public.submission_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_disposisi();

-- ============================================================
-- A4. Nomor Surat Resmi
-- ============================================================
ALTER TABLE public.opd
  ADD COLUMN IF NOT EXISTS nomor_surat_format text DEFAULT '{kode}/{seq}/{singkatan}/{tahun}',
  ADD COLUMN IF NOT EXISTS nomor_surat_kode text;

CREATE TABLE IF NOT EXISTS public.nomor_surat_sequence (
  opd_id uuid NOT NULL REFERENCES public.opd(id) ON DELETE CASCADE,
  tahun int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opd_id, tahun)
);
GRANT SELECT ON public.nomor_surat_sequence TO authenticated;
GRANT ALL ON public.nomor_surat_sequence TO service_role;
ALTER TABLE public.nomor_surat_sequence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "nss_read" ON public.nomor_surat_sequence FOR SELECT
    USING (public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.nomor_surat_issued (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id uuid REFERENCES public.permohonan(id) ON DELETE SET NULL,
  opd_id uuid NOT NULL REFERENCES public.opd(id),
  tahun int NOT NULL,
  nomor text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid,
  UNIQUE(opd_id, tahun, nomor)
);
CREATE INDEX IF NOT EXISTS idx_nsi_permohonan ON public.nomor_surat_issued(permohonan_id);
GRANT SELECT, INSERT ON public.nomor_surat_issued TO authenticated;
GRANT ALL ON public.nomor_surat_issued TO service_role;
ALTER TABLE public.nomor_surat_issued ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "nsi_read" ON public.nomor_surat_issued FOR SELECT
    USING (
      public.has_role(auth.uid(),'super_admin')
      OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid()))
      OR EXISTS (SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id AND p.pemohon_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.fn_generate_nomor_surat(_opd_id uuid, _permohonan_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_seq int;
  v_fmt text; v_singkatan text; v_kode text; v_nomor text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
          OR (public.has_role(auth.uid(),'admin_opd') AND _opd_id = public.get_user_opd(auth.uid()))) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.nomor_surat_sequence(opd_id, tahun, last_number)
  VALUES (_opd_id, v_year, 1)
  ON CONFLICT (opd_id, tahun) DO UPDATE
    SET last_number = public.nomor_surat_sequence.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_seq;

  SELECT COALESCE(nomor_surat_format,'{kode}/{seq}/{singkatan}/{tahun}'),
         COALESCE(singkatan,''),
         COALESCE(nomor_surat_kode,'470')
    INTO v_fmt, v_singkatan, v_kode
  FROM public.opd WHERE id = _opd_id;

  v_nomor := replace(replace(replace(replace(v_fmt,
    '{kode}', v_kode),
    '{seq}', lpad(v_seq::text, 3, '0')),
    '{singkatan}', v_singkatan),
    '{tahun}', v_year::text);

  INSERT INTO public.nomor_surat_issued(permohonan_id, opd_id, tahun, nomor, issued_by)
  VALUES (_permohonan_id, _opd_id, v_year, v_nomor, auth.uid());

  IF _permohonan_id IS NOT NULL THEN
    UPDATE public.permohonan SET nomor_surat = v_nomor WHERE id = _permohonan_id;
  END IF;
  RETURN v_nomor;
END $$;

-- ============================================================
-- A5. Dokumen verifikasi publik (untuk QR)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.dokumen_verifikasi (
  token text PRIMARY KEY,
  permohonan_id uuid REFERENCES public.permohonan(id) ON DELETE CASCADE,
  nomor_surat text,
  storage_path text NOT NULL,
  sha256 text,
  signature_provider text NOT NULL DEFAULT 'none',
  diterbitkan_oleh uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dokver_permohonan ON public.dokumen_verifikasi(permohonan_id);
GRANT SELECT ON public.dokumen_verifikasi TO anon, authenticated;
GRANT ALL ON public.dokumen_verifikasi TO service_role;
ALTER TABLE public.dokumen_verifikasi ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dokver_public_read" ON public.dokumen_verifikasi FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- A6. IKM 9 unsur (PermenPAN-RB 14/2017)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ikm_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  periode text NOT NULL,
  opd_id uuid REFERENCES public.opd(id) ON DELETE CASCADE,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.ikm_surveys TO anon, authenticated;
GRANT ALL ON public.ikm_surveys TO service_role;
ALTER TABLE public.ikm_surveys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ikm_surveys_read" ON public.ikm_surveys FOR SELECT USING (aktif = true OR public.has_role(auth.uid(),'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ikm_surveys_admin_write" ON public.ikm_surveys FOR ALL
    USING (public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())))
    WITH CHECK (public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND opd_id = public.get_user_opd(auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ikm_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.ikm_surveys(id) ON DELETE CASCADE,
  permohonan_id uuid REFERENCES public.permohonan(id) ON DELETE SET NULL,
  user_id uuid,
  u1 smallint CHECK (u1 BETWEEN 1 AND 4),
  u2 smallint CHECK (u2 BETWEEN 1 AND 4),
  u3 smallint CHECK (u3 BETWEEN 1 AND 4),
  u4 smallint CHECK (u4 BETWEEN 1 AND 4),
  u5 smallint CHECK (u5 BETWEEN 1 AND 4),
  u6 smallint CHECK (u6 BETWEEN 1 AND 4),
  u7 smallint CHECK (u7 BETWEEN 1 AND 4),
  u8 smallint CHECK (u8 BETWEEN 1 AND 4),
  u9 smallint CHECK (u9 BETWEEN 1 AND 4),
  saran text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(survey_id, permohonan_id)
);
GRANT SELECT, INSERT ON public.ikm_responses TO authenticated;
GRANT ALL ON public.ikm_responses TO service_role;
ALTER TABLE public.ikm_responses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ikm_resp_insert_self" ON public.ikm_responses FOR INSERT
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ikm_resp_read_admin" ON public.ikm_responses FOR SELECT
    USING (public.has_role(auth.uid(),'super_admin')
        OR user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.ikm_surveys s WHERE s.id = survey_id
                   AND public.has_role(auth.uid(),'admin_opd')
                   AND s.opd_id = public.get_user_opd(auth.uid())));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Agregasi IKM (skala 1-4 → indeks * 25)
CREATE OR REPLACE FUNCTION public.fn_ikm_dashboard(_survey_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'survey_id', _survey_id,
    'jumlah_responden', COUNT(*),
    'u1', ROUND(AVG(u1)::numeric,2), 'u2', ROUND(AVG(u2)::numeric,2),
    'u3', ROUND(AVG(u3)::numeric,2), 'u4', ROUND(AVG(u4)::numeric,2),
    'u5', ROUND(AVG(u5)::numeric,2), 'u6', ROUND(AVG(u6)::numeric,2),
    'u7', ROUND(AVG(u7)::numeric,2), 'u8', ROUND(AVG(u8)::numeric,2),
    'u9', ROUND(AVG(u9)::numeric,2),
    'ikm', ROUND((AVG(u1)+AVG(u2)+AVG(u3)+AVG(u4)+AVG(u5)+AVG(u6)+AVG(u7)+AVG(u8)+AVG(u9))/9 * 25, 2)
  ) FROM public.ikm_responses WHERE survey_id = _survey_id;
$$;

-- ============================================================
-- View bantu untuk cron escalation
-- ============================================================
CREATE OR REPLACE VIEW public.v_permohonan_overdue AS
  SELECT p.id, p.kode, p.opd_id, p.tenggat, p.status,
         GREATEST(0, EXTRACT(EPOCH FROM (now() - p.tenggat))/86400.0)::int AS overdue_days
  FROM public.permohonan p
  WHERE p.status NOT IN ('selesai','ditolak','dibatalkan')
    AND p.tenggat IS NOT NULL
    AND p.tenggat < now()
    AND p.sla_paused_at IS NULL;
GRANT SELECT ON public.v_permohonan_overdue TO authenticated, service_role;
