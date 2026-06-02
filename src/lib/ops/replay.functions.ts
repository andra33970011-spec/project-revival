// F2.5 — Job replay & retry server functions. Super-admin only, audited.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueRetry } from "@/lib/queue/retry.server";
import { log, newCorrelationId } from "@/lib/logger";

async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error("RBAC check failed");
  if (data !== true) throw new Error("Forbidden");
}

async function writeAudit(actorId: string, aksi: string, entitas: string, entitasId: string, correlationId: string, meta: unknown) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: actorId,
      actor_id: actorId,
      aksi,
      entitas,
      entitas_id: entitasId,
      correlation_id: correlationId,
      data_sesudah: meta as never,
    });
  } catch (e) {
    log.warn("audit.write.fail", { error: e instanceof Error ? e.message : String(e) });
  }
}

export const replayDeadLetterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const correlationId = newCorrelationId();

    const { data: dl, error } = await supabaseAdmin
      .from("dead_letter_jobs")
      .select("id,job_name,payload,request_id,resolved_at")
      .eq("id", data.id)
      .single();
    if (error || !dl) throw new Error("Dead-letter job tidak ditemukan");
    if (dl.resolved_at) throw new Error("Job ini sudah pernah di-resolve");

    const newId = await enqueueRetry({
      jobName: dl.job_name ?? "unknown",
      payload: (dl.payload as Record<string, unknown>) ?? {},
      requestId: dl.request_id ?? correlationId,
      delaySec: 0,
    });
    if (!newId) throw new Error("Gagal memasukkan ulang ke retry queue");

    await supabaseAdmin
      .from("dead_letter_jobs")
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        replayed_to: newId,
        resolution_note: `Replayed by super_admin via dashboard`,
      })
      .eq("id", data.id);

    await writeAudit(userId, "replay", "dead_letter_jobs", data.id, correlationId, {
      replayed_to: newId,
      job_name: dl.job_name,
    });
    log.info("dlq.replay.ok", { id: data.id, newId, correlationId });
    return { ok: true, retryQueueId: newId, correlationId };
  });

export const retryFailedJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const correlationId = newCorrelationId();

    const { error } = await supabaseAdmin
      .from("retry_queue")
      .update({
        status: "pending",
        attempts: 0,
        next_run_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
      })
      .eq("id", data.id)
      .in("status", ["failed", "retrying", "pending", "dead_letter"]);
    if (error) throw new Error(error.message);

    await writeAudit(userId, "retry", "retry_queue", data.id, correlationId, null);
    log.info("retry_queue.manual_retry", { id: data.id, correlationId });
    return { ok: true, correlationId };
  });

export const listRecentRetryJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const { data, error } = await supabaseAdmin
      .from("retry_queue")
      .select("id,job_name,status,attempts,max_attempts,next_run_at,last_error,last_attempt_at")
      .order("next_run_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listTopRateLimitHits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("rate_limit_hits")
      .select("bucket,identifier,count,window_start,last_hit_at")
      .gte("last_hit_at", oneHourAgo)
      .order("count", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
