// Admin-only server function exposing operational diagnostics.
// Wraps getOpsStatus() with a super_admin RBAC guard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOpsStatus } from "@/lib/ops/status.server";

async function assertSuperAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error("RBAC check failed");
  if (data !== true) throw new Error("Forbidden");
}

export const getOpsStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    return getOpsStatus();
  });

export const getRecentCronHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const { data, error } = await supabaseAdmin
      .from("cron_history")
      .select("id,job_name,status,started_at,finished_at,duration_ms,affected_rows,error")
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getDeadLetterJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertSuperAdmin(userId);
    const { data, error } = await supabaseAdmin
      .from("dead_letter_jobs")
      .select("id,job_name,error_message,retry_count,failed_at,resolved_at")
      .is("resolved_at", null)
      .order("failed_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
