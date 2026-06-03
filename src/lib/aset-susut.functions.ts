// Sprint C — Penyusutan bulanan (garis lurus)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

const periodeSchema = z.string().regex(/^\d{4}-\d{2}$/, "Format periode harus YYYY-MM");

export const runSusutBulanan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ periode: periodeSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    if (!c.isSuper) throw new Error("Hanya super admin yang dapat menjalankan");
    const { data: res, error } = await supabaseAdmin.rpc("fn_susut_bulanan_run", { _periode: data.periode });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "aset.susut_run", entitas: "aset_penyusutan_history",
      entitas_id: data.periode, data_sesudah: res as never,
    });
    return res;
  });

export const listSusutHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    aset_id: z.string().uuid().optional(),
    periode: periodeSchema.optional(),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    let q = supabaseAdmin.from("aset_penyusutan_history")
      .select("id,aset_id,periode,susut_bulan,akumulasi,nilai_buku,created_at, aset:aset!aset_id(kode,nama,opd_id,pemegang_user_id)")
      .order("created_at", { ascending: false }).limit(data.limit);
    if (data.aset_id) q = q.eq("aset_id", data.aset_id);
    if (data.periode) q = q.eq("periode", data.periode);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Filter sesuai akses
    const filtered = (rows ?? []).filter((r) => {
      if (c.isSuper) return true;
      const a = (r as { aset: { opd_id: string | null; pemegang_user_id: string | null } | null }).aset;
      if (!a) return false;
      if (c.isAdminOpd && a.opd_id === c.opdId) return true;
      return a.pemegang_user_id === context.userId;
    });
    return { rows: filtered };
  });
