// Operational status aggregator — used by admin diagnostics dashboard.
// Combines counters from retry queue, dead letter, cleanup, and rate-limit.
// Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectStuck, type StuckReport } from "@/lib/jobs/stuck.server";

export type OpsStatus = {
  retryQueue: { pending: number; retrying: number; deadLetter: number };
  deadLetters: { unresolved: number; total: number };
  uploads: { orphanedPending: number; stuck: number };
  cron: { recentRuns: number; failuresLast24h: number; stale: StuckReport["staleCronJobs"] };
  rateLimit: { hitsLastHour: number };
  generatedAt: string;
};

export async function getOpsStatus(): Promise<OpsStatus> {
  const stuck = await detectStuck();
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [
    { count: pending },
    { count: retrying },
    { count: deadLetter },
    { count: dlUnresolved },
    { count: dlTotal },
    { count: orphanedPending },
    { count: recentRuns },
    { count: failuresLast24h },
    { count: rateHits },
  ] = await Promise.all([
    supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "retrying"),
    supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabaseAdmin.from("dead_letter_jobs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supabaseAdmin.from("dead_letter_jobs").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("form_submission_files").select("id", { count: "exact", head: true }).eq("cleanup_status", "orphaned"),
    supabaseAdmin.from("cron_history").select("id", { count: "exact", head: true }).gte("started_at", oneDayAgo),
    supabaseAdmin.from("cron_history").select("id", { count: "exact", head: true }).eq("status", "error").gte("started_at", oneDayAgo),
    supabaseAdmin.from("rate_limit_hits").select("subject", { count: "exact", head: true }).gte("last_hit_at", oneHourAgo),
  ]);

  return {
    retryQueue: {
      pending: pending ?? 0,
      retrying: retrying ?? 0,
      deadLetter: deadLetter ?? 0,
    },
    deadLetters: { unresolved: dlUnresolved ?? 0, total: dlTotal ?? 0 },
    uploads: { orphanedPending: orphanedPending ?? 0, stuck: stuck.stuckUploads },
    cron: {
      recentRuns: recentRuns ?? 0,
      failuresLast24h: failuresLast24h ?? 0,
      stale: stuck.staleCronJobs,
    },
    rateLimit: { hitsLastHour: rateHits ?? 0 },
    generatedAt: new Date().toISOString(),
  };
}
