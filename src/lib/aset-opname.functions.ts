// Sprint C — Opname Aset
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

const periodeSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const openOpname = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    opd_id: z.string().uuid().nullable().optional(),
    periode: periodeSchema,
    catatan: z.string().max(1000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    const opdId = c.isSuper ? (data.opd_id ?? null) : c.opdId;
    const { data: row, error } = await supabaseAdmin.from("aset_opname").insert({
      opd_id: opdId, periode: data.periode, status: "open", dibuat_oleh: context.userId, catatan: data.catatan ?? null,
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    // Snapshot items: semua aset OPD
    const { data: asets } = await supabaseAdmin.from("aset").select("id").eq("opd_id", opdId as string);
    if ((asets ?? []).length > 0) {
      const items = (asets ?? []).map((a) => ({ opname_id: row.id, aset_id: a.id }));
      await supabaseAdmin.from("aset_opname_items").insert(items as never);
    }
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "opname.open", entitas: "aset_opname", entitas_id: row.id,
      data_sesudah: { periode: data.periode, items: asets?.length ?? 0 } as never,
    });
    return { ok: true, id: row.id, items: asets?.length ?? 0 };
  });

export const closeOpname = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    const { data: o } = await supabaseAdmin.from("aset_opname").select("opd_id,status").eq("id", data.id).maybeSingle();
    if (!o) throw new Error("Tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === o.opd_id)) throw new Error("Forbidden");
    if (o.status === "closed") return { ok: true };
    const { error } = await supabaseAdmin.from("aset_opname").update({
      status: "closed", ditutup_oleh: context.userId, closed_at: new Date().toISOString(),
    } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "opname.close", entitas: "aset_opname", entitas_id: data.id,
    });
    return { ok: true };
  });

export const listOpname = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    let q = supabaseAdmin.from("aset_opname")
      .select("id,opd_id,periode,status,catatan,closed_at,created_at, opd:opd!opd_id(singkatan,nama)")
      .order("created_at", { ascending: false }).limit(100);
    if (!c.isSuper && c.opdId) q = q.eq("opd_id", c.opdId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const listOpnameItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opname_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    const { data: o } = await supabaseAdmin.from("aset_opname").select("opd_id").eq("id", data.opname_id).maybeSingle();
    if (!o) throw new Error("Tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === o.opd_id)) throw new Error("Forbidden");
    const { data: rows, error } = await supabaseAdmin.from("aset_opname_items")
      .select("id,hadir,kondisi_temuan,catatan,verified_at, aset:aset!aset_id(id,kode,nama,kategori,lokasi_terkini)")
      .eq("opname_id", data.opname_id).limit(2000);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const verifyOpnameItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    item_id: z.string().uuid(),
    hadir: z.boolean(),
    kondisi_temuan: z.string().max(200).optional().nullable(),
    catatan: z.string().max(500).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    const { data: it } = await supabaseAdmin.from("aset_opname_items")
      .select("opname_id, opname:aset_opname!opname_id(opd_id,status)").eq("id", data.item_id).maybeSingle();
    if (!it) throw new Error("Tidak ditemukan");
    const opname = (it as { opname: { opd_id: string | null; status: string } | null }).opname;
    if (!opname) throw new Error("Opname tidak valid");
    if (opname.status === "closed") throw new Error("Opname sudah ditutup");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === opname.opd_id)) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("aset_opname_items").update({
      hadir: data.hadir, kondisi_temuan: data.kondisi_temuan ?? null, catatan: data.catatan ?? null,
      verified_by: context.userId, verified_at: new Date().toISOString(),
    } as never).eq("id", data.item_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
