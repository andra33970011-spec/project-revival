// Sprint C — BAST (Berita Acara Serah Terima)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

function genNomor() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BAST/${ymd}/${rnd}`;
}

export const createBast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    penerima_user: z.string().uuid(),
    opd_id: z.string().uuid().nullable().optional(),
    tanggal: z.string().date().optional(),
    catatan: z.string().max(2000).optional().nullable(),
    aset_ids: z.array(z.string().uuid()).min(1).max(200),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const opdId = c.isSuper ? (data.opd_id ?? null) : c.opdId;
    // Validasi aset
    const { data: asets } = await supabaseAdmin.from("aset").select("id,opd_id").in("id", data.aset_ids);
    if (!c.isSuper && (asets ?? []).some((a) => a.opd_id !== c.opdId)) throw new Error("Ada aset di luar OPD Anda");
    const nomor = genNomor();
    const { data: row, error } = await supabaseAdmin.from("aset_bast").insert({
      nomor, pemberi_user: context.userId, penerima_user: data.penerima_user,
      opd_id: opdId, tanggal: data.tanggal ?? new Date().toISOString().slice(0, 10),
      catatan: data.catatan ?? null, status: "issued", created_by: context.userId,
    } as never).select("id,nomor").single();
    if (error) throw new Error(error.message);
    const items = data.aset_ids.map((id) => ({ bast_id: row.id, aset_id: id }));
    await supabaseAdmin.from("aset_bast_items").insert(items as never);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "bast.issue", entitas: "aset_bast", entitas_id: row.id,
      data_sesudah: { nomor: row.nomor, items: items.length } as never,
    });
    return { ok: true, id: row.id, nomor: row.nomor };
  });

export const approveBast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b } = await supabaseAdmin.from("aset_bast").select("penerima_user,status").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("BAST tidak ditemukan");
    if (b.penerima_user !== context.userId) {
      const c = await getUserContext(supabaseAdmin, context.userId);
      if (!c.isSuper) throw new Error("Hanya penerima yang dapat menyetujui");
    }
    if (b.status === "approved") return { ok: true };
    const { error } = await supabaseAdmin.from("aset_bast").update({
      status: "approved", approved_by: context.userId, approved_at: new Date().toISOString(),
    } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "bast.approve", entitas: "aset_bast", entitas_id: data.id,
    });
    return { ok: true };
  });

export const cancelBast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), alasan: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    const { data: b } = await supabaseAdmin.from("aset_bast").select("opd_id,status,created_by").eq("id", data.id).maybeSingle();
    if (!b) throw new Error("BAST tidak ditemukan");
    if (b.status === "approved") throw new Error("BAST sudah disetujui");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === b.opd_id) && b.created_by !== context.userId) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("aset_bast").update({ status: "cancelled", catatan: data.alasan ?? null } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    status: z.enum(["draft", "issued", "approved", "cancelled"]).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    let q = supabaseAdmin.from("aset_bast")
      .select("id,nomor,tanggal,status,catatan,pemberi_user,penerima_user,opd_id,approved_at,created_at, pemberi:profiles!pemberi_user(nama_lengkap), penerima:profiles!penerima_user(nama_lengkap), opd:opd!opd_id(singkatan,nama)")
      .order("created_at", { ascending: false }).limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (!c.isSuper) {
      if (c.isAdminOpd && c.opdId) q = q.or(`opd_id.eq.${c.opdId},pemberi_user.eq.${context.userId},penerima_user.eq.${context.userId}`);
      else q = q.or(`pemberi_user.eq.${context.userId},penerima_user.eq.${context.userId}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getBastDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: bast, error } = await supabaseAdmin.from("aset_bast")
      .select("*, pemberi:profiles!pemberi_user(nama_lengkap,nip), penerima:profiles!penerima_user(nama_lengkap,nip), opd:opd!opd_id(nama,singkatan)")
      .eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!bast) throw new Error("Tidak ditemukan");
    const { data: items } = await supabaseAdmin.from("aset_bast_items")
      .select("aset_id, aset:aset!aset_id(kode,nama,kategori,nomor_seri,merk)")
      .eq("bast_id", data.id);
    return { bast, items: items ?? [] };
  });
