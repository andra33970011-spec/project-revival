// Sprint B — Overtime (SPL/lembur)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const requestOvertime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      jam_mulai: time, jam_selesai: time,
      alasan: z.string().min(10).max(1000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: prof } = await supabaseAdmin.from("profiles").select("opd_id").eq("id", context.userId).maybeSingle();
    const { data: row, error } = await supabaseAdmin.from("overtime_requests").insert({
      user_id: context.userId, opd_id: prof?.opd_id ?? null,
      tanggal: data.tanggal, jam_mulai: data.jam_mulai, jam_selesai: data.jam_selesai,
      alasan: data.alasan,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listOvertime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ scope: z.enum(["self","admin"]).default("self") }).parse(i))
  .handler(async ({ data, context }) => {
    let q = supabaseAdmin.from("overtime_requests")
      .select("id,user_id,opd_id,tanggal,jam_mulai,jam_selesai,alasan,status,catatan_approval,created_at, profile:profiles!user_id(nama_lengkap)")
      .order("created_at", { ascending: false }).limit(200);
    if (data.scope === "self") q = q.eq("user_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const decideOvertime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved","rejected"]),
      catatan: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("overtime_requests").update({
      status: data.decision, approver_id: context.userId,
      approved_at: new Date().toISOString(), catatan_approval: data.catatan ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "overtime.decide", entitas: "overtime_requests",
      entitas_id: data.id, data_sesudah: { decision: data.decision },
    });
    return { ok: true };
  });
