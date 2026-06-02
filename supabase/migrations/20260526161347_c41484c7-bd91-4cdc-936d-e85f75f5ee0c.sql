
-- Fase 5: hardening RLS + index
-- 1) Indexes untuk performa permission lookup
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_code ON public.user_permissions(user_id, permission_code);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_opd ON public.profiles(opd_id);
CREATE INDEX IF NOT EXISTS idx_profiles_system_position ON public.profiles(system_position);
CREATE INDEX IF NOT EXISTS idx_profiles_asn_type ON public.profiles(asn_type);
CREATE INDEX IF NOT EXISTS idx_share_paket_status ON public.share_paket(status);
CREATE INDEX IF NOT EXISTS idx_share_target_paket ON public.share_target(paket_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_created ON public.rbac_audit(created_at DESC);

-- 2) Tambah policy SELECT audit_log untuk admin_pemda (paralel; super_admin tetap punya policy lama)
DROP POLICY IF EXISTS "Admin pemda lihat audit log" ON public.audit_log;
CREATE POLICY "Admin pemda lihat audit log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin_pemda'::app_role) OR has_permission(auth.uid(), 'can_view_audit_logs'));

-- 3) Trigger audit RBAC pada tabel kritis
DROP TRIGGER IF EXISTS trg_rbac_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_rbac_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_rbac_change();

DROP TRIGGER IF EXISTS trg_rbac_audit_user_perm ON public.user_permissions;
CREATE TRIGGER trg_rbac_audit_user_perm
AFTER INSERT OR UPDATE OR DELETE ON public.user_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_rbac_change();
