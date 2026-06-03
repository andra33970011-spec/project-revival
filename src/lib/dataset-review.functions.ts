// Sprint D: Dataset submission approval workflow (additive).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

async function ctx(userId: string) {
  return await getUserContext(supabaseAdmin, userId);
}

export const listPendingReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      status: z.enum(["pending", "approved", "rejected", "revision"]).default("pending"),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(100).default(20),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const c = await ctx((context as { userId: string }).userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    let q = supabaseAdmin
      .from("dataset_submission")
      .select("id, template_id, oleh_user_id, opd_id, data, review_status, submitted_at, reviewed_at, review_note", { count: "exact" })
      .eq("review_status", data.status)
      .order("submitted_at", { ascending: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    if (!c.isSuper && c.opdId) q = q.eq("opd_id", c.opdId);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const reviewSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      submissionId: z.string().uuid(),
      aksi: z.enum(["approve", "reject", "request_revision", "comment"]),
      catatan: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = (context as { userId: string }).userId;
    const c = await ctx(userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("dataset_submission").select("id, opd_id").eq("id", data.submissionId).maybeSingle();
    if (subErr || !sub) throw new Error("Submission tidak ditemukan");
    if (!c.isSuper && c.opdId && sub.opd_id !== c.opdId) throw new Error("Forbidden");

    const { error: insErr } = await supabaseAdmin.from("dataset_submission_review").insert({
      submission_id: data.submissionId,
      reviewer_id: userId,
      aksi: data.aksi,
      catatan: data.catatan ?? null,
    });
    if (insErr) throw new Error(insErr.message);

    if (data.aksi !== "comment") {
      const map = { approve: "approved", reject: "rejected", request_revision: "revision" } as const;
      const { error: upErr } = await supabaseAdmin.from("dataset_submission").update({
        review_status: map[data.aksi],
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.catatan ?? null,
      }).eq("id", data.submissionId);
      if (upErr) throw new Error(upErr.message);
    }
    return { ok: true };
  });

export const getReviewHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ submissionId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("dataset_submission_review")
      .select("id, aksi, catatan, reviewer_id, created_at")
      .eq("submission_id", data.submissionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
