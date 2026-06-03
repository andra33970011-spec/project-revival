// Sprint A — Generate Dokumen Final (PDF + QR + hash + token verifikasi).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "berkas-permohonan";

function token(len = 24): string {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, "0")).join("");
}


export const generateDokumenFinal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      permohonan_id: z.string().uuid(),
      site_origin: z.string().url().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // RBAC: super_admin atau admin_opd dari OPD pemilik
    const { data: p } = await supabaseAdmin
      .from("permohonan")
      .select("id,kode,judul,kategori,status,nomor_surat,opd_id,pemohon_id,dokumen_final_path,tanggal_masuk,deskripsi, opd:opd!opd_id(nama,singkatan)")
      .eq("id", data.permohonan_id)
      .maybeSingle();
    if (!p) throw new Error("Permohonan tidak ditemukan");
    if (!p.nomor_surat) throw new Error("Terbitkan nomor surat terlebih dahulu");

    const { data: roleSuper } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    let allowed = !!roleSuper;
    if (!allowed) {
      const { data: roleOpd } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin_opd" });
      const { data: myOpd } = await supabaseAdmin.rpc("get_user_opd", { _user_id: userId });
      allowed = !!roleOpd && myOpd === p.opd_id;
    }
    if (!allowed) throw new Error("Forbidden");

    // Pemohon
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("nama_lengkap,nik").eq("id", p.pemohon_id).maybeSingle();

    const tok = token();
    const origin = data.site_origin ?? "";
    const verifyUrl = `${origin}/v/${tok}`;

    // Render PDF
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const QRCode = (await import("qrcode")).default;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 });
    const qrPng = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const qrImg = await pdf.embedPng(qrPng);

    const opdNama = p.opd?.nama ?? "Pemerintah Daerah";
    const opdSingkatan = p.opd?.singkatan ?? "OPD";
    let y = 800;
    const draw = (t: string, x: number, yy: number, size = 11, bold = false) =>
      page.drawText(t, { x, y: yy, size, font: bold ? fontBold : font, color: rgb(0.1, 0.1, 0.15) });

    draw("PEMERINTAH DAERAH", 50, y, 10, true); y -= 14;
    draw(opdNama.toUpperCase(), 50, y, 14, true); y -= 14;
    draw(`(${opdSingkatan})`, 50, y, 10); y -= 8;
    page.drawLine({ start: { x: 50, y: y - 4 }, end: { x: 545, y: y - 4 }, thickness: 1, color: rgb(0.1, 0.1, 0.15) });
    page.drawLine({ start: { x: 50, y: y - 7 }, end: { x: 545, y: y - 7 }, thickness: 0.5, color: rgb(0.1, 0.1, 0.15) });
    y -= 36;

    draw(`Nomor   : ${p.nomor_surat}`, 50, y); y -= 16;
    draw(`Perihal : ${p.kategori}`, 50, y); y -= 24;

    draw("Berdasarkan permohonan yang diajukan kepada kami:", 50, y); y -= 20;
    draw(`Kode Permohonan : ${p.kode}`, 70, y); y -= 14;
    draw(`Pemohon         : ${prof?.nama_lengkap ?? "-"} (NIK: ${prof?.nik ?? "-"})`, 70, y); y -= 14;
    draw(`Judul           : ${p.judul}`, 70, y); y -= 14;
    draw(`Tanggal Masuk   : ${new Date(p.tanggal_masuk).toLocaleDateString("id-ID")}`, 70, y); y -= 20;

    draw("Dengan ini dinyatakan bahwa permohonan tersebut telah selesai diproses dan", 50, y); y -= 14;
    draw("dokumen ini diterbitkan sebagai output resmi atas layanan dimaksud.", 50, y); y -= 28;

    if (p.deskripsi) {
      const lines = wrap(p.deskripsi, 90).slice(0, 6);
      for (const ln of lines) { draw(ln, 50, y, 10); y -= 12; }
      y -= 8;
    }

    // Tanggal & QR
    draw(`Diterbitkan: ${new Date().toLocaleString("id-ID")}`, 50, 200);
    draw("Verifikasi keaslian:", 50, 180, 9);
    draw(verifyUrl, 50, 168, 8);
    page.drawImage(qrImg, { x: 430, y: 90, width: 110, height: 110 });
    draw("Pindai QR untuk verifikasi", 430, 78, 8);

    const bytes = await pdf.save();
    const hash = await sha256Hex(bytes);
    const path = `dokumen-final/${p.id}/${tok}.pdf`;

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) throw new Error(`Gagal upload: ${upErr.message}`);

    const { error: insErr } = await supabaseAdmin.from("dokumen_verifikasi").insert({
      token: tok,
      permohonan_id: p.id,
      nomor_surat: p.nomor_surat,
      storage_path: path,
      sha256: hash,
      signature_provider: "none",
      diterbitkan_oleh: userId,
    });
    if (insErr) throw new Error(`Gagal simpan verifikasi: ${insErr.message}`);

    await supabaseAdmin.from("permohonan").update({ dokumen_final_path: path }).eq("id", p.id);

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId, aksi: "dokumen.generate", entitas: "permohonan",
      entitas_id: p.id, data_sesudah: { token: tok, sha256: hash },
    });

    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
    return { token: tok, path, sha256: hash, signed_url: signed?.signedUrl ?? null, verify_url: verifyUrl };
  });

export const getDokumenFinalSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ permohonan_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: p } = await supabaseAdmin
      .from("permohonan").select("dokumen_final_path").eq("id", data.permohonan_id).maybeSingle();
    if (!p?.dokumen_final_path) return { signed_url: null };
    const { data: s } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p.dokumen_final_path, 60 * 30);
    return { signed_url: s?.signedUrl ?? null };
  });

function wrap(text: string, w: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const out: string[] = []; let cur = "";
  for (const word of words) {
    if ((cur + " " + word).trim().length > w) { if (cur) out.push(cur); cur = word; }
    else cur = cur ? cur + " " + word : word;
  }
  if (cur) out.push(cur);
  return out;
}
