REVOKE EXECUTE ON FUNCTION public.governance_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.production_health_score() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.governance_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.production_health_score() TO authenticated, service_role;