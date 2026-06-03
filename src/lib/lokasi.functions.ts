// Sprint C — Lokasi gedung/lantai/ruangan
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

async function ensureAdmin(userId: string, opdId?: string | null) {
  const c = await getUserContext(supabaseAdmin, userId);
  if (c.isSuper) return c;
  if (c.isAdminOpd && (!opdId || c.opdId === opdId)) return c;
  throw new Error("Forbidden");
}

export const listGedung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("lokasi_gedung").select("id,nama,alamat,opd_id, opd:opd!opd_id(singkatan)").order("nama");
    if (data.opd_id) q = q.eq("opd_id", data.opd_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const upsertGedung = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(),
    nama: z.string().min(2).max(160),
    alamat: z.string().max(500).optional().nullable(),
    opd_id: z.string().uuid().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId, data.opd_id);
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("lokasi_gedung").update(upd as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("lokasi_gedung").insert(data as never).select("id").single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "lokasi.create", entitas: "lokasi_gedung", entitas_id: row.id,
    });
    return { ok: true, id: row.id };
  });

export const upsertLantai = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(),
    gedung_id: z.string().uuid(),
    nama: z.string().min(1).max(100),
    urutan: z.number().int().default(0),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: g } = await supabaseAdmin.from("lokasi_gedung").select("opd_id").eq("id", data.gedung_id).maybeSingle();
    await ensureAdmin(context.userId, g?.opd_id ?? null);
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("lokasi_lantai").update(upd as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("lokasi_lantai").insert(data as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const upsertRuangan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(),
    lantai_id: z.string().uuid(),
    nama: z.string().min(1).max(120),
    kode: z.string().max(40).optional().nullable(),
    pic_user_id: z.string().uuid().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: l } = await supabaseAdmin.from("lokasi_lantai").select("gedung_id, gedung:lokasi_gedung!gedung_id(opd_id)").eq("id", data.lantai_id).maybeSingle();
    const opdId = (l as { gedung: { opd_id: string | null } | null } | null)?.gedung?.opd_id ?? null;
    await ensureAdmin(context.userId, opdId);
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await supabaseAdmin.from("lokasi_ruangan").update(upd as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("lokasi_ruangan").insert(data as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const listHierarki = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data }) => {
    let gq = supabaseAdmin.from("lokasi_gedung").select("id,nama,alamat,opd_id").order("nama");
    if (data.opd_id) gq = gq.eq("opd_id", data.opd_id);
    const { data: gedungs } = await gq;
    const ids = (gedungs ?? []).map((g) => g.id);
    const { data: lantais } = ids.length
      ? await supabaseAdmin.from("lokasi_lantai").select("id,gedung_id,nama,urutan").in("gedung_id", ids).order("urutan")
      : { data: [] as Array<{ id: string; gedung_id: string; nama: string; urutan: number }> };
    const lids = (lantais ?? []).map((l) => l.id);
    const { data: ruangans } = lids.length
      ? await supabaseAdmin.from("lokasi_ruangan").select("id,lantai_id,nama,kode,pic_user_id").in("lantai_id", lids).order("nama")
      : { data: [] as Array<{ id: string; lantai_id: string; nama: string; kode: string | null; pic_user_id: string | null }> };
    return { gedungs: gedungs ?? [], lantais: lantais ?? [], ruangans: ruangans ?? [] };
  });
