// Sprint A — SLA Pause/Resume + timeline
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function isSuper(userId: string) {
  const { data } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  return data === true;
}

export const getSlaTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ permohonan_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("submission_sla_events")
      .select("id,event_type,started_at,ended_at,duration_seconds,reason,actor")
      .eq("permohonan_id", data.permohonan_id)
      .order("started_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: eff } = await supabase.rpc("fn_permohonan_effective_sla_seconds", { _id: data.permohonan_id });
    return { events: rows ?? [], effective_seconds: (eff as number | null) ?? 0 };
  });

export const forcePauseSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ permohonan_id: z.string().uuid(), reason: z.string().max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isSuper(context.userId))) throw new Error("Forbidden");
    await supabaseAdmin.from("permohonan").update({ sla_paused_at: new Date().toISOString() }).eq("id", data.permohonan_id);
    await supabaseAdmin.from("submission_sla_events").insert({
      permohonan_id: data.permohonan_id, event_type: "pause", reason: data.reason, actor: context.userId,
    });
    return { ok: true };
  });

export const forceResumeSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ permohonan_id: z.string().uuid(), reason: z.string().max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isSuper(context.userId))) throw new Error("Forbidden");
    const { data: p } = await supabaseAdmin.from("permohonan").select("sla_paused_at,sla_total_pause_seconds").eq("id", data.permohonan_id).maybeSingle();
    if (!p?.sla_paused_at) throw new Error("SLA tidak sedang pause");
    const dur = Math.max(0, Math.floor((Date.now() - new Date(p.sla_paused_at).getTime()) / 1000));
    await supabaseAdmin.from("permohonan").update({
      sla_paused_at: null,
      sla_total_pause_seconds: (p.sla_total_pause_seconds ?? 0) + dur,
    }).eq("id", data.permohonan_id);
    await supabaseAdmin.from("submission_sla_events")
      .update({ ended_at: new Date().toISOString(), duration_seconds: dur })
      .eq("permohonan_id", data.permohonan_id).eq("event_type", "pause").is("ended_at", null);
    await supabaseAdmin.from("submission_sla_events").insert({
      permohonan_id: data.permohonan_id, event_type: "resume", duration_seconds: dur, reason: data.reason, actor: context.userId,
    });
    return { ok: true, duration_seconds: dur };
  });
