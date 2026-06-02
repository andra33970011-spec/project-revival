// Cron endpoint: scan cron_history for stalled jobs and escalate to dead-letter.
import { createFileRoute } from "@tanstack/react-router";
import { runCronWatchdog } from "@/lib/jobs/watchdog.server";

export const Route = createFileRoute("/api/public/hooks/cron-watchdog")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runCronWatchdog();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
