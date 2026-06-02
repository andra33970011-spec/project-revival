// Cron endpoint: verify finalized upload rows still have storage objects.
// Tag missing rows as orphan so standard cleanup pipeline removes them.
import { createFileRoute } from "@tanstack/react-router";
import { runUploadIntegrityScan } from "@/lib/uploads/integrity.server";

export const Route = createFileRoute("/api/public/hooks/upload-integrity")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runUploadIntegrityScan();
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
