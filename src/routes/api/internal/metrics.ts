// F2.9 — Internal metrics endpoint. Super-admin protected via bearer JWT.
// Accepts Accept: text/plain for Prometheus, defaults to JSON.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getInternalMetrics, renderProm } from "@/lib/ops/metrics.server";
import { checkRateLimit } from "@/integrations/supabase/rate-limit.server";

export const Route = createFileRoute("/api/internal/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authz = request.headers.get("authorization") ?? "";
        const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const url = process.env.SUPABASE_URL!;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const userClient = createClient(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: userData, error: userErr } = await userClient.auth.getUser();
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });

        const userId = userData.user.id;
        const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
          _user_id: userId,
          _role: "super_admin",
        });
        if (isAdmin !== true) return new Response("Forbidden", { status: 403 });

        const rl = await checkRateLimit(userId, "metrics.read", 30, 60);
        if (!rl.ok) return new Response("Too Many Requests", { status: 429 });

        const metrics = await getInternalMetrics();
        const accept = request.headers.get("accept") ?? "";
        if (accept.includes("text/plain")) {
          return new Response(renderProm(metrics), {
            status: 200,
            headers: { "content-type": "text/plain; version=0.0.4" },
          });
        }
        return new Response(JSON.stringify(metrics), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
