// F2.9 — Internal metrics aggregator. Server-only, no PII.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type InternalMetrics = {
  generatedAt: string;
  uploads: { total: number; orphaned: number; finalized: number };
  notifications: { last24h: number; unread: number };
  retry: { pending: number; retrying: number; failed: number; deadLetter: number };
  deadLetters: { unresolved: number; total: number };
  cron: { runs24h: number; failures24h: number };
  rateLimit: { hitsLastHour: number };
};

export async function getInternalMetrics(): Promise<InternalMetrics> {
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const c = (q: PromiseLike<{ count: number | null }>) => q;
  const [
    { count: uploadsTotal },
    { count: uploadsOrphaned },
    { count: uploadsFinalized },
    { count: notifLast24 },
    { count: notifUnread },
    { count: retryPending },
    { count: retryRetrying },
    { count: retryFailed },
    { count: retryDead },
    { count: dlUnresolved },
    { count: dlTotal },
    { count: cronRuns },
    { count: cronFails },
    { count: rateHits },
  ] = await Promise.all([
    c(supabaseAdmin.from("form_submission_files").select("id", { count: "exact", head: true })),
    c(supabaseAdmin.from("form_submission_files").select("id", { count: "exact", head: true }).eq("cleanup_status", "orphaned")),
    c(supabaseAdmin.from("form_submission_files").select("id", { count: "exact", head: true }).not("finalized_at", "is", null)),
    c(supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo)),
    c(supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)),
    c(supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "pending")),
    c(supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "retrying")),
    c(supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "failed")),
    c(supabaseAdmin.from("retry_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter")),
    c(supabaseAdmin.from("dead_letter_jobs").select("id", { count: "exact", head: true }).is("resolved_at", null)),
    c(supabaseAdmin.from("dead_letter_jobs").select("id", { count: "exact", head: true })),
    c(supabaseAdmin.from("cron_history").select("id", { count: "exact", head: true }).gte("started_at", oneDayAgo)),
    c(supabaseAdmin.from("cron_history").select("id", { count: "exact", head: true }).eq("status", "error").gte("started_at", oneDayAgo)),
    c(supabaseAdmin.from("rate_limit_hits").select("subject", { count: "exact", head: true }).gte("last_hit_at", oneHourAgo)),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    uploads: { total: uploadsTotal ?? 0, orphaned: uploadsOrphaned ?? 0, finalized: uploadsFinalized ?? 0 },
    notifications: { last24h: notifLast24 ?? 0, unread: notifUnread ?? 0 },
    retry: {
      pending: retryPending ?? 0,
      retrying: retryRetrying ?? 0,
      failed: retryFailed ?? 0,
      deadLetter: retryDead ?? 0,
    },
    deadLetters: { unresolved: dlUnresolved ?? 0, total: dlTotal ?? 0 },
    cron: { runs24h: cronRuns ?? 0, failures24h: cronFails ?? 0 },
    rateLimit: { hitsLastHour: rateHits ?? 0 },
  };
}

/** Prometheus text-format rendering. */
export function renderProm(m: InternalMetrics): string {
  const lines: string[] = [];
  const g = (name: string, value: number, help?: string) => {
    if (help) lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  };
  g("narman_uploads_total", m.uploads.total);
  g("narman_uploads_orphaned", m.uploads.orphaned);
  g("narman_uploads_finalized", m.uploads.finalized);
  g("narman_notifications_24h", m.notifications.last24h);
  g("narman_notifications_unread", m.notifications.unread);
  g("narman_retry_pending", m.retry.pending);
  g("narman_retry_retrying", m.retry.retrying);
  g("narman_retry_failed", m.retry.failed);
  g("narman_retry_dead_letter", m.retry.deadLetter);
  g("narman_dlq_unresolved", m.deadLetters.unresolved);
  g("narman_dlq_total", m.deadLetters.total);
  g("narman_cron_runs_24h", m.cron.runs24h);
  g("narman_cron_failures_24h", m.cron.failures24h);
  g("narman_rate_limit_hits_1h", m.rateLimit.hitsLastHour);
  return lines.join("\n") + "\n";
}
