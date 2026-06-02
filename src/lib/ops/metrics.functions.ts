// Server function wrapper to expose metrics to the admin dashboard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getInternalMetrics } from "./metrics.server";

export const getInternalMetricsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (error || data !== true) throw new Error("Forbidden");
    return getInternalMetrics();
  });
