// Modul ASN: Tracking Aset Fisik.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkRateLimit } from "@/integrations/supabase/rate-limit.server";
import { getUserContext } from "@/features/rbac/guards";
import { log, newCorrelationId } from "./logger";
import { casUpdate, CasConflictError } from "./db/cas";
import { withIdempotency, idemKey } from "./http/idempotency";

async function userCtx(userId: string) {
  const ctx = await getUserContext(supabaseAdmin, userId);
  return { isSuper: ctx.isSuper, isAdminOpd: ctx.isAdminOpd, isAsn: ctx.isAsn, opdId: ctx.opdId };
}


function genKode() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AST-${ts}-${rnd}`;
}

const asetSchema = z.object({
  id: z.string().uuid().optional(),
  nama: z.string().trim().min(2).max(160),
  kategori: z.enum(["kendaraan", "elektronik", "lainnya"]).default("lainnya"),
  merk: z.string().max(120).optional().nullable(),
  nomor_seri: z.string().max(120).optional().nullable(),
  opd_id: z.string().uuid().nullable(),
  pemegang_user_id: z.string().uuid().nullable().optional(),
  lokasi_terkini: z.string().max(255).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  status: z.enum(["aktif", "rusak", "dihapuskan"]).default("aktif"),
  foto_url: z.string().url().max(1000).optional().nullable(),
  catatan: z.string().max(1000).optional().nullable(),
});

export const upsertAset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => asetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await userCtx(context.userId);
    if (!ctx.isSuper && !(ctx.isAdminOpd && ctx.opdId === data.opd_id)) throw new Error("Forbidden");
    const rl = await checkRateLimit(context.userId, "aset_write", 60, 60);
    if (!rl.ok) throw new Error("Terlalu banyak permintaan");
    const correlationId = newCorrelationId();

    const payload = { ...data };
    if (data.id) {
      const { id, ...upd } = payload;
      // Read current version for optimistic CAS
      const { data: cur } = await supabaseAdmin
        .from("aset")
        .select("version_number")
        .eq("id", id!)
        .maybeSingle();
      try {
        await casUpdate({
          client: supabaseAdmin,
          table: "aset",
          id: id!,
          expectedVersion: (cur as { version_number?: number } | null)?.version_number,
          next: upd as Record<string, unknown>,
        });
      } catch (e) {
        if (e instanceof CasConflictError) {
          log.warn("aset.update.cas_conflict", { userId: context.userId, correlationId, id });
          return { ok: false, code: "CAS_CONFLICT" as const, id };
        }
        throw e;
      }
      await supabaseAdmin.from("aset_riwayat").insert({
        aset_id: id!, oleh: context.userId, aksi: "update", data: upd as never,
      });
      log.info("aset.update.ok", { userId: context.userId, correlationId, id });
      return { ok: true, id };
    }
    // CREATE: idempotency by user + nama + opd to dedupe double-click
    const key = idemKey("aset:create", context.userId, { nama: data.nama, opd_id: data.opd_id });
    return withIdempotency(key, 30_000, async () => {
      const kode = genKode();
      // qr_token diisi otomatis oleh trigger aset_set_qr_token; cast agar lulus type check
      const { data: row, error } = await supabaseAdmin.from("aset").insert({ ...payload, kode } as never).select("id,kode").single();
      if (error) {
        log.error("aset.create.fail", { userId: context.userId, correlationId, error: error.message });
        throw new Error(error.message);
      }
      await supabaseAdmin.from("aset_riwayat").insert({
        aset_id: row.id, oleh: context.userId, aksi: "create", data: payload as never,
      });
      log.info("aset.create.ok", { userId: context.userId, correlationId, id: row.id });
      return { ok: true, id: row.id, kode: row.kode };
    });
  });

export const deleteAset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await userCtx(context.userId);
    const { data: a } = await supabaseAdmin.from("aset").select("opd_id").eq("id", data.id).maybeSingle();
    if (!a) throw new Error("Aset tidak ditemukan");
    if (!ctx.isSuper && !(ctx.isAdminOpd && ctx.opdId === a.opd_id)) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("aset").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      opd_id: z.string().uuid().optional().nullable(),
      q: z.string().max(120).optional().nullable(),
      kategori: z.string().max(40).optional().nullable(),
      mine: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await userCtx(context.userId);
    let q = supabaseAdmin
      .from("aset")
      .select("id,kode,nama,kategori,merk,nomor_seri,opd_id,pemegang_user_id,lokasi_terkini,lat,lng,status,lifecycle_status,last_verified_at,foto_url,updated_at, opd:opd!opd_id(nama,singkatan), pemegang:profiles!pemegang_user_id(nama_lengkap,nip)")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.mine) q = q.eq("pemegang_user_id", context.userId);
    else if (!ctx.isSuper) {
      const opd = ctx.opdId;
      if (!opd) return { rows: [] };
      q = q.eq("opd_id", opd);
    } else if (data.opd_id) q = q.eq("opd_id", data.opd_id);
    if (data.kategori) q = q.eq("kategori", data.kategori);
    if (data.q) q = q.or(`nama.ilike.%${data.q}%,kode.ilike.%${data.q}%,nomor_seri.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // Resolusi signed URL bila foto_url berupa path storage.
    const enriched = await Promise.all((rows ?? []).map(async (r) => ({
      ...r,
      foto_url: await signFotoIfPath((r as { foto_url: string | null }).foto_url),
    })));
    return { rows: enriched };
  });


export const resolveAsetByKode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kode: z.string().min(3).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("aset")
      .select("id,kode,nama,kategori,merk,nomor_seri,opd_id,pemegang_user_id,lokasi_terkini,lat,lng,status,foto_url, opd:opd!opd_id(nama,singkatan), pemegang:profiles!pemegang_user_id(nama_lengkap)")
      .eq("kode", data.kode).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Aset tidak ditemukan");
    return row;
  });

export const scanAset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      kode: z.string().min(3).max(80),
      lat: z.number().optional().nullable(),
      lng: z.number().optional().nullable(),
      lokasi_text: z.string().max(255).optional().nullable(),
      catatan: z.string().max(500).optional().nullable(),
      // foto_url sekarang menerima path storage (mis. "uid/AST-.../hash.jpg")
      // ATAU URL penuh untuk kompatibilitas data lama.
      foto_url: z.string().max(1000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const rl = await checkRateLimit(context.userId, "aset_scan", 60, 60);
    if (!rl.ok) throw new Error("Terlalu banyak scan");

    const { data: aset, error: aErr } = await supabaseAdmin
      .from("aset").select("id,opd_id,pemegang_user_id").eq("kode", data.kode).maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!aset) throw new Error("Aset tidak ditemukan");

    // Otorisasi: hanya super, admin_opd OPD pemilik, atau ASN pemegang aset.
    const ctx = await userCtx(context.userId);
    const isHolder = aset.pemegang_user_id === context.userId;
    const sameOpd = ctx.opdId && ctx.opdId === aset.opd_id;
    if (!ctx.isSuper && !(ctx.isAdminOpd && sameOpd) && !(ctx.isAsn && (sameOpd || isHolder))) {
      throw new Error("Aset ini bukan milik OPD Anda dan bukan ditugaskan kepada Anda");
    }

    // Idempotency: dedupe double-tap scan dalam jendela 60 detik.
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const key = idemKey("aset:scan", context.userId, { kode: data.kode, minuteBucket });
    return withIdempotency(key, 60_000, async () => {
      // Update lokasi terkini
      const update: { lat?: number | null; lng?: number | null; lokasi_terkini?: string | null; foto_url?: string | null } = {};
      if (data.lat !== null && data.lat !== undefined) update.lat = data.lat;
      if (data.lng !== null && data.lng !== undefined) update.lng = data.lng;
      if (data.lokasi_text) update.lokasi_terkini = data.lokasi_text;
      if (data.foto_url) update.foto_url = data.foto_url;
      if (Object.keys(update).length > 0) {
        await supabaseAdmin.from("aset").update(update).eq("id", aset.id);
      }

      await supabaseAdmin.from("aset_riwayat").insert({
        aset_id: aset.id,
        oleh: context.userId,
        aksi: "scan_lokasi",
        catatan: data.catatan ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        lokasi_text: data.lokasi_text ?? null,
        data: data.foto_url ? ({ foto_url: data.foto_url } as never) : null,
      });
      return { ok: true, aset_id: aset.id };
    });
  });

// Helper: bila value adalah path bucket aset-foto (bukan URL), buat signed URL fresh.
async function signFotoIfPath(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value; // legacy: sudah URL
  const { data } = await supabaseAdmin.storage.from("aset-foto").createSignedUrl(value, 60 * 60); // 1 jam
  return data?.signedUrl ?? null;
}



export const assignAsetPemegang = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ aset_id: z.string().uuid(), pemegang_user_id: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ctx = await userCtx(context.userId);
    const { data: a } = await supabaseAdmin.from("aset").select("opd_id").eq("id", data.aset_id).maybeSingle();
    if (!a) throw new Error("Aset tidak ditemukan");
    if (!ctx.isSuper && !(ctx.isAdminOpd && ctx.opdId === a.opd_id)) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("aset").update({ pemegang_user_id: data.pemegang_user_id }).eq("id", data.aset_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("aset_riwayat").insert({
      aset_id: data.aset_id, oleh: context.userId, aksi: "pindah_pemegang",
      data: { pemegang_user_id: data.pemegang_user_id } as never,
    });
    return { ok: true };
  });

export const listAsetRiwayat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ aset_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Otorisasi: hanya super, admin_opd OPD pemilik, atau ASN pemegang aset.
    const ctx = await userCtx(context.userId);
    const { data: aset } = await supabaseAdmin.from("aset").select("opd_id,pemegang_user_id").eq("id", data.aset_id).maybeSingle();
    if (!aset) throw new Error("Aset tidak ditemukan");
    const sameOpd = ctx.opdId && ctx.opdId === aset.opd_id;
    const isHolder = aset.pemegang_user_id === context.userId;
    if (!ctx.isSuper && !(ctx.isAdminOpd && sameOpd) && !isHolder) {
      throw new Error("Anda tidak berhak melihat riwayat aset ini");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("aset_riwayat")
      .select("id,aksi,catatan,lat,lng,lokasi_text,data,created_at, oleh_profile:profiles!oleh(nama_lengkap)")
      .eq("aset_id", data.aset_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    // Sign foto_url di data jsonb bila berupa path.
    const enriched = await Promise.all((rows ?? []).map(async (r) => {
      const d = r.data as { foto_url?: string | null } | null;
      if (!d || !d.foto_url) return r;
      return { ...r, data: { ...d, foto_url: await signFotoIfPath(d.foto_url) } };
    }));
    return { rows: enriched };
  });

