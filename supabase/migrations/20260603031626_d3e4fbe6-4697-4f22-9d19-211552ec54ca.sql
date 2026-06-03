
-- ============================================
-- ASET: enhancements (P0-P2)
-- ============================================

-- P0: QR token unik per aset
ALTER TABLE public.aset
  ADD COLUMN IF NOT EXISTS qr_token text,
  ADD COLUMN IF NOT EXISTS umur_ekonomis_bulan integer,
  ADD COLUMN IF NOT EXISTS metode_susut text CHECK (metode_susut IS NULL OR metode_susut IN ('garis_lurus','saldo_menurun')),
  ADD COLUMN IF NOT EXISTS garansi_sampai date,
  ADD COLUMN IF NOT EXISTS kalibrasi_berikut date,
  ADD COLUMN IF NOT EXISTS dokumen_kehilangan_url text;

-- Generate token untuk yang belum ada
UPDATE public.aset SET qr_token = encode(gen_random_bytes(12),'hex') WHERE qr_token IS NULL;
ALTER TABLE public.aset ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS aset_qr_token_unique ON public.aset(qr_token);

-- Default token untuk insert baru
CREATE OR REPLACE FUNCTION public.aset_set_qr_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.qr_token IS NULL OR NEW.qr_token = '' THEN
    NEW.qr_token := encode(gen_random_bytes(12),'hex');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS aset_qr_token_default ON public.aset;
CREATE TRIGGER aset_qr_token_default BEFORE INSERT ON public.aset
FOR EACH ROW EXECUTE FUNCTION public.aset_set_qr_token();

-- P1: Tabel mutasi (serah-terima)
CREATE TABLE IF NOT EXISTS public.aset_mutasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE CASCADE,
  dari_user uuid,
  ke_user uuid,
  dari_opd uuid,
  ke_opd uuid,
  alasan text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','dibatalkan')),
  diajukan_oleh uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  catatan_approval text,
  ttd_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.aset_mutasi TO authenticated;
GRANT ALL ON public.aset_mutasi TO service_role;
ALTER TABLE public.aset_mutasi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aset_mutasi read"
ON public.aset_mutasi FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin')
  OR (has_role(auth.uid(),'admin_opd') AND (dari_opd = get_user_opd(auth.uid()) OR ke_opd = get_user_opd(auth.uid())))
  OR diajukan_oleh = auth.uid() OR dari_user = auth.uid() OR ke_user = auth.uid()
);
CREATE POLICY "aset_mutasi insert"
ON public.aset_mutasi FOR INSERT TO authenticated
WITH CHECK (diajukan_oleh = auth.uid());
CREATE POLICY "aset_mutasi update admin"
ON public.aset_mutasi FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'super_admin')
  OR (has_role(auth.uid(),'admin_opd') AND ke_opd = get_user_opd(auth.uid()))
);

CREATE TRIGGER aset_mutasi_updated_at BEFORE UPDATE ON public.aset_mutasi
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: apply mutasi saat approved
CREATE OR REPLACE FUNCTION public.apply_aset_mutasi()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved' THEN
    UPDATE public.aset
       SET pemegang_user_id = NEW.ke_user,
           opd_id = COALESCE(NEW.ke_opd, opd_id)
     WHERE id = NEW.aset_id;
    INSERT INTO public.aset_riwayat (aset_id, oleh, aksi, catatan, data)
    VALUES (NEW.aset_id, NEW.approved_by, 'mutasi_approved', NEW.alasan,
            jsonb_build_object('mutasi_id', NEW.id, 'dari_user', NEW.dari_user, 'ke_user', NEW.ke_user,
                               'dari_opd', NEW.dari_opd, 'ke_opd', NEW.ke_opd));
    IF NEW.ke_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, tipe, judul, body, link, meta)
      VALUES (NEW.ke_user, 'aset_mutasi', 'Aset dimutasikan kepada Anda',
              LEFT(NEW.alasan,200), '/asn/aset',
              jsonb_build_object('aset_id', NEW.aset_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS apply_aset_mutasi_trg ON public.aset_mutasi;
CREATE TRIGGER apply_aset_mutasi_trg AFTER UPDATE ON public.aset_mutasi
FOR EACH ROW EXECUTE FUNCTION public.apply_aset_mutasi();

-- P1: Tabel pemeliharaan
CREATE TABLE IF NOT EXISTS public.aset_pemeliharaan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id uuid NOT NULL REFERENCES public.aset(id) ON DELETE CASCADE,
  jadwal_at date NOT NULL,
  jenis text NOT NULL,
  status text NOT NULL DEFAULT 'terjadwal' CHECK (status IN ('terjadwal','berjalan','selesai','dibatalkan')),
  biaya numeric DEFAULT 0,
  vendor text,
  oleh uuid,
  hasil text,
  dokumen_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aset_pemeliharaan TO authenticated;
GRANT ALL ON public.aset_pemeliharaan TO service_role;
ALTER TABLE public.aset_pemeliharaan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aset_pemeliharaan read"
ON public.aset_pemeliharaan FOR SELECT TO authenticated USING (true);

CREATE POLICY "aset_pemeliharaan manage admin"
ON public.aset_pemeliharaan FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin')
  OR (has_role(auth.uid(),'admin_opd') AND EXISTS(
    SELECT 1 FROM public.aset a WHERE a.id = aset_pemeliharaan.aset_id AND a.opd_id = get_user_opd(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(),'super_admin')
  OR (has_role(auth.uid(),'admin_opd') AND EXISTS(
    SELECT 1 FROM public.aset a WHERE a.id = aset_pemeliharaan.aset_id AND a.opd_id = get_user_opd(auth.uid())))
);

CREATE TRIGGER aset_pemeliharaan_updated_at BEFORE UPDATE ON public.aset_pemeliharaan
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- P1: View nilai buku
CREATE OR REPLACE VIEW public.aset_nilai_buku AS
SELECT a.id, a.kode, a.nama, a.opd_id, a.nilai_perolehan, a.tanggal_perolehan,
  a.umur_ekonomis_bulan, COALESCE(a.metode_susut,'garis_lurus') AS metode_susut,
  CASE
    WHEN a.nilai_perolehan IS NULL OR a.nilai_perolehan = 0 OR a.tanggal_perolehan IS NULL
         OR a.umur_ekonomis_bulan IS NULL OR a.umur_ekonomis_bulan = 0 THEN a.nilai_perolehan
    WHEN COALESCE(a.metode_susut,'garis_lurus') = 'garis_lurus' THEN
      GREATEST(0, a.nilai_perolehan - (a.nilai_perolehan / a.umur_ekonomis_bulan) *
        LEAST(a.umur_ekonomis_bulan,
              EXTRACT(YEAR FROM age(CURRENT_DATE, a.tanggal_perolehan))*12 +
              EXTRACT(MONTH FROM age(CURRENT_DATE, a.tanggal_perolehan))))
    ELSE
      a.nilai_perolehan * power(0.8, GREATEST(0, EXTRACT(YEAR FROM age(CURRENT_DATE, a.tanggal_perolehan))))
  END::numeric AS nilai_buku
FROM public.aset a;

GRANT SELECT ON public.aset_nilai_buku TO authenticated, service_role;

-- P1: RPC cek garansi/kalibrasi (untuk cron weekly)
CREATE OR REPLACE FUNCTION public.aset_due_warranty(_days integer DEFAULT 30)
RETURNS TABLE(aset_id uuid, kode text, nama text, opd_id uuid, jenis text, due_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, kode, nama, opd_id, 'garansi'::text, garansi_sampai
  FROM public.aset
  WHERE garansi_sampai IS NOT NULL
    AND garansi_sampai BETWEEN CURRENT_DATE AND CURRENT_DATE + make_interval(days => _days)
  UNION ALL
  SELECT id, kode, nama, opd_id, 'kalibrasi'::text, kalibrasi_berikut
  FROM public.aset
  WHERE kalibrasi_berikut IS NOT NULL
    AND kalibrasi_berikut BETWEEN CURRENT_DATE AND CURRENT_DATE + make_interval(days => _days);
$$;
REVOKE ALL ON FUNCTION public.aset_due_warranty(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aset_due_warranty(integer) TO authenticated, service_role;

-- ============================================
-- DATASET / FORMS: enhancements (P0-P2)
-- ============================================

-- P2: forms public flag + slug untuk open data portal
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS forms_slug_unique ON public.forms(slug) WHERE slug IS NOT NULL;

-- Tambah policy publik baca form yang published + is_public
CREATE POLICY "forms public read"
ON public.forms FOR SELECT TO anon, authenticated
USING (status = 'published' AND is_public = true);

-- Public read fields utk form publik
CREATE POLICY "form_fields public read"
ON public.form_fields FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.forms f WHERE f.id = form_fields.form_id AND f.status='published' AND f.is_public=true));

-- P1: Komentar submission (multi-turn review)
CREATE TABLE IF NOT EXISTS public.form_submission_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  oleh uuid NOT NULL,
  pesan text NOT NULL,
  internal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.form_submission_comment TO authenticated;
GRANT ALL ON public.form_submission_comment TO service_role;
ALTER TABLE public.form_submission_comment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsc read"
ON public.form_submission_comment FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = form_submission_comment.submission_id
      AND (
        (s.user_id = auth.uid() AND internal_only = false)
        OR (has_role(auth.uid(),'admin_opd') AND s.opd_id = get_user_opd(auth.uid()))
      )
  )
);

CREATE POLICY "fsc insert"
ON public.form_submission_comment FOR INSERT TO authenticated
WITH CHECK (
  oleh = auth.uid() AND EXISTS (
    SELECT 1 FROM public.form_submissions s
    WHERE s.id = submission_id
      AND (s.user_id = auth.uid() OR has_role(auth.uid(),'admin_opd') OR has_role(auth.uid(),'super_admin'))
  )
);

CREATE INDEX IF NOT EXISTS idx_fsc_submission ON public.form_submission_comment(submission_id, created_at);

-- Trigger: notifikasi komentar baru ke pihak lain
CREATE OR REPLACE FUNCTION public.notify_fsc_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_submitter uuid; v_form text;
BEGIN
  IF NEW.internal_only = true THEN RETURN NEW; END IF;
  SELECT s.user_id, f.judul INTO v_submitter, v_form
  FROM public.form_submissions s JOIN public.forms f ON f.id = s.form_id
  WHERE s.id = NEW.submission_id;
  IF v_submitter IS NOT NULL AND v_submitter <> NEW.oleh THEN
    INSERT INTO public.notifications(user_id, tipe, judul, body, link, meta)
    VALUES (v_submitter, 'form_komentar',
      'Pesan baru pada submisi ' || COALESCE(v_form,'formulir'),
      LEFT(NEW.pesan,200),
      '/pengisian/' || (SELECT form_id FROM public.form_submissions WHERE id = NEW.submission_id)::text,
      jsonb_build_object('submission_id', NEW.submission_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_fsc_new_trg ON public.form_submission_comment;
CREATE TRIGGER notify_fsc_new_trg AFTER INSERT ON public.form_submission_comment
FOR EACH ROW EXECUTE FUNCTION public.notify_fsc_new();

-- P0: RPC migrasi dataset_template lama → forms
CREATE OR REPLACE FUNCTION public.migrasi_dataset_ke_forms(_template_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tpl record; new_form_id uuid; k jsonb; i int := 0;
  v_tipe text;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO tpl FROM public.dataset_template WHERE id = _template_id;
  IF tpl IS NULL THEN RAISE EXCEPTION 'Template tidak ditemukan'; END IF;

  INSERT INTO public.forms (judul, deskripsi, status, opd_pemilik_id, deadline,
                            allow_multiple_submit, created_by, published_at, published_by)
  VALUES (tpl.judul, tpl.deskripsi,
          CASE WHEN tpl.aktif THEN 'published' ELSE 'draft' END,
          tpl.opd_pemilik_id, tpl.deadline, tpl.allow_multiple_submit,
          auth.uid(),
          CASE WHEN tpl.aktif THEN now() ELSE NULL END,
          CASE WHEN tpl.aktif THEN auth.uid() ELSE NULL END)
  RETURNING id INTO new_form_id;

  FOR k IN SELECT * FROM jsonb_array_elements(tpl.kolom) LOOP
    v_tipe := COALESCE(k->>'tipe','text');
    INSERT INTO public.form_fields (form_id, kode, label, tipe, required, placeholder, help_text, options, urutan)
    VALUES (new_form_id,
            COALESCE(k->>'key','field_'||i),
            COALESCE(k->>'label','Field '||i),
            CASE v_tipe
              WHEN 'text' THEN 'short_text'
              WHEN 'textarea' THEN 'long_text'
              WHEN 'number' THEN 'number'
              WHEN 'date' THEN 'date'
              WHEN 'select' THEN 'select'
              ELSE 'short_text' END,
            COALESCE((k->>'required')::boolean, false),
            NULL,
            k->>'help',
            CASE WHEN k ? 'options' THEN k->'options' ELSE NULL END,
            i);
    i := i + 1;
  END LOOP;

  -- Tambahkan target spesifik bila ada
  IF array_length(tpl.target_opd_ids, 1) > 0 THEN
    INSERT INTO public.form_targets (form_id, target_type, target_value)
    SELECT new_form_id, 'opd', unnest(tpl.target_opd_ids)::text;
  END IF;

  -- Arsipkan template lama
  UPDATE public.dataset_template SET aktif = false WHERE id = _template_id;

  RETURN new_form_id;
END $$;

REVOKE ALL ON FUNCTION public.migrasi_dataset_ke_forms(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrasi_dataset_ke_forms(uuid) TO authenticated, service_role;
