// Stuck-job detector — surfaces operations that have been "in progress"
// past their expected SLA. Read-only; never mutates state.
// Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StuckReport = {
  stuckUploads: number;
  stuckCleanupRuns: number;
  loopingRetryJobs: number;
  unresolvedDeadLetters: number;
  staleCronJobs: Array<{ jobName: string; lastSuccessAt: string | null; minutesSince: number | null }>;
  generatedAt: string;
};

const STUCK_UPLOAD_HOURS = 12; // upload started but never finalized
const STUCK_CLEANUP_MINUTES = 30; // cleanup job running too long
const RETRY_LOOP_ATTEMPTS = 4; // jobs retried >=N times still pending
const CRON_STALE_HOURS = 3; // cron should have run within this window

/** Aggregate operational health metrics. Lightweight queries only. */
export async function detectStuck(): Promise<StuckReport> {
  const now = Date.now();
  const uploadCutoff = new Date(now - STUCK_UPLOAD_HOURS * 3600 * 1000).toISOString();
  const cleanupCutoff = new Date(now - STUCK_CLEANUP_MINUTES * 60 * 1000).toISOString();

  // 1) Uploads stuck in pending state
  const { count: stuckUploads } = await supabaseAdmin
    .from("form_submission_files")
    .select("id", { count: "exact", head: true })
    .eq("cleanup_status", "pending_cleanup")
    .lt("upload_started_at", uploadCutoff);

  // 2) Cleanup runs that started but never finished
  const { count: stuckCleanupRuns } = await supabaseAdmin
    .from("cron_history")
    .select("id", { count: "exact", head: true })
    .eq("status", "running")
    .lt("started_at", cleanupCutoff);

  // 3) Retry jobs looping (high attempts, still pending/retrying)
  const { count: loopingRetryJobs } = await supabaseAdmin
    .from("retry_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "retrying"])
    .gte("attempts", RETRY_LOOP_ATTEMPTS);

  // 4) Unresolved dead letters
  const { count: unresolvedDeadLetters } = await supabaseAdmin
    .from("dead_letter_jobs")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  // 5) Cron jobs whose last success is too old
  const { data: cronRows } = await supabaseAdmin
    .from("cron_history")
    .select("job_name, finished_at, status")
    .eq("status", "success")
    .order("finished_at", { ascending: false })
    .limit(50);

  const lastSuccessByJob = new Map<string, string>();
  for (const r of cronRows ?? []) {
    if (!lastSuccessByJob.has(r.job_name) && r.finished_at) {
      lastSuccessByJob.set(r.job_name, r.finished_at);
    }
  }
  const staleCronJobs = Array.from(lastSuccessByJob.entries())
    .map(([jobName, lastSuccessAt]) => {
      const minutesSince = Math.floor((now - new Date(lastSuccessAt).getTime()) / 60000);
      return { jobName, lastSuccessAt, minutesSince };
    })
    .filter((r) => (r.minutesSince ?? 0) > CRON_STALE_HOURS * 60);

  return {
    stuckUploads: stuckUploads ?? 0,
    stuckCleanupRuns: stuckCleanupRuns ?? 0,
    loopingRetryJobs: loopingRetryJobs ?? 0,
    unresolvedDeadLetters: unresolvedDeadLetters ?? 0,
    staleCronJobs,
    generatedAt: new Date().toISOString(),
  };
}
