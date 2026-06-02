-- Hybrid storage provider settings (Supabase default, optional Cloudflare R2).
-- Config disimpan via UI super admin di table app_setting (RLS super admin only).
INSERT INTO public.app_setting (key, value, category, public_visible)
VALUES
  ('storage.provider', '"supabase"'::jsonb, 'storage', false),
  ('storage.encryption_key', '""'::jsonb, 'storage', false),
  ('storage.r2', '{"account_id":"","access_key_id":"","secret_access_key":"","bucket":"","endpoint":"","public_base_url":"","region":"auto"}'::jsonb, 'storage', false)
ON CONFLICT (key) DO NOTHING;

-- Lacak provider per-file agar preview/hapus dapat memilih backend yang benar.
ALTER TABLE public.form_submission_files
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'supabase';