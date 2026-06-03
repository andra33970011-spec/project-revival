// Form Builder enhancements: komentar review, export xlsx, migrasi dari dataset_template, open data publik.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkRateLimit } from "@/integrations/supabase/rate-limit.server";
import { getUserContext } from "@/features/rbac/guards";

async function ctxOf(userId: string) {
  const c = await getUserContext(supabaseAdmin, userId);
  return { isSuper: c.isSuper, isAdminOpd: c.isAdminOpd, isAsn: c.isAsn, isPimpinan: c.isPimpinan, opdId: c.opdId };
}

// ===== Komentar submission =====
export const listSubmissionComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ submission_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.from("form_submission_comment")
      .select("id,pesan,internal_only,created_at,oleh, oleh_profile:profiles!oleh(nama_lengkap)")
      .eq("submission_id", data.submission_id)
      .order("created_at", { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const addSubmissionComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    submission_id: z.string().uuid(),
    pesan: z.string().trim().min(1).max(2000),
    internal_only: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (data.internal_only && !c.isAdminOpd && !c.isSuper) {
      throw new Error("Hanya admin yang bisa membuat catatan internal");
    }
    const { error } = await supabaseAdmin.from("form_submission_comment").insert({
      submission_id: data.submission_id, oleh: context.userId,
      pesan: data.pesan, internal_only: data.internal_only,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Migrasi dataset_template lama → forms =====
export const migrateDatasetToForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ template_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper) throw new Error("Forbidden");
    const { data: newId, error } = await supabaseAdmin.rpc("migrasi_dataset_ke_forms", { _template_id: data.template_id });
    if (error) throw new Error(error.message);
    return { ok: true, form_id: newId };
  });

// ===== Set forms.is_public / slug =====
export const setFormPublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    form_id: z.string().uuid(),
    is_public: z.boolean(),
    slug: z.string().regex(/^[a-z0-9-]{3,80}$/).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: f } = await supabaseAdmin.from("forms").select("opd_pemilik_id").eq("id", data.form_id).maybeSingle();
    if (!f) throw new Error("Form tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === f.opd_pemilik_id)) throw new Error("Forbidden");
    const upd: { is_public: boolean; slug?: string | null } = { is_public: data.is_public };
    if (data.slug !== undefined) upd.slug = data.slug;
    const { error } = await supabaseAdmin.from("forms").update(upd).eq("id", data.form_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Open data publik: list & detail tanpa auth =====
export const listPublicForms = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin.from("forms")
      .select("id,judul,deskripsi,slug,published_at, opd:opd!opd_pemilik_id(nama,singkatan)")
      .eq("status", "published").eq("is_public", true)
      .order("published_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getPublicFormBySlug = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(3).max(80) }).parse(i))
  .handler(async ({ data }) => {
    const { data: form, error } = await supabaseAdmin.from("forms")
      .select("id,judul,deskripsi,slug,published_at, opd:opd!opd_pemilik_id(nama,singkatan)")
      .eq("slug", data.slug).eq("status", "published").eq("is_public", true).maybeSingle();
    if (error) throw new Error(error.message);
    if (!form) return { form: null, fields: [], stats: { total: 0 } };
    const { data: fields } = await supabaseAdmin.from("form_fields")
      .select("kode,label,tipe,urutan").eq("form_id", form.id).order("urutan");
    const { count } = await supabaseAdmin.from("form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id).eq("status", "submitted");
    return { form, fields: fields ?? [], stats: { total: count ?? 0 } };
  });

// ===== Export Form Submissions ke XLSX =====
export const exportFormSubmissionsXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    form_id: z.string().uuid(),
    status: z.enum(["submitted", "approved", "rejected", "draft"]).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    if (!c.isSuper && !c.isAdminOpd && !c.isPimpinan) throw new Error("Forbidden");
    const rl = await checkRateLimit(context.userId, "form_export", 20, 60);
    if (!rl.ok) throw new Error("Terlalu banyak ekspor");

    const { data: form } = await supabaseAdmin.from("forms")
      .select("id,judul,opd_pemilik_id, opd:opd!opd_pemilik_id(nama,singkatan)").eq("id", data.form_id).single();
    if (!form) throw new Error("Form tidak ditemukan");
    if (!c.isSuper && c.opdId !== form.opd_pemilik_id) throw new Error("Bukan form OPD Anda");

    const { data: fields } = await supabaseAdmin.from("form_fields")
      .select("kode,label,tipe,urutan").eq("form_id", data.form_id).order("urutan");
    const cols = fields ?? [];

    let subQ = supabaseAdmin.from("form_submissions")
      .select("id,data,status,submitted_at,opd_id, user:profiles!user_id(nama_lengkap,nip,jabatan), opd:opd!opd_id(nama,singkatan)")
      .eq("form_id", data.form_id).limit(5000);
    if (data.status) subQ = subQ.eq("status", data.status);
    const { data: subs } = await subQ;

    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Portal Pemerintah — Form Builder";
    wb.created = new Date();
    const ws = wb.addWorksheet("Submissions");
    ws.columns = [
      { header: "No", key: "no", width: 5 },
      { header: "OPD", key: "opd", width: 26 },
      { header: "Nama", key: "nama", width: 26 },
      { header: "NIP", key: "nip", width: 22 },
      { header: "Status", key: "status", width: 14 },
      ...cols.map((k) => ({ header: k.label, key: k.kode, width: Math.max(14, Math.min(40, k.label.length + 6)) })),
      { header: "Submitted", key: "waktu", width: 22 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };

    (subs ?? []).forEach((s, i) => {
      const u = s.user as { nama_lengkap?: string; nip?: string } | null;
      const o = s.opd as { nama?: string } | null;
      const d = (s.data ?? {}) as Record<string, unknown>;
      const row: Record<string, unknown> = {
        no: i + 1, opd: o?.nama ?? "-", nama: u?.nama_lengkap ?? "-",
        nip: u?.nip ?? "-", status: s.status,
        waktu: s.submitted_at ? new Date(s.submitted_at).toLocaleString("id-ID") : "-",
      };
      for (const k of cols) row[k.kode] = (d[k.kode] ?? "") as unknown;
      ws.addRow(row);
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const path = `forms/${data.form_id}/${Date.now()}.xlsx`;
    const { error: upErr } = await supabaseAdmin.storage.from("share-files")
      .upload(path, buffer as ArrayBuffer, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signed } = await supabaseAdmin.storage.from("share-files").createSignedUrl(path, 60 * 60);
    return { url: signed?.signedUrl ?? "", filename: `form-${data.form_id}-${Date.now()}.xlsx`, count: (subs ?? []).length };
  });

// ===== Version diff helper =====
export const getSubmissionVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ submission_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin.from("form_submission_versions")
      .select("id,version,data,files,created_at,created_by, oleh_profile:profiles!created_by(nama_lengkap)")
      .eq("submission_id", data.submission_id).order("version", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
