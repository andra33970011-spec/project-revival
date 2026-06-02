// F4.3 — Retention cleanup engine. Iterates enabled policies and prunes rows
// older than the cutoff. Writes to cron_history for observability.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Policy = {
  entity: string;
  retention_days: number;
  enabled: boolean;
};

const CLEANERS: Record<string, (cutoff: string) => Promise<number>> = {
  audit_log: async (cutoff) => deleteByColumn("audit_log", "created_at", cutoff),
  notifications: async (cutoff) => deleteByColumn("notifications", "created_at", cutoff),
  cron_history: async (cutoff) => deleteByColumn("cron_history", "started_at", cutoff),
  rate_limit_hits: async (cutoff) => deleteByColumn("rate_limit_hits", "window_start", cutoff),
  dead_letter_jobs: async (cutoff) => {
    // only delete resolved ones
    const { count, error } = await supabaseAdmin
      .from("dead_letter_jobs")
      .delete({ count: "exact" })
      .lt("failed_at", cutoff)
      .not("resolved_at", "is", null);
    if (error) throw error;
    return count ?? 0;
  },
  form_submission_files_orphan: async (cutoff) => {
    const { count, error } = await supabaseAdmin
      .from("form_submission_files")
      .delete({ count: "exact" })
      .lt("orphaned_at", cutoff)
      .not("orphaned_at", "is", null);
    if (error) throw error;
    return count ?? 0;
  },
};

async function deleteByColumn(table: string, col: string, cutoff: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)
    .delete({ count: "exact" })
    .lt(col, cutoff);
  if (error) throw error;
  return count ?? 0;
}

export async function runRetentionCleanup(): Promise<{
  ok: boolean;
  results: Array<{ entity: string; deleted: number; error?: string }>;
}> {
  const started = Date.now();
  const { data: policies } = await supabaseAdmin
    .from("retention_policies")
    .select("entity,retention_days,enabled")
    .eq("enabled", true);
  const results: Array<{ entity: string; deleted: number; error?: string }> = [];
  let totalDeleted = 0;

  for (const p of (policies ?? []) as Policy[]) {
    const fn = CLEANERS[p.entity];
    if (!fn) {
      results.push({ entity: p.entity, deleted: 0, error: "no cleaner" });
      continue;
    }
    const cutoff = new Date(Date.now() - p.retention_days * 24 * 60 * 60 * 1000).toISOString();
    try {
      const deleted = await fn(cutoff);
      totalDeleted += deleted;
      results.push({ entity: p.entity, deleted });
      await supabaseAdmin
        .from("retention_policies")
        .update({ last_run_at: new Date().toISOString(), last_deleted_count: deleted })
        .eq("entity", p.entity);
    } catch (e) {
      results.push({ entity: p.entity, deleted: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    await supabaseAdmin.from("cron_history").insert({
      job_name: "retention-cleanup",
      status: results.some((r) => r.error) ? "partial" : "ok",
      duration_ms: Date.now() - started,
      affected_rows: totalDeleted,
      finished_at: new Date().toISOString(),
      detail: { results },
    });
  } catch {
    /* ignore */
  }

  return { ok: true, results };
}
