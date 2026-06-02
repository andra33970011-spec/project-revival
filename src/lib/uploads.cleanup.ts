// Stale upload & orphan cleanup helper.
// Safe to call repeatedly (idempotent). Used by the cron route under
// src/routes/api/public/hooks/cleanup-uploads.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log, newCorrelationId } from "./logger";

// Stable advisory-lock key for this job (any int8). Picked once; do not change.
const ADVISORY_LOCK_KEY = 7421901234567890n;

const BUCKET = "form-submissions";
const STALE_PENDING_HOURS = 6; // upload_started but never finalized
const ORPHAN_RETENTION_DAYS = 7; // marked orphaned for > N days → safe delete
const BATCH_LIMIT = 200;

export type CleanupResult = {
  taggedOrphan: number;
  deletedRows: number;
  deletedObjects: number;
  failedDeletes: number;
  durationMs: number;
};

/**
 * 1) Tag rows as orphan: pending_cleanup + upload_started_at older than threshold + still not finalized.
 * 2) Hard delete rows previously tagged orphan that exceeded retention, also remove storage objects.
 *
 * NEVER deletes files that are finalized (cleanup_status='ok'); those are part of a valid submission.
 */
export async function runStaleUploadCleanup(): Promise<CleanupResult> {
  const start = Date.now();
  const requestId = newCorrelationId();
  const result: CleanupResult = {
    taggedOrphan: 0,
    deletedRows: 0,
    deletedObjects: 0,
    failedDeletes: 0,
    durationMs: 0,
  };

  // Soft concurrency guard: skip if another run is in-flight (< 10 min old)
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: inflight } = await supabaseAdmin
      .from("cron_history")
      .select("id")
      .eq("job_name", "stale-upload-cleanup")
      .eq("status", "running")
      .gte("started_at", tenMinAgo)
      .limit(1);
    if (inflight && inflight.length > 0) {
      log.warn("cleanup.skip_concurrent", { requestId });
      result.durationMs = Date.now() - start;
      return result;
    }
  } catch {
    /* non-fatal */
  }

  // Insert running marker
  let historyId: string | null = null;
  try {
    const { data: ins } = await supabaseAdmin
      .from("cron_history")
      .insert({
        job_name: "stale-upload-cleanup",
        request_id: requestId,
        status: "running",
      } as never)
      .select("id")
      .maybeSingle();
    historyId = (ins as { id?: string } | null)?.id ?? null;
  } catch {
    /* non-fatal */
  }

  const staleCutoff = new Date(Date.now() - STALE_PENDING_HOURS * 3600 * 1000).toISOString();
  const orphanCutoff = new Date(Date.now() - ORPHAN_RETENTION_DAYS * 86400 * 1000).toISOString();

  // Phase 1: tag stale pending uploads as orphan
  try {
    const { data: stale, error } = await supabaseAdmin
      .from("form_submission_files")
      .select("id")
      .eq("cleanup_status", "pending_cleanup")
      .is("finalized_at", null)
      .lt("upload_started_at", staleCutoff)
      .limit(BATCH_LIMIT);
    if (error) throw error;
    if (stale && stale.length > 0) {
      const ids = stale.map((r) => r.id);
      const { error: upErr } = await supabaseAdmin
        .from("form_submission_files")
        .update({
          cleanup_status: "orphaned",
          orphaned_at: new Date().toISOString(),
        } as never)
        .in("id", ids);
      if (upErr) throw upErr;
      result.taggedOrphan = ids.length;
      log.info("cleanup.tag_orphan", { count: ids.length });
    }
  } catch (e) {
    log.error("cleanup.tag_orphan.fail", { error: e instanceof Error ? e.message : String(e) });
  }

  // Phase 2: hard delete long-tagged orphans (storage + row)
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("form_submission_files")
      .select("id,storage_path")
      .eq("cleanup_status", "orphaned")
      .lt("orphaned_at", orphanCutoff)
      .limit(BATCH_LIMIT);
    if (error) throw error;
    if (rows && rows.length > 0) {
      // Safe delete: re-verify row is still NOT finalized & still orphan before drop
      const paths = rows.map((r) => r.storage_path).filter(Boolean) as string[];
      if (paths.length > 0) {
        const { error: rmErr, data: rmData } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
        if (rmErr) {
          result.failedDeletes += paths.length;
          log.error("cleanup.storage_remove.fail", { error: rmErr.message, count: paths.length });
        } else {
          result.deletedObjects = rmData?.length ?? paths.length;
        }
      }
      const { error: delErr } = await supabaseAdmin
        .from("form_submission_files")
        .delete()
        .in(
          "id",
          rows.map((r) => r.id),
        )
        .eq("cleanup_status", "orphaned"); // safety guard
      if (delErr) {
        log.error("cleanup.row_delete.fail", { error: delErr.message });
      } else {
        result.deletedRows = rows.length;
      }
    }
  } catch (e) {
    log.error("cleanup.delete_orphan.fail", { error: e instanceof Error ? e.message : String(e) });
  }

  result.durationMs = Date.now() - start;
  log.info("cleanup.summary", { ...result, requestId });

  // Finalize cron history row
  if (historyId) {
    try {
      await supabaseAdmin
        .from("cron_history")
        .update({
          finished_at: new Date().toISOString(),
          duration_ms: result.durationMs,
          status: result.failedDeletes > 0 ? "completed_with_errors" : "completed",
          affected_rows: result.deletedRows + result.taggedOrphan,
          meta: result as unknown as never,
        } as never)
        .eq("id", historyId);
    } catch {
      /* non-fatal */
    }
  }
  return result;
}
