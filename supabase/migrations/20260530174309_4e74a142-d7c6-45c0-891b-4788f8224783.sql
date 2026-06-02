ALTER TABLE public.retry_queue
  ALTER COLUMN job_type SET DEFAULT 'retry';

ALTER TABLE public.dead_letter_jobs
  ALTER COLUMN job_type SET DEFAULT 'dead_letter';

CREATE OR REPLACE FUNCTION public.rating_list_admin()
RETURNS TABLE(
  rating_id uuid,
  skor integer,
  komentar text,
  created_at timestamptz,
  user_id uuid,
  pemohon_nama text,
  permohonan_id uuid,
  permohonan_kode text,
  permohonan_judul text,
  opd_id uuid,
  opd_singkatan text,
  opd_nama text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.id AS rating_id,
    r.skor,
    r.komentar,
    r.created_at,
    r.user_id,
    pr.nama_lengkap AS pemohon_nama,
    p.id AS permohonan_id,
    p.kode AS permohonan_kode,
    p.judul AS permohonan_judul,
    o.id AS opd_id,
    o.singkatan AS opd_singkatan,
    o.nama AS opd_nama
  FROM public.permohonan_rating r
  LEFT JOIN public.permohonan p ON p.id = r.permohonan_id
  LEFT JOIN public.profiles pr ON pr.id = r.user_id
  LEFT JOIN public.opd o ON o.id = p.opd_id
  WHERE public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.riwayat_dengan_petugas(_permohonan_id uuid)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  ts timestamptz,
  aksi text,
  catatan text,
  oleh uuid,
  nama_petugas text,
  email_petugas text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    h.created_at,
    h.created_at AS ts,
    h.aksi,
    h.catatan,
    h.oleh,
    p.nama_lengkap AS nama_petugas,
    NULL::text AS email_petugas
  FROM public.permohonan_riwayat h
  LEFT JOIN public.profiles p ON p.id = h.oleh
  WHERE h.permohonan_id = _permohonan_id
    AND (
      EXISTS (
        SELECT 1 FROM public.permohonan pm
        WHERE pm.id = _permohonan_id
          AND (
            pm.pemohon_id = auth.uid()
            OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
            OR (public.has_role(auth.uid(), 'admin_opd'::public.app_role) AND pm.opd_id = public.get_user_opd(auth.uid()))
          )
      )
    )
  ORDER BY h.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.rating_list_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.riwayat_dengan_petugas(uuid) TO authenticated, service_role;