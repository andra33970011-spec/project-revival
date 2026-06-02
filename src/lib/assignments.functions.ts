// Assignment engine: resolusi target → form_assignments + notifikasi.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext, canAccessAssignment } from "@/features/rbac/guards";
import { enqueueMany } from "./notifications.functions";
import { log, newCorrelationId } from "./logger";
import { checkRateLimit } from "@/integrations/supabase/rate-limit.server";
import { casUpdate, CasConflictError } from "./db/cas";
import { withIdempotency, idemKey } from "./http/idempotency";

type TargetRow = { target_type: string; target_value: string };

/**
 * Memutuskan kumpulan user_id yang harus dapat assignment untuk form
 * berdasarkan baris form_targets. Server-side resolution.
 */
async function resolveTargetUserIds(formId: string, formOpdId: string | null): Promise<
  Array<{ user_id: string; opd_id: string | null }>
> {
  const { data: targets } = await supabaseAdmin
    .from("form_targets")
    .select("target_type,target_value")
    .eq("form_id", formId);
  const t = (targets ?? []) as TargetRow[];
  // Set untuk dedupe
  const out = new Map<string, { user_id: string; opd_id: string | null }>();

  // 1. user spesifik
  const userIds = t.filter((x) => x.target_type === "user").map((x) => x.target_value);
  if (userIds.length) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,opd_id")
      .in("id", userIds);
    for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
  }

  // 2. role-based
  const roles = t.filter((x) => x.target_type === "role").map((x) => x.target_value);
  if (roles.length) {
    const { data: roleUsers } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", roles as never[]);
    const ids = [...new Set((roleUsers ?? []).map((r) => r.user_id))];
    if (ids.length) {
      const { data } = await supabaseAdmin.from("profiles").select("id,opd_id").in("id", ids);
      for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
    }
  }

  // 3. opd-based
  const opds = t.filter((x) => x.target_type === "opd").map((x) => x.target_value);
  if (opds.length) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,opd_id")
      .in("opd_id", opds);
    for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
  }

  // 4. asn_type
  const asnTypes = t.filter((x) => x.target_type === "asn_type").map((x) => x.target_value);
  if (asnTypes.length) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,opd_id")
      .in("asn_type", asnTypes as never[]);
    for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
  }

  // 5. system_position
  const sysPos = t.filter((x) => x.target_type === "system_position").map((x) => x.target_value);
  if (sysPos.length) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,opd_id")
      .in("system_position", sysPos as never[]);
    for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
  }

  // 6. fallback: jika tidak ada target, default ke OPD pemilik form
  if (out.size === 0 && formOpdId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id,opd_id")
      .eq("opd_id", formOpdId);
    for (const p of data ?? []) out.set(p.id, { user_id: p.id, opd_id: p.opd_id });
  }

  return [...out.values()];
}

/** Dipanggil dari publishForm. */
export async function generateAssignmentsForForm(formId: string): Promise<number> {
  const { data: form } = await supabaseAdmin
    .from("forms")
    .select("id,opd_pemilik_id,deadline,judul")
    .eq("id", formId)
    .single();
  if (!form) return 0;
  const users = await resolveTargetUserIds(formId, form.opd_pemilik_id);
  if (users.length === 0) return 0;
  // Upsert assignment (skip yang sudah ada).
  const { data: existing } = await supabaseAdmin
    .from("form_assignments")
    .select("user_id")
    .eq("form_id", formId);
  const have = new Set((existing ?? []).map((e) => e.user_id));
  const toInsert = users.filter((u) => !have.has(u.user_id));
  if (toInsert.length === 0) return 0;
  const rows = toInsert.map((u) => ({
    form_id: formId,
    user_id: u.user_id,
    opd_id: u.opd_id,
    status: "assigned" as const,
    due_at: form.deadline ?? null,
  }));
  const { error } = await supabaseAdmin.from("form_assignments").insert(rows);
  if (error) throw new Error(error.message);
  await enqueueMany(
    toInsert.map((u) => ({
      userId: u.user_id,
      tipe: "form.assigned",
      judul: `Tugas baru: ${form.judul}`,
      body: form.deadline ? `Tenggat: ${new Date(form.deadline).toLocaleDateString("id-ID")}` : null,
      link: `/asn/tugas`,
      meta: { form_id: formId },
    })),
  );
  return toInsert.length;
}

export const listMyAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["assigned", "in_progress", "submitted", "overdue"]).optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    let q = supabaseAdmin
      .from("form_assignments")
      .select(
        "id,form_id,status,due_at,assigned_at,opd_id, forms(id,judul,deskripsi,status,deadline)",
        { count: "exact" },
      )
      .eq("user_id", userId)
      .order("assigned_at", { ascending: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const ctx = await getUserContext(supabaseAdmin, userId);
    const { data: a } = await supabaseAdmin
      .from("form_assignments")
      .select("*, forms(id,judul,deskripsi,schema_snapshot,deadline,status,opd_pemilik_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!a) throw new Error("Assignment tidak ditemukan");
    if (!canAccessAssignment(ctx, { user_id: a.user_id, opd_id: a.opd_id })) {
      throw new Error("Akses ditolak");
    }
    // Ambil submission terkait user (terbaru)
    const { data: sub } = await supabaseAdmin
      .from("form_submissions")
      .select("*")
      .eq("assignment_id", a.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { assignment: a, submission: sub ?? null };
  });

/**
 * User menandai assignment-nya `in_progress` (saat mulai mengerjakan).
 * Transisi lain (`submitted`, `overdue`) dikelola server: `submitted` di-set
 * oleh submitSubmission; `overdue` di-set oleh cron reminder.
 */
export const updateAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["in_progress"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const correlationId = newCorrelationId();
    const rl = await checkRateLimit(userId, "assignment.update", 20, 60);
    if (!rl.ok) {
      log.warn("assignment.update.rate_limited", { userId, correlationId, id: data.id });
      throw new Error("Terlalu banyak permintaan, coba lagi sebentar");
    }
    const key = idemKey("assignment:update", userId, { id: data.id, status: data.status });
    return withIdempotency(key, 10_000, async () => {
      const { data: a } = await supabaseAdmin
        .from("form_assignments")
        .select("id,user_id,status,version_number")
        .eq("id", data.id)
        .maybeSingle();
      if (!a) throw new Error("Assignment tidak ditemukan");
      if (a.user_id !== userId) throw new Error("Akses ditolak");
      if (a.status !== "assigned") {
        log.info("assignment.update.noop", { userId, correlationId, id: data.id, status: a.status });
        return { ok: true, status: a.status };
      }
      try {
        await casUpdate<{ status: string }, { id: string }>({
          client: supabaseAdmin,
          table: "form_assignments",
          id: data.id,
          expectedVersion: (a as { version_number: number }).version_number,
          next: { status: "in_progress" },
        });
        log.info("assignment.update.ok", { userId, correlationId, id: data.id });
        return { ok: true, status: "in_progress" as const };
      } catch (e) {
        if (e instanceof CasConflictError) {
          log.warn("assignment.update.cas_conflict", { userId, correlationId, id: data.id });
          return { ok: false, code: "CAS_CONFLICT" as const, status: a.status };
        }
        throw e;
      }
    });
  });
