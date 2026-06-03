// Sprint B — Payroll periods lock/unlock
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listPayrollPeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ opd_id: z.string().uuid().nullable().optional(), tahun: z.number().int().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("payroll_periods")
      .select("id,opd_id,tahun,bulan,locked_at,locked_by,unlocked_at,unlocked_by,catatan,created_at, opd:opd!opd_id(nama,singkatan)")
      .order("tahun", { ascending: false }).order("bulan", { ascending: false }).limit(120);
    if (data.opd_id !== undefined) q = data.opd_id === null ? q.is("opd_id", null) : q.eq("opd_id", data.opd_id);
    if (data.tahun) q = q.eq("tahun", data.tahun);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const lockPayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      opd_id: z.string().uuid().nullable(),
      tahun: z.number().int().min(2020).max(2100),
      bulan: z.number().int().min(1).max(12),
      catatan: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: superRes } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!superRes) {
      const { data: opdRes } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin_opd" });
      const { data: myOpd } = await supabaseAdmin.rpc("get_user_opd", { _user_id: context.userId });
      if (!opdRes || myOpd !== data.opd_id) throw new Error("Forbidden");
    }
    const { error } = await supabaseAdmin.from("payroll_periods").upsert({
      opd_id: data.opd_id, tahun: data.tahun, bulan: data.bulan,
      locked_at: new Date().toISOString(), locked_by: context.userId,
      unlocked_at: null, unlocked_by: null,
      catatan: data.catatan ?? null,
    }, { onConflict: "opd_id,tahun,bulan" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "payroll.lock", entitas: "payroll_periods",
      data_sesudah: { opd_id: data.opd_id, tahun: data.tahun, bulan: data.bulan },
    });
    return { ok: true };
  });

export const unlockPayrollPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), catatan: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: superRes } = await supabaseAdmin.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!superRes) throw new Error("Hanya super admin yang dapat membuka kunci periode");
    const { error } = await supabaseAdmin.from("payroll_periods").update({
      unlocked_at: new Date().toISOString(), unlocked_by: context.userId, catatan: data.catatan ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "payroll.unlock", entitas: "payroll_periods", entitas_id: data.id,
    });
    return { ok: true };
  });
