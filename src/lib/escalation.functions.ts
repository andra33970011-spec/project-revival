// Sprint A — Escalation config
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function isSuper(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  return data === true;
}

export const listEscalationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("escalation_config")
      .select("id,opd_id,level,threshold_days,target_role,aktif")
      .order("level", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const upsertEscalationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      opd_id: z.string().uuid().nullable().optional(),
      level: z.number().int().min(1).max(3),
      threshold_days: z.number().int().min(1).max(365),
      target_role: z.string().min(1).max(40),
      aktif: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isSuper(context.userId))) throw new Error("Forbidden");
    if (data.id) {
      const { error } = await supabaseAdmin.from("escalation_config").update({
        threshold_days: data.threshold_days, target_role: data.target_role, aktif: data.aktif,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("escalation_config").insert({
        opd_id: data.opd_id ?? null, level: data.level,
        threshold_days: data.threshold_days, target_role: data.target_role, aktif: data.aktif,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
