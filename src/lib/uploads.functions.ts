// Upload workflow untuk submission form: signed upload URL, finalize, preview.
// Provider storage hybrid: Supabase (default) atau Cloudflare R2 (via app_setting).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext, canViewSubmission, canReviewSubmission } from "@/features/rbac/guards";
import { enforceRateLimit, RateLimits } from "./security/rate-limit";
import { createSignedDownload, createSignedUpload, removeObjects, loadStorageConfig, type StorageProvider } from "./storage/provider.server";

const BUCKET = "form-submissions";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

async function loadSubmissionOwned(submissionId: string, userId: string) {
  const { data: s } = await supabaseAdmin
    .from("form_submissions")
    .select("id,user_id,status,form_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!s || s.user_id !== userId) throw new Error("Submission tidak valid");
  if (!["draft", "revision_required"].includes(s.status)) {
    throw new Error("Tidak dapat upload pada status ini");
  }
  return s;
}

export const createUploadSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        submissionId: z.string().uuid(),
        fieldKode: z
          .string()
          .min(1)
          .max(60)
          .regex(/^[a-z][a-z0-9_]*$/),
        filename: z.string().min(1).max(120),
        mime: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.uploadSignedUrl);
    const s = await loadSubmissionOwned(data.submissionId, userId);
    if (!ALLOWED_MIME.has(data.mime)) throw new Error(`Tipe file tidak didukung: ${data.mime}`);
    const objectPath = `submissions/${s.id}/${data.fieldKode}/${crypto.randomUUID()}-${sanitizeFilename(data.filename)}`;
    const signed = await createSignedUpload(BUCKET, objectPath);
    // Pre-create a pending row to track lifecycle (orphan if never finalized)
    await supabaseAdmin.from("form_submission_files").insert({
      submission_id: s.id,
      field_kode: data.fieldKode,
      storage_path: objectPath,
      mime: data.mime,
      size_bytes: data.sizeBytes,
      uploaded_by: userId,
      upload_started_at: new Date().toISOString(),
      finalized_at: null,
      cleanup_status: "pending_cleanup",
      provider: signed.provider,
    } as never);
    return {
      bucket: BUCKET,
      path: objectPath,
      provider: signed.provider,
      signedUrl: signed.signedUrl,
    };
  });

export const finalizeUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        submissionId: z.string().uuid(),
        fieldKode: z.string().min(1).max(60),
        storagePath: z.string().min(1).max(500),
        mime: z.string().max(120).optional(),
        sizeBytes: z.number().int().positive().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.uploadFinalize);
    await loadSubmissionOwned(data.submissionId, userId);
    const cfg = await loadStorageConfig();
    let realSize: number | null = data.sizeBytes ?? null;
    if (cfg.provider === "supabase") {
      // Verifikasi file ada di storage (hanya untuk Supabase; R2 dipercayakan ke client).
      const folder = data.storagePath.split("/").slice(0, -1).join("/");
      const filename = data.storagePath.split("/").pop() ?? "";
      const { data: ls } = await supabaseAdmin.storage.from(BUCKET).list(folder, { limit: 100 });
      const found = (ls ?? []).find((o) => o.name === filename);
      if (!found) throw new Error("File belum diunggah dengan benar");
      realSize = (found.metadata?.size as number | undefined) ?? data.sizeBytes ?? null;
    }
    if (realSize && realSize > 25 * 1024 * 1024) throw new Error("Ukuran file melebihi batas");
    // Cari pending row (dibuat saat createUploadSession). Jika tidak ada, insert (backward compat).
    const { data: existing } = await supabaseAdmin
      .from("form_submission_files")
      .select("id")
      .eq("submission_id", data.submissionId)
      .eq("storage_path", data.storagePath)
      .maybeSingle();
    if (existing) {
      const { data: row, error } = await supabaseAdmin
        .from("form_submission_files")
        .update({
          mime: data.mime ?? null,
          size_bytes: realSize,
          finalized_at: new Date().toISOString(),
          cleanup_status: "ok",
        } as never)
        .eq("id", existing.id)
        .eq("uploaded_by", userId)
        .select("id,storage_path,field_kode,mime,size_bytes")
        .single();
      if (error || !row) throw new Error(error?.message ?? "Gagal finalize");
      return row;
    }
    const { data: row, error } = await supabaseAdmin
      .from("form_submission_files")
      .insert({
        submission_id: data.submissionId,
        field_kode: data.fieldKode,
        storage_path: data.storagePath,
        mime: data.mime ?? null,
        size_bytes: realSize,
        uploaded_by: userId,
        finalized_at: new Date().toISOString(),
        cleanup_status: "ok",
        provider: cfg.provider,
      } as never)
      .select("id,storage_path,field_kode,mime,size_bytes")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Gagal menyimpan referensi file");
    return row;
  });

export const getSignedPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fileId: z.string().uuid(),
        ttlSeconds: z.number().int().min(30).max(900).default(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.uploadPreview);
    const ctx = await getUserContext(supabaseAdmin, userId);
    const { data: f } = await supabaseAdmin
      .from("form_submission_files")
      .select("storage_path, provider, submission_id, form_submissions!inner(user_id, opd_id, form_id, forms(opd_pemilik_id))")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!f || !f.storage_path) throw new Error("File tidak ditemukan");
    const sub = (f as { form_submissions: { user_id: string; opd_id: string | null; forms: { opd_pemilik_id: string | null } } }).form_submissions;
    const opd = sub.forms?.opd_pemilik_id ?? sub.opd_id;
    const allowed =
      canViewSubmission(ctx, { user_id: sub.user_id, opd_id: opd }) ||
      canReviewSubmission(ctx, { opd_id: opd });
    if (!allowed) throw new Error("Akses ditolak");
    const provider = ((f as { provider?: StorageProvider }).provider) ?? "supabase";
    const res = await createSignedDownload(BUCKET, f.storage_path, data.ttlSeconds, provider);
    return res;
  });

export const deleteSubmissionFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.uploadDelete);
    const { data: f } = await supabaseAdmin
      .from("form_submission_files")
      .select("id,storage_path,provider,submission_id, form_submissions!inner(user_id,status)")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!f || !f.storage_path) throw new Error("File tidak ditemukan");
    const sub = (f as { form_submissions: { user_id: string; status: string } }).form_submissions;
    if (sub.user_id !== userId) throw new Error("Akses ditolak");
    if (!["draft", "revision_required"].includes(sub.status)) {
      throw new Error("Tidak dapat hapus file pada status ini");
    }
    const provider = ((f as { provider?: StorageProvider }).provider) ?? "supabase";
    await removeObjects(BUCKET, [f.storage_path], provider);
    await supabaseAdmin.from("form_submission_files").delete().eq("id", f.id);
    return { ok: true };
  });
