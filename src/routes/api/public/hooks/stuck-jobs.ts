// Public cron endpoint: scan for stuck operations and report.
import { createFileRoute } from "@tanstack/react-router";
import { detectStuck } from "@/lib/jobs/stuck.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { newCorrelationId } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/stuck-jobs")({
  server: {
    handlers: {
      POST: async () => {
        const requestId = newCorrelationId();
        const startedAt = Date.now();
        let historyId: string | null = null;
        try {
          const { data } = await supabaseAdmin
            .from("cron_history")
            .insert({ job_name: "stuck-jobs", request_id: requestId, status: "running" } as never)
            .select("id")
            .maybeSingle();
          historyId = (data as { id?: string } | null)?.id ?? null;
        } catch { /* non-fatal */ }

        try {
          const report = await detectStuck();
          const hasIssue =
            report.stuckUploads > 0 ||
            report.stuckCleanupRuns > 0 ||
            report.loopingRetryJobs > 0 ||
            report.unresolvedDeadLetters > 0 ||
            report.staleCronJobs.length > 0;

          if (historyId) {
            await supabaseAdmin.from("cron_history").update({
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - startedAt,
              status: hasIssue ? "completed_with_errors" : "success",
              meta: report as unknown as never,
            } as never).eq("id", historyId);
          }
          return new Response(JSON.stringify({ ok: true, requestId, report }), {
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
