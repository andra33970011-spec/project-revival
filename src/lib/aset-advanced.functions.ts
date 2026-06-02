// Phase 1 advanced Aset: lifecycle, verification campaign, compliance.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

async function ctxOf(userId: string) {
  const c = await getUserContext(supabaseAdmin, userId);
  return { isSuper: c.isSuper, isAdminOpd: c.isAdminOpd, isAsn: c.isAsn, opdId: c.opdId };
}

const LIFECYCLE = ["pengadaan", "gudang", "aktif", "dipinjam", "mutasi", "maintenance", "rusak", "hilang", "dihapuskan"] as const;

export const setAsetLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    aset_id: z.string().uuid(),
    lifecycle_status: z.enum(LIFECYCLE),
    catatan: z.string().max(500).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: a } = await supabaseAdmin.from("aset").select("opd_id,lifecycle_status").eq("id", data.aset_id).maybeSingle();
    if (!a) throw new Error("Aset tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === a.opd_id)) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("aset").update({ lifecycle_status: data.lifecycle_status }).eq("id", data.aset_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("aset_riwayat").insert({
      aset_id: data.aset_id, oleh: context.userId, aksi: "ubah_status",
      catatan: data.catatan ?? null,
      data: { dari: a.lifecycle_status, ke: data.lifecycle_status } as never,
    });
    return { ok: true };
  });

// ===== VERIFICATION CAMPAIGN =====
const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().min(2).max(160),
  deskripsi: z.string().max(1000).optional().nullable(),
  periode_mulai: z.string(),
  periode_selesai: z.string(),
  target_opd_ids: z.array(z.string().uuid()).default([]),
  status: z.enum(["aktif", "selesai", "dibatalkan"]).default("aktif"),
});

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => campaignSchema.parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Forbidden");
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("aset_verification_campaign").update(upd).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("aset_verification_campaign")
      .insert({ ...data, created_by: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);

    // Generate items: snapshot aset milik OPD target
    const targets = data.target_opd_ids ?? [];
    if (targets.length > 0) {
      const { data: asets } = await supabaseAdmin.from("aset").select("id,opd_id").in("opd_id", targets);
      if (asets && asets.length > 0) {
        const items = asets.map((a) => ({ campaign_id: row.id, aset_id: a.id, opd_id: a.opd_id, status: "belum" }));
        await supabaseAdmin.from("aset_verification_item").insert(items);
      }
    }
    return { ok: true, id: row.id };
  });

export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("aset_verification_campaign")
      .select("id,nama,deskripsi,periode_mulai,periode_selesai,target_opd_ids,status,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const campaignProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ campaign_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("aset_verification_item").select("status,opd_id").eq("campaign_id", data.campaign_id);
    if (error) throw new Error(error.message);
    const total = rows?.length ?? 0;
    const verified = (rows ?? []).filter((r) => r.status === "selesai").length;
    const byOpd = new Map<string, { total: number; verified: number }>();
    (rows ?? []).forEach((r) => {
      const k = r.opd_id ?? "_";
      const cur = byOpd.get(k) ?? { total: 0, verified: 0 };
      cur.total++; if (r.status === "selesai") cur.verified++;
      byOpd.set(k, cur);
    });
    return {
      total, verified, persen: total ? Math.round((verified * 100) / total) : 0,
      per_opd: Array.from(byOpd, ([opd_id, v]) => ({ opd_id, ...v })),
    };
  });

export const listCampaignItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    campaign_id: z.string().uuid(),
    status: z.enum(["belum", "selesai", "perlu_verifikasi"]).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    let q = supabaseAdmin.from("aset_verification_item")
      .select("id,status,verified_at,lat,lng,lokasi_text,foto_url,catatan,aset:aset!aset_id(id,kode,nama,kategori,lifecycle_status), opd:opd!opd_id(nama,singkatan)")
      .eq("campaign_id", data.campaign_id)
      .order("status", { ascending: true })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (!c.isSuper && c.opdId) q = q.eq("opd_id", c.opdId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const submitCampaignVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    item_id: z.string().uuid(),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    lokasi_text: z.string().max(255).optional().nullable(),
    foto_url: z.string().max(1000).optional().nullable(),
    catatan: z.string().max(500).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: it } = await supabaseAdmin.from("aset_verification_item").select("id,opd_id,aset_id").eq("id", data.item_id).maybeSingle();
    if (!it) throw new Error("Item verifikasi tidak ditemukan");
    if (!c.isSuper && c.opdId !== it.opd_id) throw new Error("Bukan untuk OPD Anda");
    const { error } = await supabaseAdmin.from("aset_verification_item").update({
      status: "selesai",
      verified_at: new Date().toISOString(),
      verified_by: context.userId,
      lat: data.lat ?? null, lng: data.lng ?? null,
      lokasi_text: data.lokasi_text ?? null,
      foto_url: data.foto_url ?? null,
      catatan: data.catatan ?? null,
    }).eq("id", data.item_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("aset").update({ last_verified_at: new Date().toISOString() }).eq("id", it.aset_id);
    return { ok: true };
  });

// ===== COMPLIANCE =====
export const asetCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().optional().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const opd = c.isSuper ? (data.opd_id ?? null) : c.opdId;
    const { data: row, error } = await supabaseAdmin.rpc("aset_compliance", { _opd_id: opd as string });
    if (error) throw new Error(error.message);
    return row;
  });
