
-- Add missing columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS asn_type text,
  ADD COLUMN IF NOT EXISTS system_position text;

ALTER TABLE public.pejabat
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS is_pimpinan boolean NOT NULL DEFAULT false;

-- Permissions catalog
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  label text NOT NULL,
  kategori text NOT NULL DEFAULT 'umum',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissions baca login" ON public.permissions;
CREATE POLICY "Permissions baca login" ON public.permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admin kelola permissions" ON public.permissions;
CREATE POLICY "Super admin kelola permissions" ON public.permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Per-user permission overrides
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission_code text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  reason text,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_code)
);
GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User lihat permission sendiri" ON public.user_permissions;
CREATE POLICY "User lihat permission sendiri" ON public.user_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS "Super admin kelola user_permissions" ON public.user_permissions;
CREATE POLICY "Super admin kelola user_permissions" ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- RBAC audit
CREATE TABLE IF NOT EXISTS public.rbac_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  target_user_id uuid,
  aksi text NOT NULL,
  entitas text NOT NULL,
  data_sebelum jsonb,
  data_sesudah jsonb
);
GRANT SELECT, INSERT ON public.rbac_audit TO authenticated;
GRANT ALL ON public.rbac_audit TO service_role;
ALTER TABLE public.rbac_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Super admin lihat rbac_audit" ON public.rbac_audit;
CREATE POLICY "Super admin lihat rbac_audit" ON public.rbac_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));
DROP POLICY IF EXISTS "Super admin insert rbac_audit" ON public.rbac_audit;
CREATE POLICY "Super admin insert rbac_audit" ON public.rbac_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipe text NOT NULL,
  judul text NOT NULL,
  body text,
  link text,
  meta jsonb DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "User lihat notifikasi sendiri" ON public.notifications;
CREATE POLICY "User lihat notifikasi sendiri" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "User update notifikasi sendiri" ON public.notifications;
CREATE POLICY "User update notifikasi sendiri" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- has_permission RPC
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT granted FROM public.user_permissions
    WHERE user_id = _user_id AND permission_code = _code
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  ), public.has_role(_user_id, 'super_admin'));
$$;

-- get_effective_permissions RPC
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id uuid)
RETURNS TABLE(permission_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT up.permission_code FROM public.user_permissions up
  WHERE up.user_id = _user_id AND up.granted = true
    AND (up.expires_at IS NULL OR up.expires_at > now())
  UNION
  SELECT p.code FROM public.permissions p
  WHERE public.has_role(_user_id, 'super_admin');
$$;
