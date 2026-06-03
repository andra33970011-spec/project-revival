-- Tambahkan role 'pimpinan' ke enum app_role (additive, idempotent).
-- Role 'admin_pemda' sudah ada sebelumnya. Pisahkan ke migration sendiri karena
-- ALTER TYPE ADD VALUE harus di-commit sebelum nilai bisa direferensikan.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pimpinan';

-- Enum baru untuk klasifikasi pimpinan daerah.
DO $$ BEGIN
  CREATE TYPE public.pimpinan_type AS ENUM ('bupati','wakil_bupati','sekda','asisten','kepala_opd');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;