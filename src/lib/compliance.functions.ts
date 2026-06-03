// Sprint E: Consent log + Compliance checklist server fns (additive).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuper(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

// ===== Consent =====
export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      consent_type: z.string().min(1).max(60),
      version: z.string().max(20).default("v1"),
      granted: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const { error } = await supabaseAdmin.from("consent_log").insert({
      user_id: userId,
      consent_type: data.consent_type,
      version: data.version,
      granted: data.granted,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyConsents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as { userId: string }).userId;
    const { data, error } = await supabaseAdmin
      .from("consent_log").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ===== Checklist =====
export const listChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("compliance_checklist").select("*").order("domain").order("kode");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["todo", "in_progress", "done", "na"]).optional(),
      bukti_url: z.string().url().max(500).optional().nullable(),
      catatan: z.string().max(2000).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    await assertSuper(userId);
    const patch = {
      updated_by: userId,
      updated_at: new Date().toISOString(),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.bukti_url !== undefined ? { bukti_url: data.bukti_url } : {}),
      ...(data.catatan !== undefined ? { catatan: data.catatan } : {}),
    };
    const { error } = await supabaseAdmin.from("compliance_checklist").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const complianceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("compliance_checklist").select("domain, status");
    if (error) throw new Error(error.message);
    const sum: Record<string, { total: number; done: number; in_progress: number; todo: number; na: number }> = {};
    for (const r of data ?? []) {
      const d = r.domain as string;
      if (!sum[d]) sum[d] = { total: 0, done: 0, in_progress: 0, todo: 0, na: 0 };
      sum[d].total++;
      sum[d][r.status as "done" | "in_progress" | "todo" | "na"]++;
    }
    return sum;
  });
