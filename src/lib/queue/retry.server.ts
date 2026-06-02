// Retry queue with exponential backoff + jitter + dead-letter fallback.
// Server-only — use inside createServerFn handlers or scheduled jobs.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log } from "@/lib/logger";

export type RetryStatus =
  | "pending"
  | "retrying"
  | "completed"
  | "failed"
  | "dead_letter";

export type EnqueueOptions = {
  jobName: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  delaySec?: number;
  requestId?: string;
};

export type RetryJobRow = {
  id: string;
  job_name: string;
  payload: Record<string, unknown>;
  status: RetryStatus;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  request_id: string | null;
};

const BASE_DELAY_SEC = 5;
const MAX_DELAY_SEC = 60 * 30; // cap at 30 min

/** Compute next delay seconds for an attempt (exponential + jitter). */
export function computeBackoff(attempt: number): number {
  const exp = Math.min(MAX_DELAY_SEC, BASE_DELAY_SEC * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exp * 0.2)));
  return exp + jitter;
}

/** Enqueue a job for retry processing. */
export async function enqueueRetry(opts: EnqueueOptions): Promise<string | null> {
  const next = new Date(Date.now() + (opts.delaySec ?? 0) * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("retry_queue")
    .insert({
      job_name: opts.jobName,
      payload: (opts.payload ?? {}) as never,
      max_attempts: opts.maxAttempts ?? 5,
      next_run_at: next,
      request_id: opts.requestId ?? null,
      status: "pending" as RetryStatus,
    })
    .select("id")
    .single();
  if (error) {
    log.warn("retry.enqueue.failed", { jobName: opts.jobName, error: error.message });
    return null;
  }
  return data?.id ?? null;
}

/** Claim a batch of due jobs (atomic via UPDATE..RETURNING with locking). */
export async function claimDueJobs(workerId: string, limit = 20): Promise<RetryJobRow[]> {
  const nowIso = new Date().toISOString();
  // Use simple UPDATE..WHERE with array of ids selected first.
  const { data: candidates, error: selErr } = await supabaseAdmin
    .from("retry_queue")
    .select("id")
    .in("status", ["pending", "retrying"])
    .lte("next_run_at", nowIso)
    .is("locked_at", null)
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (selErr || !candidates || candidates.length === 0) return [];

  const ids = candidates.map((c) => c.id);
  const { data, error } = await supabaseAdmin
    .from("retry_queue")
    .update({ locked_at: nowIso, locked_by: workerId, status: "retrying" })
    .in("id", ids)
    .is("locked_at", null) // race guard
    .select("id, job_name, payload, status, attempts, max_attempts, next_run_at, last_error, request_id");
  if (error) {
    log.warn("retry.claim.failed", { error: error.message });
    return [];
  }
  return (data as RetryJobRow[]) ?? [];
}

/** Mark a job successfully completed. */
export async function markCompleted(id: string): Promise<void> {
  await supabaseAdmin
    .from("retry_queue")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq("id", id);
}

/** Record a failed attempt; reschedule with backoff or move to dead-letter. */
export async function recordFailure(job: RetryJobRow, err: unknown): Promise<void> {
  const attempts = job.attempts + 1;
  const message = err instanceof Error ? err.message : String(err);

  if (attempts >= job.max_attempts) {
    // Move to dead letter
    await supabaseAdmin.from("dead_letter_jobs").insert({
      job_name: job.job_name,
      payload: job.payload as never,
      error_message: message.slice(0, 2000),
      retry_count: attempts,
      request_id: job.request_id,
    });
    await supabaseAdmin
      .from("retry_queue")
      .update({
        status: "dead_letter",
        attempts,
        last_error: message.slice(0, 2000),
        last_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
    log.warn("retry.dead_letter", { jobName: job.job_name, id: job.id, attempts });
    return;
  }

  const delay = computeBackoff(attempts);
  await supabaseAdmin
    .from("retry_queue")
    .update({
      status: "pending",
      attempts,
      last_error: message.slice(0, 2000),
      last_attempt_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + delay * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);
  log.info("retry.scheduled", { jobName: job.job_name, id: job.id, attempts, delaySec: delay });
}

/**
 * Process a batch of due jobs with a user-supplied handler.
 * Handler should be idempotent — it may be invoked more than once for the same payload.
 */
export async function processRetryBatch(
  workerId: string,
  handler: (job: RetryJobRow) => Promise<void>,
  limit = 20,
): Promise<{ processed: number; failed: number }> {
  const jobs = await claimDueJobs(workerId, limit);
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await handler(job);
      await markCompleted(job.id);
      processed++;
    } catch (err) {
      failed++;
      await recordFailure(job, err);
    }
  }
  return { processed, failed };
}

/** Replay a dead-letter job back into the retry queue. */
export async function replayDeadLetter(deadLetterId: string): Promise<string | null> {
  const { data: dl, error } = await supabaseAdmin
    .from("dead_letter_jobs")
    .select("job_name, payload, request_id")
    .eq("id", deadLetterId)
    .is("resolved_at", null)
    .single();
  if (error || !dl) return null;
  const newId = await enqueueRetry({
    jobName: dl.job_name ?? "unknown",
    payload: (dl.payload as Record<string, unknown>) ?? {},
    requestId: dl.request_id ?? undefined,
  });
  if (newId) {
    await supabaseAdmin
      .from("dead_letter_jobs")
      .update({
        resolved_at: new Date().toISOString(),
        resolution_note: `Replayed as retry_queue ${newId}`,
      })
      .eq("id", deadLetterId);
  }
  return newId;
}
