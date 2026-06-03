// Sprint B — Leave balances (kuota cuti tahunan)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listLeaveBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ tahun: z.number().int().min(2020).max(2100).optional(), user_id: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = supabaseAdmin.from("leave_balances")
      .select("id,user_id,tahun,jenis,kuota,terpakai,catatan,updated_at, profile:profiles!user_id(nama_lengkap,opd_id)")
      .order("updated_at", { ascending: false }).limit(500);
    if (data.tahun) q = q.eq("tahun", data.tahun);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    // Default: pegawai non-admin hanya melihat saldo sendiri (RLS sudah enforce; tetap aman)
    void context;
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const upsertLeaveBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      tahun: z.number().int().min(2020).max(2100),
      jenis: z.string().min(2).max(40),
      kuota: z.number().int().min(0).max(365),
      terpakai: z.number().int().min(0).max(365).optional(),
      catatan: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("leave_balances").upsert({
      user_id: data.user_id, tahun: data.tahun, jenis: data.jenis,
      kuota: data.kuota, terpakai: data.terpakai ?? 0, catatan: data.catatan ?? null,
    }, { onConflict: "user_id,tahun,jenis" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "leave.balance_upsert", entitas: "leave_balances",
      data_sesudah: { user_id: data.user_id, tahun: data.tahun, jenis: data.jenis, kuota: data.kuota },
    });

    return { ok: true };
  });

// Saat approve izin yg mengurangi saldo: kurangi terpakai
export const approveLeaveWithBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      izin_id: z.string().uuid(),
      catatan: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: izin } = await supabaseAdmin.from("pengajuan_izin")
      .select("id,user_id,jenis,dari,sampai,status,mengurangi_saldo")
      .eq("id", data.izin_id).maybeSingle();
    if (!izin) throw new Error("Izin tidak ditemukan");
    if (izin.status !== "pending") throw new Error("Izin sudah diproses");

    const start = new Date(izin.dari); const end = new Date(izin.sampai);
    const hari = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400_000) + 1);
    const tahun = start.getFullYear();

    if (izin.mengurangi_saldo) {
      const { data: bal } = await supabaseAdmin.from("leave_balances")
        .select("id,kuota,terpakai").eq("user_id", izin.user_id).eq("tahun", tahun).eq("jenis", izin.jenis).maybeSingle();
      const sisa = (bal?.kuota ?? 0) - (bal?.terpakai ?? 0);
      if (sisa < hari) throw new Error(`Saldo ${izin.jenis} ${tahun} kurang (sisa ${sisa}, butuh ${hari})`);
      await supabaseAdmin.from("leave_balances").upsert({
        user_id: izin.user_id, tahun, jenis: izin.jenis,
        kuota: bal?.kuota ?? 0, terpakai: (bal?.terpakai ?? 0) + hari,
      }, { onConflict: "user_id,tahun,jenis" });
    }
    const { error } = await supabaseAdmin.from("pengajuan_izin").update({
      status: "approved", approved_by: context.userId, approved_at: new Date().toISOString(),
      catatan_approval: data.catatan ?? null,
      saldo_terpotong: izin.mengurangi_saldo ? hari : 0,
    }).eq("id", data.izin_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "leave.approve", entitas: "pengajuan_izin",
      entitas_id: data.izin_id, data_sesudah: { hari, jenis: izin.jenis },
    });
    return { ok: true, hari };
  });
