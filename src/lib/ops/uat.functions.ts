// F5.1 — UAT scenarios + results.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuper(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

export const listUatScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper((context as { userId: string }).userId);
    const [{ data: scenarios }, { data: latest }] = await Promise.all([
      supabaseAdmin.from("uat_scenarios").select("*").eq("enabled", true).order("role").order("modul"),
      supabaseAdmin.from("uat_results").select("scenario_id,status,catatan,run_at,run_by").order("run_at", { ascending: false }).limit(1000),
    ]);
    const lastByScenario = new Map<string, { status: string; catatan: string | null; run_at: string }>();
    for (const r of latest ?? []) {
      if (!lastByScenario.has(r.scenario_id as string)) {
        lastByScenario.set(r.scenario_id as string, {
          status: r.status as string,
          catatan: r.catatan as string | null,
          run_at: r.run_at as string,
        });
      }
    }
    return (scenarios ?? []).map((s) => ({ ...s, last: lastByScenario.get(s.id) ?? null }));
  });

export const recordUatResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      scenario_id: z.string().uuid(),
      status: z.enum(["pass", "partial", "fail"]),
      catatan: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuper(userId);
    const { error } = await supabaseAdmin.from("uat_results").insert({
      scenario_id: data.scenario_id,
      status: data.status,
      catatan: data.catatan ?? null,
      run_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
