// Modul ASN: Mutasi Aset & Pemeliharaan, QR token, Label PDF, Nilai Buku.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function ctxOf(userId: string) {
  const c = await getUserContext(supabaseAdmin, userId);
  return { isSuper: c.isSuper, isAdminOpd: c.isAdminOpd, isAsn: c.isAsn, opdId: c.opdId };
}

// ===== Resolve by QR token =====
export const resolveAsetByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string().min(8).max(80) }).parse(i))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("aset")
      .select("id,kode,qr_token,nama,kategori,merk,nomor_seri,opd_id,pemegang_user_id,lokasi_terkini,lat,lng,status,foto_url, opd:opd!opd_id(nama,singkatan), pemegang:profiles!pemegang_user_id(nama_lengkap)")
      .eq("qr_token", data.token).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Aset tidak ditemukan untuk QR ini");
    return row;
  });

// ===== Mutasi workflow =====
const mutasiSchema = z.object({
  aset_id: z.string().uuid(),
  ke_user: z.string().uuid().nullable().optional(),
  ke_opd: z.string().uuid().nullable().optional(),
  alasan: z.string().trim().min(5).max(500),
});

export const ajukanMutasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => mutasiSchema.parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: a } = await supabaseAdmin.from("aset")
      .select("opd_id,pemegang_user_id").eq("id", data.aset_id).maybeSingle();
    if (!a) throw new Error("Aset tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === a.opd_id) && context.userId !== a.pemegang_user_id) {
      throw new Error("Hanya admin OPD pemilik atau pemegang aset yang dapat mengajukan mutasi");
    }
    const { data: row, error } = await supabaseAdmin.from("aset_mutasi").insert({
      aset_id: data.aset_id,
      dari_user: a.pemegang_user_id,
      ke_user: data.ke_user ?? null,
      dari_opd: a.opd_id,
      ke_opd: data.ke_opd ?? null,
      alasan: data.alasan,
      diajukan_oleh: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const putusanMutasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]),
    catatan: z.string().max(500).optional().nullable(),
    ttd_url: z.string().max(1000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: m } = await supabaseAdmin.from("aset_mutasi").select("ke_opd,status").eq("id", data.id).maybeSingle();
    if (!m) throw new Error("Mutasi tidak ditemukan");
    if (m.status !== "pending") throw new Error("Mutasi sudah diputuskan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === m.ke_opd)) {
      throw new Error("Hanya admin OPD penerima yang berhak menyetujui");
    }
    if (data.status === "rejected" && (!data.catatan || data.catatan.length < 5)) {
      throw new Error("Alasan penolakan wajib (min 5 karakter)");
    }
    const { error } = await supabaseAdmin.from("aset_mutasi").update({
      status: data.status, approved_by: context.userId, approved_at: new Date().toISOString(),
      catatan_approval: data.catatan ?? null, ttd_url: data.ttd_url ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMutasi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    status: z.enum(["pending", "approved", "rejected", "dibatalkan"]).optional().nullable(),
    aset_id: z.string().uuid().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    let q = supabaseAdmin.from("aset_mutasi")
      .select("id,aset_id,dari_user,ke_user,dari_opd,ke_opd,alasan,status,approved_by,approved_at,catatan_approval,created_at, aset:aset!aset_id(kode,nama), opd_dari:opd!dari_opd(singkatan), opd_ke:opd!ke_opd(singkatan), pemegang_dari:profiles!dari_user(nama_lengkap), pemegang_ke:profiles!ke_user(nama_lengkap)")
      .order("created_at", { ascending: false }).limit(300);
    if (data.status) q = q.eq("status", data.status);
    if (data.aset_id) q = q.eq("aset_id", data.aset_id);
    if (!c.isSuper && c.opdId) {
      q = q.or(`ke_opd.eq.${c.opdId},dari_opd.eq.${c.opdId},diajukan_oleh.eq.${context.userId}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ===== Pemeliharaan =====
const pemSchema = z.object({
  id: z.string().uuid().optional(),
  aset_id: z.string().uuid(),
  jadwal_at: z.string().date(),
  jenis: z.string().min(2).max(120),
  status: z.enum(["terjadwal", "berjalan", "selesai", "dibatalkan"]).default("terjadwal"),
  biaya: z.number().min(0).max(1e12).optional().nullable(),
  vendor: z.string().max(160).optional().nullable(),
  hasil: z.string().max(1000).optional().nullable(),
  dokumen_url: z.string().max(1000).optional().nullable(),
});

export const upsertPemeliharaan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => pemSchema.parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: a } = await supabaseAdmin.from("aset").select("opd_id").eq("id", data.aset_id).maybeSingle();
    if (!a) throw new Error("Aset tidak ditemukan");
    if (!c.isSuper && !(c.isAdminOpd && c.opdId === a.opd_id)) throw new Error("Forbidden");
    const payload = { ...data, oleh: context.userId };
    if (data.id) {
      const { id, ...upd } = payload;
      const { error } = await supabaseAdmin.from("aset_pemeliharaan").update(upd).eq("id", id!);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await supabaseAdmin.from("aset_pemeliharaan").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const listPemeliharaan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ aset_id: z.string().uuid().optional().nullable() }).parse(i))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("aset_pemeliharaan")
      .select("id,aset_id,jadwal_at,jenis,status,biaya,vendor,hasil,dokumen_url,created_at, aset:aset!aset_id(kode,nama)")
      .order("jadwal_at", { ascending: false }).limit(300);
    if (data.aset_id) q = q.eq("aset_id", data.aset_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ===== Nilai Buku =====
export const listNilaiBuku = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().optional().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    let q = supabaseAdmin.from("aset_nilai_buku")
      .select("id,kode,nama,opd_id,nilai_perolehan,tanggal_perolehan,umur_ekonomis_bulan,metode_susut,nilai_buku")
      .order("nilai_buku", { ascending: false }).limit(500);
    if (!c.isSuper) {
      if (!c.opdId) return { rows: [] };
      q = q.eq("opd_id", c.opdId);
    } else if (data.opd_id) q = q.eq("opd_id", data.opd_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ===== QR Label PDF (batch) =====
export const generateQrLabelPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    aset_ids: z.array(z.string().uuid()).min(1).max(200),
    base_url: z.string().url().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    let q = supabaseAdmin.from("aset").select("id,kode,qr_token,nama,opd_id").in("id", data.aset_ids);
    if (!c.isSuper && c.opdId) q = q.eq("opd_id", c.opdId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) throw new Error("Tidak ada aset yang berhak Anda cetak");
    const base = (data.base_url ?? "").replace(/\/+$/, "") || "";

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
    // A4: 595 x 842 pt; grid 2 cols x 4 rows = 8 label/page
    const COLS = 2, ROWS = 4, PAGE_W = 595, PAGE_H = 842;
    const cellW = PAGE_W / COLS, cellH = PAGE_H / ROWS;
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let idx = 0;
    for (const a of rows) {
      if (idx > 0 && idx % (COLS * ROWS) === 0) page = pdf.addPage([PAGE_W, PAGE_H]);
      const slot = idx % (COLS * ROWS);
      const col = slot % COLS, row = Math.floor(slot / COLS);
      const x0 = col * cellW, y0 = PAGE_H - (row + 1) * cellH;
      page.drawRectangle({ x: x0 + 8, y: y0 + 8, width: cellW - 16, height: cellH - 16,
        borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
      const url = `${base}/asn/aset/qr/${a.qr_token}`;
      const qrPng = await QRCode.toBuffer(url, { type: "png", width: 320, margin: 1 });
      const img = await pdf.embedPng(qrPng);
      const qrSize = Math.min(cellW, cellH) * 0.55;
      page.drawImage(img, { x: x0 + 16, y: y0 + cellH - qrSize - 24, width: qrSize, height: qrSize });
      page.drawText(a.kode, { x: x0 + qrSize + 28, y: y0 + cellH - 40, size: 12, font: fontB });
      const nama = (a.nama ?? "").slice(0, 28);
      page.drawText(nama, { x: x0 + qrSize + 28, y: y0 + cellH - 58, size: 9, font });
      page.drawText("Scan untuk verifikasi", { x: x0 + 16, y: y0 + 16, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
      idx++;
    }
    const bytes = await pdf.save();
    const path = `qr/${context.userId}/${Date.now()}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from("aset-foto").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(upErr.message);
    const { data: signed } = await supabaseAdmin.storage.from("aset-foto").createSignedUrl(path, 60 * 30);
    return { url: signed?.signedUrl ?? "", filename: `qr-label-${Date.now()}.pdf`, count: rows.length };
  });

// ===== Cron data: garansi/kalibrasi habis =====
export const listDueWarranty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await ctxOf(context.userId);
    const { data: rows, error } = await supabaseAdmin.rpc("aset_due_warranty", { _days: data.days });
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ aset_id: string; kode: string; nama: string; opd_id: string | null; jenis: string; due_date: string }>;
    if (!c.isSuper && c.opdId) return { rows: list.filter((r) => r.opd_id === c.opdId) };
    return { rows: list };
  });
