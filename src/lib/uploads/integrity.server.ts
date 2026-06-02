// Upload integrity validator. Reconciles DB rows in form_submission_files
// against actual objects in the form-submissions bucket. Read-mostly: tags
// missing storage objects as orphan; never deletes finalized submission files.
// Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log, newCorrelationId } from "@/lib/logger";

const BUCKET = "form-submissions";
const BATCH_LIMIT = 200;

export type IntegrityReport = {
  scanned: number;
  missingObjects: number;
  taggedOrphan: number;
  durationMs: number;
};

/**
 * Verify that finalized DB rows still have a corresponding storage object.
 * For rows whose storage object is missing, tag the row as 'orphaned' so the
 * standard cleanup pipeline can take it from there. Never touches storage.
 */
export async function runUploadIntegrityScan(): Promise<IntegrityReport> {
  const start = Date.now();
  const requestId = newCorrelationId();
  const report: IntegrityReport = {
    scanned: 0,
    missingObjects: 0,
    taggedOrphan: 0,
    durationMs: 0,
  };

  // Track this run in cron_history
  let historyId: string | null = null;
  try {
    const { data: ins } = await supabaseAdmin
      .from("cron_history")
      .insert({
        job_name: "upload-integrity-scan",
        request_id: requestId,
        status: "running",
      } as never)
      .select("id")
      .maybeSingle();
    historyId = (ins as { id?: string } | null)?.id ?? null;
  } catch {
    /* non-fatal */
  }

  try {
    // Sample finalized rows; chronological scan keeps memory bounded.
    const { data: rows, error } = await supabaseAdmin
      .from("form_submission_files")
      .select("id,storage_path")
      .eq("cleanup_status", "ok")
      .not("finalized_at", "is", null)
      .order("finalized_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (error) throw error;

    report.scanned = rows?.length ?? 0;
    const missing: string[] = [];

    for (const r of rows ?? []) {
      if (!r.storage_path) continue;
      // Try a HEAD-ish probe via createSignedUrl (cheap; no body download)
      const { error: signErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(r.storage_path, 30);
      if (signErr) {
        missing.push(r.id);
      }
    }

    report.missingObjects = missing.length;

    if (missing.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("form_submission_files")
        .update({
          cleanup_status: "orphaned",
          orphaned_at: new Date().toISOString(),
        } as never)
        .in("id", missing);
      if (!upErr) report.taggedOrphan = missing.length;
      else log.error("integrity.tag_orphan.fail", { error: upErr.message });
    }
  } catch (e) {
    log.error("integrity.scan.fail", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  report.durationMs = Date.now() - start;
  log.info("integrity.summary", { ...report, requestId });

  if (historyId) {
    try {
      await supabaseAdmin
        .from("cron_history")
        .update({
          finished_at: new Date().toISOString(),
          duration_ms: report.durationMs,
          status: report.missingObjects > 0 ? "completed_with_errors" : "completed",
          affected_rows: report.taggedOrphan,
          meta: report as unknown as never,
        } as never)
        .eq("id", historyId);
    } catch {
      /* non-fatal */
    }
  }

  return report;
}
