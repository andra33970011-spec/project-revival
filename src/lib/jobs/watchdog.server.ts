// Cron watchdog. Scans cron_history for jobs that have been "running" past
// SLA, marks them as stalled in cron_history, and records a dead-letter
// entry so super admin can review. Pure server-side; safe to run from cron.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log, newCorrelationId } from "@/lib/logger";

const STALL_THRESHOLD_MIN = 30; // running > 30 min → considered stalled
const RECENT_FAIL_WINDOW_HOURS = 6;
const RECENT_FAIL_THRESHOLD = 3; // ≥3 failures in window → escalate

export type WatchdogReport = {
  stalledMarked: number;
  recentFailureJobs: string[];
  deadLetterCreated: number;
  durationMs: number;
};

export async function runCronWatchdog(): Promise<WatchdogReport> {
  const start = Date.now();
  const requestId = newCorrelationId();
  const report: WatchdogReport = {
    stalledMarked: 0,
    recentFailureJobs: [],
    deadLetterCreated: 0,
    durationMs: 0,
  };

  let historyId: string | null = null;
  try {
    const { data: ins } = await supabaseAdmin
      .from("cron_history")
      .insert({
        job_name: "cron-watchdog",
        request_id: requestId,
        status: "running",
      } as never)
      .select("id")
      .maybeSingle();
    historyId = (ins as { id?: string } | null)?.id ?? null;
  } catch {
    /* non-fatal */
  }

  const stallCutoff = new Date(
    Date.now() - STALL_THRESHOLD_MIN * 60 * 1000,
  ).toISOString();
  const failWindow = new Date(
    Date.now() - RECENT_FAIL_WINDOW_HOURS * 3600 * 1000,
  ).toISOString();

  // 1) Mark stalled runs
  try {
    const { data: stalled, error } = await supabaseAdmin
      .from("cron_history")
      .select("id,job_name,started_at,request_id")
      .eq("status", "running")
      .lt("started_at", stallCutoff)
      .limit(50);
    if (error) throw error;

    for (const row of stalled ?? []) {
      const startedAt = row.started_at ? new Date(row.started_at).getTime() : Date.now();
      await supabaseAdmin
        .from("cron_history")
        .update({
          status: "stalled",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt,
          error: `Marked stalled by watchdog after >${STALL_THRESHOLD_MIN}m`,
        } as never)
        .eq("id", row.id);

      // Also record a dead-letter entry for visibility
      await supabaseAdmin.from("dead_letter_jobs").insert({
        job_name: row.job_name,
        payload: { cron_history_id: row.id, started_at: row.started_at },
        error_message: `Stalled cron run (>${STALL_THRESHOLD_MIN}m)`,
        retry_count: 0,
        request_id: row.request_id ?? requestId,
      } as never);
      report.stalledMarked += 1;
      report.deadLetterCreated += 1;
    }
  } catch (e) {
    log.error("watchdog.stalled.fail", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 2) Surface jobs with repeated recent failures
  try {
    const { data: recentFails, error } = await supabaseAdmin
      .from("cron_history")
      .select("job_name")
      .in("status", ["error", "completed_with_errors", "stalled"])
      .gte("started_at", failWindow)
      .limit(500);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of recentFails ?? []) {
      counts.set(r.job_name, (counts.get(r.job_name) ?? 0) + 1);
    }
    report.recentFailureJobs = Array.from(counts.entries())
      .filter(([, n]) => n >= RECENT_FAIL_THRESHOLD)
      .map(([name]) => name);
  } catch (e) {
    log.error("watchdog.recentFails.fail", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  report.durationMs = Date.now() - start;
  log.info("watchdog.summary", { ...report, requestId });

  if (historyId) {
    try {
      await supabaseAdmin
        .from("cron_history")
        .update({
          finished_at: new Date().toISOString(),
          duration_ms: report.durationMs,
          status: report.stalledMarked > 0 ? "completed_with_errors" : "completed",
          affected_rows: report.stalledMarked,
          meta: report as unknown as never,
        } as never)
        .eq("id", historyId);
    } catch {
      /* non-fatal */
    }
  }
  return report;
}
