-- 1) Extend status enum
ALTER TYPE public.status_permohonan ADD VALUE IF NOT EXISTS 'menunggu_dokumen';
ALTER TYPE public.status_permohonan ADD VALUE IF NOT EXISTS 'dikembalikan';
ALTER TYPE public.status_permohonan ADD VALUE IF NOT EXISTS 'dibatalkan';

-- 2) Alasan penolakan
ALTER TABLE public.permohonan ADD COLUMN IF NOT EXISTS alasan_penolakan text;

-- 3) permohonan_berkas
CREATE TABLE IF NOT EXISTS public.permohonan_berkas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id uuid NOT NULL,
  storage_path text NOT NULL,
  nama_asli text NOT NULL,
  mime text,
  size_bytes bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL,
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pb_permohonan ON public.permohonan_berkas(permohonan_id);

GRANT SELECT, INSERT, DELETE ON public.permohonan_berkas TO authenticated;
GRANT ALL ON public.permohonan_berkas TO service_role;

ALTER TABLE public.permohonan_berkas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_select_terkait" ON public.permohonan_berkas FOR SELECT TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.has_role(auth.uid(),'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.permohonan p
    WHERE p.id = permohonan_berkas.permohonan_id
      AND (p.pemohon_id = auth.uid()
           OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid())))
  )
);

CREATE POLICY "pb_insert_terkait" ON public.permohonan_berkas FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id
      AND (p.pemohon_id = auth.uid()
           OR public.has_role(auth.uid(),'super_admin')
           OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid())))
  )
);

CREATE POLICY "pb_delete_owner_admin" ON public.permohonan_berkas FOR DELETE TO authenticated
USING (
  uploaded_by = auth.uid() OR public.has_role(auth.uid(),'super_admin')
);

-- 4) permohonan_komentar (chat 2 arah pemohon <-> petugas)
CREATE TABLE IF NOT EXISTS public.permohonan_komentar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permohonan_id uuid NOT NULL,
  oleh uuid NOT NULL,
  pesan text NOT NULL,
  internal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pk_permohonan ON public.permohonan_komentar(permohonan_id, created_at);

GRANT SELECT, INSERT ON public.permohonan_komentar TO authenticated;
GRANT ALL ON public.permohonan_komentar TO service_role;

ALTER TABLE public.permohonan_komentar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pk_select" ON public.permohonan_komentar FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_komentar.permohonan_id
      AND (
        (p.pemohon_id = auth.uid() AND permohonan_komentar.internal_only = false)
        OR public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid()))
      )
  )
);

CREATE POLICY "pk_insert" ON public.permohonan_komentar FOR INSERT TO authenticated
WITH CHECK (
  oleh = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.permohonan p WHERE p.id = permohonan_id
      AND (
        (p.pemohon_id = auth.uid() AND internal_only = false)
        OR public.has_role(auth.uid(),'super_admin')
        OR (public.has_role(auth.uid(),'admin_opd') AND p.opd_id = public.get_user_opd(auth.uid()))
      )
  )
);

-- 5) Trigger status -> notifikasi pemohon + audit
CREATE OR REPLACE FUNCTION public.log_permohonan_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_log (user_id, aksi, entitas, entitas_id, data_sebelum, data_sesudah)
    VALUES (auth.uid(),'permohonan.status_changed','permohonan',NEW.id::text,
      jsonb_build_object('status',OLD.status), jsonb_build_object('status',NEW.status));
    v_label := CASE NEW.status::text
      WHEN 'baru' THEN 'Baru'
      WHEN 'diproses' THEN 'Diproses'
      WHEN 'menunggu_dokumen' THEN 'Menunggu Dokumen'
      WHEN 'dikembalikan' THEN 'Dikembalikan untuk Revisi'
      WHEN 'ditolak' THEN 'Ditolak'
      WHEN 'selesai' THEN 'Selesai'
      WHEN 'dibatalkan' THEN 'Dibatalkan'
      ELSE NEW.status::text END;
    INSERT INTO public.notifications (user_id, tipe, judul, body, link, meta)
    VALUES (NEW.pemohon_id, 'permohonan_status',
      'Status ' || COALESCE(NEW.kode,'permohonan') || ': ' || v_label,
      COALESCE(NEW.alasan_penolakan, NEW.judul),
      '/permohonan/' || NEW.id::text,
      jsonb_build_object('permohonan_id', NEW.id, 'status', NEW.status::text));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_permohonan_change ON public.permohonan;
CREATE TRIGGER trg_log_permohonan_change
AFTER UPDATE ON public.permohonan
FOR EACH ROW EXECUTE FUNCTION public.log_permohonan_change();

-- 6) Trigger komentar baru -> notifikasi pemohon (jika dari petugas & bukan internal)
CREATE OR REPLACE FUNCTION public.notify_permohonan_komentar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pemohon uuid; v_kode text;
BEGIN
  SELECT pemohon_id, kode INTO v_pemohon, v_kode FROM public.permohonan WHERE id = NEW.permohonan_id;
  IF v_pemohon IS NULL THEN RETURN NEW; END IF;
  IF NEW.internal_only = false AND NEW.oleh <> v_pemohon THEN
    INSERT INTO public.notifications (user_id, tipe, judul, body, link, meta)
    VALUES (v_pemohon, 'permohonan_komentar',
      'Pesan baru pada ' || COALESCE(v_kode,'permohonan'),
      LEFT(NEW.pesan, 200),
      '/permohonan/' || NEW.permohonan_id::text,
      jsonb_build_object('permohonan_id', NEW.permohonan_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_permohonan_komentar ON public.permohonan_komentar;
CREATE TRIGGER trg_notify_permohonan_komentar
AFTER INSERT ON public.permohonan_komentar
FOR EACH ROW EXECUTE FUNCTION public.notify_permohonan_komentar();

-- 7) RPC konversi laporan masyarakat -> permohonan
CREATE OR REPLACE FUNCTION public.konversi_laporan_ke_permohonan(
  _laporan_id uuid, _opd_id uuid, _kategori text, _pemohon_id uuid, _sla_hari int DEFAULT 14
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_kode text; r record;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin')
          OR public.has_role(auth.uid(),'admin_opd')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO r FROM public.laporan_masyarakat WHERE id = _laporan_id;
  IF r IS NULL THEN RAISE EXCEPTION 'Laporan tidak ditemukan'; END IF;
  v_kode := 'PMH-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  INSERT INTO public.permohonan (kode, pemohon_id, opd_id, judul, kategori, deskripsi, prioritas, tenggat, status)
  VALUES (v_kode, _pemohon_id, _opd_id, COALESCE('Laporan: '||LEFT(r.uraian,80),'Laporan masyarakat'),
          COALESCE(_kategori, r.kategori, 'Lainnya'),
          r.uraian, 'normal', now() + make_interval(days => _sla_hari), 'baru')
  RETURNING id INTO v_id;
  UPDATE public.laporan_masyarakat SET status='diproses', tindak_lanjut=COALESCE(tindak_lanjut,'') || E'\nDikonversi ke permohonan '||v_kode WHERE id=_laporan_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.konversi_laporan_ke_permohonan(uuid,uuid,text,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.konversi_laporan_ke_permohonan(uuid,uuid,text,uuid,int) TO authenticated, service_role;