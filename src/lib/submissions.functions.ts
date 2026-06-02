// Submission runtime: draft, autosave, submit, review, audit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getUserContext,
  canViewSubmission,
  canReviewSubmission,
} from "@/features/rbac/guards";
import { buildSubmissionValidator } from "@/features/forms/schema/validator";
import type { FormSchemaSnapshot } from "@/features/forms/schema/types";
import { enqueueNotification } from "./notifications.functions";
import { assertTransition, type SubmissionState } from "@/features/forms/schema/state-machine";
import { log, newCorrelationId } from "./logger";
import { enforceRateLimit, RateLimits } from "./security/rate-limit";
import { withIdempotency, idemKey } from "./http/idempotency";

/** Stale-state error class for compare-and-swap detection. */
class StaleSubmissionError extends Error {
  constructor() {
    super("Submission telah diubah pihak lain. Muat ulang dan coba lagi.");
    this.name = "StaleSubmissionError";
  }
}

async function loadFormAndAssignment(opts: { assignmentId?: string; formId?: string; userId: string }) {
  if (opts.assignmentId) {
    const { data: a } = await supabaseAdmin
      .from("form_assignments")
      .select("id,form_id,user_id,opd_id, forms(id,opd_pemilik_id,status,schema_snapshot,judul)")
      .eq("id", opts.assignmentId)
      .maybeSingle();
    if (!a || a.user_id !== opts.userId) throw new Error("Assignment tidak valid");
    return { assignment: a, form: (a as { forms: unknown }).forms as { id: string; opd_pemilik_id: string | null; status: string; schema_snapshot: unknown; judul: string } };
  }
  if (opts.formId) {
    const { data: f } = await supabaseAdmin
      .from("forms")
      .select("id,opd_pemilik_id,status,schema_snapshot,judul")
      .eq("id", opts.formId)
      .maybeSingle();
    if (!f) throw new Error("Form tidak ditemukan");
    return { assignment: null, form: f };
  }
  throw new Error("assignmentId atau formId diperlukan");
}

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        submissionId: z.string().uuid().optional(),
        assignmentId: z.string().uuid().optional(),
        formId: z.string().uuid().optional(),
        data: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.submissionDraft);
    const ctx = await getUserContext(supabaseAdmin, userId);
    if (data.submissionId) {
      // update draft existing — compare-and-swap pada version_number
      const { data: s } = await supabaseAdmin
        .from("form_submissions")
        .select("id,user_id,status,form_id,version_number")
        .eq("id", data.submissionId)
        .maybeSingle();
      if (!s || s.user_id !== userId) throw new Error("Submission tidak valid");
      if (!["draft", "revision_required"].includes(s.status)) {
        throw new Error("Submission tidak dapat diedit pada status ini");
      }
      const nextStatus: SubmissionState = s.status === "revision_required" ? "draft" : (s.status as SubmissionState);
      if (s.status !== nextStatus) assertTransition(s.status as SubmissionState, nextStatus);
      const { data: upd, error } = await supabaseAdmin
        .from("form_submissions")
        .update({ data: data.data as never, status: nextStatus })
        .eq("id", s.id)
        .eq("version_number", s.version_number) // optimistic CAS
        .select("id");
      if (error) throw new Error(error.message);
      if (!upd || upd.length === 0) {
        log.warn("submission.saveDraft.stale", { userId, submissionId: s.id });
        throw new StaleSubmissionError();
      }
      return { id: s.id };
    }
    const { assignment, form } = await loadFormAndAssignment({
      assignmentId: data.assignmentId,
      formId: data.formId,
      userId,
    });
    const { data: row, error } = await supabaseAdmin
      .from("form_submissions")
      .insert({
        form_id: form.id,
        assignment_id: assignment?.id ?? null,
        user_id: userId,
        opd_id: ctx.opdId,
        status: "draft",
        data: data.data as never,
        schema_version_snapshot: form.schema_snapshot as never,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Gagal membuat draft");
    return { id: row.id };
  });

export const submitSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ submissionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const correlationId = newCorrelationId();
    await enforceRateLimit(userId, RateLimits.submissionSubmit);
    const key = idemKey("submission:submit", userId, data.submissionId);
    return withIdempotency(key, 300_000, async () => {
    const { data: s } = await supabaseAdmin
      .from("form_submissions")
      .select("*, forms(id,judul,opd_pemilik_id,schema_snapshot)")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!s || s.user_id !== userId) throw new Error("Submission tidak valid");
    if (!["draft", "revision_required"].includes(s.status)) {
      throw new Error(`Tidak dapat submit dari status ${s.status}`);
    }
    const snapshot = (s.schema_version_snapshot ?? (s.forms as { schema_snapshot: unknown })?.schema_snapshot) as FormSchemaSnapshot;
    if (!snapshot || !Array.isArray(snapshot.fields)) throw new Error("Schema form tidak tersedia");
    const validator = buildSubmissionValidator(snapshot);
    const parsed = validator.safeParse(s.data ?? {});
    if (!parsed.success) {
      throw new Error("Validasi gagal: " + parsed.error.issues.map((i) => i.message).join("; "));
    }
    assertTransition(s.status as SubmissionState, "submitted");
    // Versioning snapshot
    const { data: latest } = await supabaseAdmin
      .from("form_submission_versions")
      .select("version")
      .eq("submission_id", s.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVer = (latest?.version ?? 0) + 1;
    const { data: files } = await supabaseAdmin
      .from("form_submission_files")
      .select("id,field_kode,storage_path,mime,size_bytes")
      .eq("submission_id", s.id);
    await supabaseAdmin.from("form_submission_versions").insert({
      submission_id: s.id,
      version: nextVer,
      data: parsed.data as never,
      files: (files ?? []) as never,
      created_by: userId,
    });
    const { data: upd, error } = await supabaseAdmin
      .from("form_submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), data: parsed.data as never })
      .eq("id", s.id)
      .eq("version_number", s.version_number)
      .select("id");
    if (error) throw new Error(error.message);
    if (!upd || upd.length === 0) {
      log.warn("submission.submit.stale", { userId, submissionId: s.id });
      throw new StaleSubmissionError();
    }
    // Update assignment status
    if (s.assignment_id) {
      await supabaseAdmin.from("form_assignments").update({ status: "submitted" }).eq("id", s.assignment_id);
    }
    // Notify form owner OPD admins
    const opdPemilik = (s.forms as { opd_pemilik_id: string | null })?.opd_pemilik_id;
    if (opdPemilik) {
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin_opd");
      for (const a of admins ?? []) {
        // filter by same OPD
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("opd_id")
          .eq("id", a.user_id)
          .maybeSingle();
        if (p?.opd_id === opdPemilik) {
          await enqueueNotification({
            userId: a.user_id,
            tipe: "form.submitted",
            judul: `Submission baru: ${(s.forms as { judul: string }).judul}`,
            link: `/admin/submission-review`,
            meta: { submission_id: s.id },
          });
        }
      }
    }
    log.info("submission.submit.ok", { userId, correlationId, submissionId: s.id });
    return { id: s.id, status: "submitted" as const };
    });
  });

const reviewInput = z.object({
  submissionId: z.string().uuid(),
  note: z.string().trim().max(2000).optional().nullable(),
  expectedVersion: z.number().int().positive().optional(),
});

async function reviewerOrThrow(submissionId: string, userId: string) {
  const { data: s } = await supabaseAdmin
    .from("form_submissions")
    .select("*, forms(id,judul,opd_pemilik_id)")
    .eq("id", submissionId)
    .maybeSingle();
  if (!s) throw new Error("Submission tidak ditemukan");
  const ctx = await getUserContext(supabaseAdmin, userId);
  const opd = (s.forms as { opd_pemilik_id: string | null })?.opd_pemilik_id ?? s.opd_id;
  if (!canReviewSubmission(ctx, { opd_id: opd })) throw new Error("Akses ditolak");
  return s;
}

async function transitionReview(
  submissionId: string,
  userId: string,
  to: SubmissionState,
  note: string | null | undefined,
  expectedVersion?: number,
) {
  await enforceRateLimit(userId, RateLimits.submissionReview);
  const s = await reviewerOrThrow(submissionId, userId);
  if (!note && (to === "rejected" || to === "revision_required")) {
    throw new Error("Catatan wajib untuk reject / request revision");
  }
  assertTransition(s.status as SubmissionState, to);
  // Optimistic concurrency: client may pass expectedVersion, otherwise use server read.
  const cas = expectedVersion ?? (s as { version_number: number }).version_number;
  const { data: upd, error } = await supabaseAdmin
    .from("form_submissions")
    .update({
      status: to,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    })
    .eq("id", submissionId)
    .eq("version_number", cas)
    .select("id");
  if (error) throw new Error(error.message);
  if (!upd || upd.length === 0) {
    log.warn("submission.review.stale", { userId, submissionId, to });
    throw new StaleSubmissionError();
  }
  log.info("submission.review.ok", { userId, submissionId, to });
  // notify submitter
  await enqueueNotification({
    userId: s.user_id,
    tipe: `form.${to}`,
    judul: `Submission "${(s.forms as { judul: string }).judul}" ${to}`,
    body: note ?? null,
    link: `/asn/tugas`,
    meta: { submission_id: s.id, status: to },
    dedupeKey: `${s.id}:${to}`,
  });
  // Jika revision_required + ada assignment, kembalikan assignment ke in_progress
  if (to === "revision_required" && s.assignment_id) {
    await supabaseAdmin.from("form_assignments").update({ status: "in_progress" }).eq("id", s.assignment_id);
  }
  return { id: submissionId, status: to };
}

export const approveSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return transitionReview(data.submissionId, userId, "approved", data.note, data.expectedVersion);
  });

export const rejectSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return transitionReview(data.submissionId, userId, "rejected", data.note, data.expectedVersion);
  });

export const requestRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return transitionReview(data.submissionId, userId, "revision_required", data.note, data.expectedVersion);
  });

export const listForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["submitted", "under_review", "approved", "rejected", "revision_required"]).optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const ctx = await getUserContext(supabaseAdmin, userId);
    let q = supabaseAdmin
      .from("form_submissions")
      .select("id,form_id,user_id,opd_id,status,submitted_at,reviewed_at, forms(judul,opd_pemilik_id), profiles!form_submissions_user_id_fkey(nama_lengkap)", { count: "exact" })
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    if (data.status) q = q.eq("status", data.status);
    if (!ctx.isElevated && ctx.isAdminOpd && ctx.opdId) {
      // RLS akan filter, tapi kita tambahkan eksplisit untuk paging benar.
      const { data: formIds } = await supabaseAdmin
        .from("forms")
        .select("id")
        .eq("opd_pemilik_id", ctx.opdId);
      const ids = (formIds ?? []).map((f) => f.id);
      if (ids.length === 0) return { rows: [], total: 0 };
      q = q.in("form_id", ids);
    }
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const ctx = await getUserContext(supabaseAdmin, userId);
    const { data: s } = await supabaseAdmin
      .from("form_submissions")
      .select("*, forms(id,judul,deskripsi,schema_snapshot,opd_pemilik_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!s) throw new Error("Submission tidak ditemukan");
    const opd = (s.forms as { opd_pemilik_id: string | null })?.opd_pemilik_id ?? s.opd_id;
    if (!canViewSubmission(ctx, { user_id: s.user_id, opd_id: opd })) {
      throw new Error("Akses ditolak");
    }
    const { data: files } = await supabaseAdmin
      .from("form_submission_files")
      .select("id,field_kode,storage_path,mime,size_bytes,created_at")
      .eq("submission_id", s.id)
      .order("created_at");
    return { submission: s, files: files ?? [] };
  });
