
-- Internal-only: revoke from anon/authenticated/public
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_form_submission_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_increment(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, text, timestamp with time zone) TO service_role;

-- Public-facing (used by app via PostgREST / supabase-js .rpc): keep authenticated EXECUTE.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_opd(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_desa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_permohonan_bulan_ini() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.opd_rating_agg() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.opd_kinerja_agg() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rating_list_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.riwayat_dengan_petugas(uuid) TO authenticated;
