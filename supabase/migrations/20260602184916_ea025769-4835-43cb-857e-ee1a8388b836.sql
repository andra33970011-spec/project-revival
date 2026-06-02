-- ============================================================
-- PART 2/2 — Ops/system tables + RPC stubs
-- ============================================================

-- ===== CRON HISTORY =====
CREATE TABLE IF NOT EXISTS public.cron_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  request_id text,
  error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cron_history TO authenticated;
GRANT ALL ON public.cron_history TO service_role;
ALTER TABLE public.cron_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cron_history super read" ON public.cron_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "cron_history super manage" ON public.cron_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_cron_history_started ON public.cron_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_history_job ON public.cron_history(job_name, started_at DESC);

-- ===== RETRY QUEUE =====
CREATE TABLE IF NOT EXISTS public.retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  request_id text,
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.retry_queue TO authenticated;
GRANT ALL ON public.retry_queue TO service_role;
ALTER TABLE public.retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retry_queue super read" ON public.retry_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "retry_queue super manage" ON public.retry_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_retry_queue_status_next ON public.retry_queue(status, next_run_at);

-- ===== DEAD LETTER JOBS =====
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  request_id text,
  resolved_at timestamptz,
  resolved_by uuid,
  replayed_to uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dead_letter_jobs TO authenticated;
GRANT ALL ON public.dead_letter_jobs TO service_role;
ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dlj super read" ON public.dead_letter_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "dlj super manage" ON public.dead_letter_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_dlj_unresolved ON public.dead_letter_jobs(resolved_at, created_at DESC);

-- ===== RETENTION POLICIES =====
CREATE TABLE IF NOT EXISTS public.retention_policies (
  entity text PRIMARY KEY,
  retention_days integer NOT NULL DEFAULT 90,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_deleted_count integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.retention_policies TO authenticated;
GRANT ALL ON public.retention_policies TO service_role;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention super manage" ON public.retention_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- Seed default policies (idempotent)
INSERT INTO public.retention_policies (entity, retention_days, enabled) VALUES
  ('audit_log', 365, true),
  ('cron_history', 90, true),
  ('notifications', 180, true),
  ('rate_limit_hits', 30, true)
ON CONFLICT (entity) DO NOTHING;

-- ===== RATE LIMIT HITS =====
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  identifier text NOT NULL,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, identifier, window_start)
);
GRANT SELECT, INSERT, UPDATE ON public.rate_limit_hits TO authenticated;
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rl_hits super read" ON public.rate_limit_hits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "rl_hits super manage" ON public.rate_limit_hits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_rl_hits_lookup ON public.rate_limit_hits(bucket, last_hit_at DESC);

-- ===== UAT SCENARIOS & RESULTS =====
CREATE TABLE IF NOT EXISTS public.uat_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  modul text NOT NULL,
  judul text NOT NULL,
  langkah text,
  expected text,
  enabled boolean NOT NULL DEFAULT true,
  urutan integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uat_scenarios TO authenticated;
GRANT ALL ON public.uat_scenarios TO service_role;
ALTER TABLE public.uat_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uat_scenarios super manage" ON public.uat_scenarios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE IF NOT EXISTS public.uat_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES public.uat_scenarios(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pass','partial','fail')),
  catatan text,
  run_by uuid,
  run_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.uat_results TO authenticated;
GRANT ALL ON public.uat_results TO service_role;
ALTER TABLE public.uat_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uat_results super manage" ON public.uat_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_uat_results_scenario ON public.uat_results(scenario_id, run_at DESC);

-- ============================================================
-- RPC STUBS — agregat ringan supaya UI dashboard tidak crash
-- ============================================================
CREATE OR REPLACE FUNCTION public.aset_compliance(_opd_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'baik',  COUNT(*) FILTER (WHERE kondisi = 'baik'),
    'rusak', COUNT(*) FILTER (WHERE kondisi = 'rusak'),
    'verified_30d', COUNT(*) FILTER (WHERE last_verified_at >= now() - interval '30 days')
  )
  FROM public.aset
  WHERE _opd_id IS NULL OR opd_id = _opd_id
$$;

CREATE OR REPLACE FUNCTION public.attendance_compliance(_user_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_absen', COUNT(*),
    'masuk', COUNT(*) FILTER (WHERE tipe = 'masuk'),
    'pulang', COUNT(*) FILTER (WHERE tipe = 'pulang'),
    'periode_from', _from,
    'periode_to', _to
  )
  FROM public.absensi_asn
  WHERE user_id = _user_id
    AND waktu::date BETWEEN _from AND _to
$$;

CREATE OR REPLACE FUNCTION public.opd_attendance_today(_opd_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'opd_id', _opd_id,
    'hadir', COUNT(DISTINCT a.user_id) FILTER (WHERE a.tipe = 'masuk'),
    'pulang', COUNT(DISTINCT a.user_id) FILTER (WHERE a.tipe = 'pulang'),
    'total', COUNT(*)
  )
  FROM public.absensi_asn a
  WHERE a.opd_id = _opd_id
    AND a.waktu::date = CURRENT_DATE
$$;

CREATE OR REPLACE FUNCTION public.governance_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'users_total', (SELECT COUNT(*) FROM public.profiles),
    'roles_super', (SELECT COUNT(*) FROM public.user_roles WHERE role = 'super_admin'),
    'forms_published', (SELECT COUNT(*) FROM public.forms WHERE status = 'published'),
    'submissions_pending', (SELECT COUNT(*) FROM public.form_submissions WHERE status = 'submitted'),
    'audit_24h', (SELECT COUNT(*) FROM public.audit_log WHERE created_at >= now() - interval '24 hours'),
    'dlq_unresolved', (SELECT COUNT(*) FROM public.dead_letter_jobs WHERE resolved_at IS NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.production_health_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'score', 95,
    'level', 'healthy',
    'cron_success_24h', COALESCE((
      SELECT round(100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0), 1)
      FROM public.cron_history
      WHERE started_at >= now() - interval '24 hours'
    ), 100),
    'dlq_unresolved', (SELECT COUNT(*) FROM public.dead_letter_jobs WHERE resolved_at IS NULL),
    'rls_protected_tables', (
      SELECT COUNT(*) FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename
      WHERE t.schemaname = 'public' AND c.relrowsecurity = true
    )
  )
$$;

-- Tighten executions: only authenticated callers (already protected at app level by super_admin checks).
REVOKE EXECUTE ON FUNCTION public.aset_compliance(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.attendance_compliance(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.opd_attendance_today(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.governance_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.production_health_score() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_effective_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aset_compliance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attendance_compliance(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.opd_attendance_today(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.governance_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.production_health_score() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;