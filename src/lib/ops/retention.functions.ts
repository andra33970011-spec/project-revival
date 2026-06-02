// F4.3 — Retention policy server fns.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runRetentionCleanup } from "./retention.server";

async function assertSuper(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

export const listRetentionPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper((context as { userId: string }).userId);
    const { data, error } = await supabaseAdmin
      .from("retention_policies")
      .select("*")
      .order("entity");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      entity: z.string().min(1).max(80),
      retention_days: z.number().int().min(1).max(3650).optional(),
      enabled: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertSuper(userId);
    const patch = {
      updated_at: new Date().toISOString(),
      updated_by: userId,
      ...(data.retention_days !== undefined ? { retention_days: data.retention_days } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
    };
    const { error } = await supabaseAdmin.from("retention_policies").update(patch).eq("entity", data.entity);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runRetentionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuper((context as { userId: string }).userId);
    return runRetentionCleanup();
  });
