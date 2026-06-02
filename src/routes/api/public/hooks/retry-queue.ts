// Public cron endpoint: process due retry_queue jobs.
import { createFileRoute } from "@tanstack/react-router";
import { processRetryBatch } from "@/lib/queue/retry.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { log, newCorrelationId } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/retry-queue")({
  server: {
    handlers: {
      POST: async () => {
        const requestId = newCorrelationId();
        const startedAt = Date.now();
        let historyId: string | null = null;
        try {
          const { data } = await supabaseAdmin
            .from("cron_history")
            .insert({ job_name: "retry-queue", request_id: requestId, status: "running" } as never)
            .select("id")
            .maybeSingle();
          historyId = (data as { id?: string } | null)?.id ?? null;
        } catch { /* non-fatal */ }

        try {
          // No-op handler by default: handlers should be registered per job_name.
          // For now we surface the claim/fail mechanics without doing payload work.
          const result = await processRetryBatch(`worker-${requestId.slice(0, 8)}`, async (job) => {
            log.info("retry.handler.noop", { jobName: job.job_name, id: job.id, requestId });
          });
          if (historyId) {
            await supabaseAdmin.from("cron_history").update({
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              status: result.failed > 0 ? "completed_with_errors" : "success",
              affected_rows: result.processed,
              meta: result as never,
            } as never).eq("id", historyId);
          }
          return new Response(JSON.stringify({ ok: true, requestId, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (historyId) {
            await supabaseAdmin.from("cron_history").update({
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              status: "error",
              error: message,
            } as never).eq("id", historyId);
          }
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
