// Sprint B — Attendance Shifts master + assignment
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Format jam HH:MM");

export const listShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("attendance_shifts")
      .select("id,opd_id,nama,jam_masuk,jam_pulang,toleransi_menit,jenis,aktif,created_at")
      .order("created_at", { ascending: false }).limit(200);
    if (data.opd_id) q = q.eq("opd_id", data.opd_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      opd_id: z.string().uuid().nullable().optional(),
      nama: z.string().min(2).max(120),
      jam_masuk: timeStr,
      jam_pulang: timeStr,
      toleransi_menit: z.number().int().min(0).max(120).default(15),
      jenis: z.enum(["pagi","malam","khusus"]).default("pagi"),
      aktif: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { error } = data.id
      ? await supabaseAdmin.from("attendance_shifts").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("attendance_shifts").insert(payload);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: data.id ? "shift.update" : "shift.create",
      entitas: "attendance_shifts", entitas_id: data.id ?? null, data_sesudah: payload,
    });
    return { ok: true };
  });

export const assignShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      shift_id: z.string().uuid(),
      dari: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sampai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("attendance_shift_assignment").insert({
      user_id: data.user_id, shift_id: data.shift_id,
      dari: data.dari, sampai: data.sampai ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "shift.assign", entitas: "attendance_shift_assignment",
      data_sesudah: { user_id: data.user_id, shift_id: data.shift_id, dari: data.dari, sampai: data.sampai },
    });
    return { ok: true };
  });

export const listAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("attendance_shift_assignment")
      .select("id,user_id,shift_id,dari,sampai,aktif,created_at, shift:attendance_shifts!shift_id(nama,jam_masuk,jam_pulang)")
      .order("dari", { ascending: false }).limit(300);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
