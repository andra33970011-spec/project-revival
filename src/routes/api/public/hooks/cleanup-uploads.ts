// Public cron endpoint to run stale upload cleanup.
// Schedule via pg_cron calling this URL with the apikey header.
import { createFileRoute } from "@tanstack/react-router";
import { runStaleUploadCleanup } from "@/lib/uploads.cleanup";

export const Route = createFileRoute("/api/public/hooks/cleanup-uploads")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runStaleUploadCleanup();
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
