// F4.5 / F4.6 — Settings & feature-flag management (super_admin).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuper(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

export const listSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ category: z.enum(["public", "internal", "feature_flag"]).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuper((context as { userId: string }).userId);
    let q = supabaseAdmin.from("app_setting").select("key,value,public_visible,category,updated_at").order("key");
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      key: z.string().min(1).max(120),
      value: z.unknown(),
      category: z.enum(["public", "internal", "feature_flag"]).optional(),
      public_visible: z.boolean().optional(),
      reason: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuper(userId);
    const { data: existing } = await supabaseAdmin
      .from("app_setting").select("value,category,public_visible").eq("key", data.key).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {
      key: data.key,
      value: (data.value ?? {}) as object,
      updated_at: new Date().toISOString(),
    };
    if (data.category !== undefined) patch.category = data.category;
    if (data.public_visible !== undefined) patch.public_visible = data.public_visible;
    const { error } = await supabaseAdmin.from("app_setting").upsert(patch, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      aksi: "setting_upsert",
      entitas: "app_setting",
      entitas_id: data.key,
      data_sebelum: (existing ?? null) as never,
      data_sesudah: { value: data.value, category: data.category, public_visible: data.public_visible, reason: data.reason } as never,
    });
    return { ok: true };
  });
