// Phase 1 advanced ASN: jadwal kerja, shift, kepatuhan kehadiran.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

async function ctxOf(userId: string) {
  const c = await getUserContext(supabaseAdmin, userId);
  return { isSuper: c.isSuper, isAdminOpd: c.isAdminOpd, opdId: c.opdId };
}

// ===== WORK SCHEDULE =====
const scheduleSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().min(2).max(120),
  opd_id: z.string().uuid().nullable().optional(),
  hari_kerja: z.array(z.number().int().min(0).max(6)).min(1),
  jam_masuk: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  jam_pulang: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  toleransi_menit: z.number().int().min(0).max(180).default(15),
  aktif: z.boolean().default(true),
});

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => scheduleSchema.parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === data.opd_id)) throw new Error("Forbidden");
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("work_schedule").update(upd).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("work_schedule").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const listSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await ctxOf(context.userId);
    let q = supabaseAdmin.from("work_schedule")
      .select("id,nama,opd_id,hari_kerja,jam_masuk,jam_pulang,toleransi_menit,aktif,updated_at, opd:opd!opd_id(nama,singkatan)")
      .order("nama");
    if (!c.isSuper && c.opdId) q = q.or(`opd_id.is.null,opd_id.eq.${c.opdId}`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("work_schedule").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    user_id: z.string().uuid(),
    schedule_id: z.string().uuid(),
    berlaku_dari: z.string().optional(),
    berlaku_sampai: z.string().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("work_schedule_assignment").insert({
      user_id: data.user_id, schedule_id: data.schedule_id,
      berlaku_dari: data.berlaku_dari ?? new Date().toISOString().slice(0, 10),
      berlaku_sampai: data.berlaku_sampai ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== SHIFT =====
const shiftSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().min(2).max(80),
  kode: z.string().min(2).max(40),
  jam_mulai: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  jam_selesai: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  warna: z.string().max(20).optional().nullable(),
  aktif: z.boolean().default(true),
});

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => shiftSchema.parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Forbidden");
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("shift").update(upd).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("shift").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const listShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin.from("shift")
      .select("id,nama,kode,jam_mulai,jam_selesai,warna,aktif").order("jam_mulai");
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("shift").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    user_id: z.string().uuid(), shift_id: z.string().uuid(), tanggal: z.string(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("shift_assignment")
      .upsert(data, { onConflict: "user_id,tanggal" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== COMPLIANCE =====
export const myCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    from: z.string().optional(), to: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const { data: row, error } = await supabaseAdmin
      .rpc("attendance_compliance", { _user_id: context.userId, _from: from, _to: to });
    if (error) throw new Error(error.message);
    return { from, to, stats: row };
  });

export const opdAttendanceToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().optional().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const opd = c.isSuper ? data.opd_id : c.opdId;
    if (!opd) throw new Error("OPD tidak diketahui");
    const { data: row, error } = await supabaseAdmin.rpc("opd_attendance_today", { _opd_id: opd });
    if (error) throw new Error(error.message);
    return row;
  });

// Resolve schedule yang berlaku untuk user pada tanggal tertentu (server-side helper exposed for UI preview)
export const resolveMySchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tanggal: z.string().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const tgl = data.tanggal ?? new Date().toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("work_schedule_assignment")
      .select("schedule:work_schedule!schedule_id(id,nama,hari_kerja,jam_masuk,jam_pulang,toleransi_menit,aktif), berlaku_dari, berlaku_sampai")
      .eq("user_id", context.userId)
      .lte("berlaku_dari", tgl)
      .order("berlaku_dari", { ascending: false });
    const match = (rows ?? []).find((r) => !r.berlaku_sampai || r.berlaku_sampai >= tgl);
    return { tanggal: tgl, schedule: match?.schedule ?? null };
  });
