// Pengajuan izin/cuti/sakit/dinas/wfh + hari libur.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

const JENIS = ["cuti_tahunan", "cuti_sakit", "dinas_luar", "wfh", "lainnya"] as const;
const STATUS = ["pending", "approved", "rejected", "dibatalkan"] as const;

async function ctxOf(userId: string) {
  const c = await getUserContext(supabaseAdmin, userId);
  return { isSuper: c.isSuper, isAdminOpd: c.isAdminOpd, isAsn: c.isAsn, opdId: c.opdId };
}

// ===== IZIN =====
export const createIzin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    jenis: z.enum(JENIS),
    dari: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sampai: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    alasan: z.string().min(5).max(2000),
    lampiran_url: z.string().url().max(500).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isAsn) throw new Error("Hanya ASN yang dapat mengajukan izin");
    if (data.sampai < data.dari) throw new Error("Tanggal selesai harus >= tanggal mulai");
    const { data: row, error } = await supabaseAdmin.from("pengajuan_izin").insert({
      user_id: context.userId,
      opd_id: c.opdId,
      jenis: data.jenis,
      dari: data.dari,
      sampai: data.sampai,
      alasan: data.alasan,
      lampiran_url: data.lampiran_url ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const listIzinSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin.from("pengajuan_izin")
      .select("id,jenis,dari,sampai,alasan,lampiran_url,status,catatan_approval,approved_at,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const listIzinAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    status: z.enum(STATUS).optional(),
    opd_id: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    let q = supabaseAdmin.from("pengajuan_izin")
      .select("id,user_id,opd_id,jenis,dari,sampai,alasan,lampiran_url,status,catatan_approval,created_at")
      .order("created_at", { ascending: false }).limit(300);
    if (data.status) q = q.eq("status", data.status);
    const filterOpd = c.isSuper ? data.opd_id : c.opdId;
    if (filterOpd) q = q.eq("opd_id", filterOpd);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    // Enrich profile + opd
    const userIds = [...new Set(list.map((r) => r.user_id))];
    const opdIds = [...new Set(list.map((r) => r.opd_id).filter((x): x is string => !!x))];
    const [{ data: profs }, { data: opds }] = await Promise.all([
      userIds.length
        ? supabaseAdmin.from("profiles").select("id,nama_lengkap,nip").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; nama_lengkap: string | null; nip: string | null }[] }),
      opdIds.length
        ? supabaseAdmin.from("opd").select("id,nama,singkatan").in("id", opdIds)
        : Promise.resolve({ data: [] as { id: string; nama: string; singkatan: string }[] }),
    ]);
    const profMap = new Map((profs ?? []).map((p) => [p.id, { nama_lengkap: p.nama_lengkap, nip: p.nip }]));
    const opdMap = new Map((opds ?? []).map((o) => [o.id, { nama: o.nama, singkatan: o.singkatan }]));
    return { rows: list.map((r) => ({ ...r, profile: profMap.get(r.user_id) ?? null, opd: r.opd_id ? opdMap.get(r.opd_id) ?? null : null })) };

  });

export const decideIzin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    catatan: z.string().max(1000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    // Cek scope
    const { data: row } = await supabaseAdmin.from("pengajuan_izin").select("opd_id,status").eq("id", data.id).single();
    if (!row) throw new Error("Izin tidak ditemukan");
    if (row.status !== "pending") throw new Error("Izin sudah diputuskan");
    if (!c.isSuper && row.opd_id !== c.opdId) throw new Error("Bukan OPD Anda");
    if (data.status === "rejected" && !data.catatan) throw new Error("Wajib mengisi catatan saat menolak");
    const { error } = await supabaseAdmin.from("pengajuan_izin")
      .update({
        status: data.status,
        catatan_approval: data.catatan ?? null,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelIzin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin.from("pengajuan_izin")
      .select("user_id,status").eq("id", data.id).single();
    if (!row || row.user_id !== context.userId) throw new Error("Forbidden");
    if (row.status !== "pending") throw new Error("Hanya izin pending yang bisa dibatalkan");
    const { error } = await supabaseAdmin.from("pengajuan_izin")
      .update({ status: "dibatalkan" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== HARI LIBUR =====
export const listHariLibur = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    year: z.number().int().min(2020).max(2100).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const year = data.year ?? new Date().getFullYear();
    const { data: rows, error } = await supabaseAdmin.from("hari_libur")
      .select("tanggal,nama,nasional,catatan")
      .gte("tanggal", `${year}-01-01`).lte("tanggal", `${year}-12-31`)
      .order("tanggal");
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const upsertHariLibur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nama: z.string().min(2).max(120),
    nasional: z.boolean().default(true),
    catatan: z.string().max(500).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Hanya super admin");
    const { error } = await supabaseAdmin.from("hari_libur")
      .upsert(data, { onConflict: "tanggal" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteHariLibur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Hanya super admin");
    const { error } = await supabaseAdmin.from("hari_libur").delete().eq("tanggal", data.tanggal);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== REKAP BULANAN =====
export const rekapAbsensiBulanan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    user_id: z.string().uuid().optional(),
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const target = data.user_id ?? context.userId;
    if (target !== context.userId) {
      const c = await ctxOf(context.userId);
      if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    }
    const { data: row, error } = await supabaseAdmin.rpc("attendance_rekap_bulanan", {
      _user_id: target, _year: data.year, _month: data.month,
    });
    if (error) throw new Error(error.message);
    return { rekap: row };
  });

// ===== DEVICE ALERT (super admin) =====
export const attendanceDeviceAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ days: z.number().int().min(1).max(90).default(7) }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Hanya super admin");
    const { data: rows, error } = await supabaseAdmin
      .rpc("attendance_device_alert", { _days: data.days });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
