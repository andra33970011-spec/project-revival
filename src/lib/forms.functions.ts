// Server functions: form builder runtime (CRUD draft, publish dengan
// snapshot schema, archive).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext, canManageFormCtx } from "@/features/rbac/guards";
import {
  formFieldSchema,
  type FormField,
  type FormSchemaSnapshot,
} from "@/features/forms/schema/types";
import { generateAssignmentsForForm } from "./assignments.functions";
import { enforceRateLimit, RateLimits } from "./security/rate-limit";

async function requireFormAccess(formId: string, userId: string) {
  const { data: form, error } = await supabaseAdmin
    .from("forms")
    .select("id,opd_pemilik_id,status,created_by")
    .eq("id", formId)
    .maybeSingle();
  if (error || !form) throw new Error("Form tidak ditemukan");
  const ctx = await getUserContext(supabaseAdmin, userId);
  if (!canManageFormCtx(ctx, form.opd_pemilik_id ?? null)) {
    throw new Error("Akses ditolak");
  }
  return { form, ctx };
}

export const listForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["draft", "published", "archived"]).optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: typeof supabaseAdmin; userId: string };
    const ctx = await getUserContext(supabaseAdmin, userId);
    let q = supabase
      .from("forms")
      .select("id,judul,deskripsi,status,opd_pemilik_id,deadline,created_at,published_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(data.page * data.pageSize, data.page * data.pageSize + data.pageSize - 1);
    if (data.status) q = q.eq("status", data.status);
    if (!ctx.isElevated && ctx.isAdminOpd && ctx.opdId) q = q.eq("opd_pemilik_id", ctx.opdId);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const getForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { form } = await requireFormAccess(data.id, userId);
    const [{ data: fields }, { data: targets }] = await Promise.all([
      supabaseAdmin.from("form_fields").select("*").eq("form_id", data.id).order("urutan"),
      supabaseAdmin.from("form_targets").select("*").eq("form_id", data.id),
    ]);
    const { data: full } = await supabaseAdmin
      .from("forms")
      .select("*")
      .eq("id", data.id)
      .single();
    return { form: full, fields: fields ?? [], targets: targets ?? [] };
  });

export const createForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        judul: z.string().trim().min(3).max(200),
        deskripsi: z.string().max(2000).optional().nullable(),
        opd_pemilik_id: z.string().uuid().optional().nullable(),
        deadline: z.string().datetime().optional().nullable(),
        allow_multiple_submit: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const ctx = await getUserContext(supabaseAdmin, userId);
    if (!ctx.isElevated && !ctx.isAdminOpd) throw new Error("Akses ditolak");
    const opdId = ctx.isElevated ? data.opd_pemilik_id ?? null : ctx.opdId;
    const { data: row, error } = await supabaseAdmin
      .from("forms")
      .insert({
        judul: data.judul,
        deskripsi: data.deskripsi ?? null,
        opd_pemilik_id: opdId,
        deadline: data.deadline ?? null,
        allow_multiple_submit: data.allow_multiple_submit,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Gagal membuat form");
    return { id: row.id };
  });

export const updateFormMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        judul: z.string().trim().min(3).max(200).optional(),
        deskripsi: z.string().max(2000).optional().nullable(),
        deadline: z.string().datetime().optional().nullable(),
        allow_multiple_submit: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { form } = await requireFormAccess(data.id, userId);
    if (form.status !== "draft") throw new Error("Form yang sudah dipublish tidak bisa diubah metadatanya");
    const payload: {
      judul?: string;
      deskripsi?: string | null;
      deadline?: string | null;
      allow_multiple_submit?: boolean;
    } = {};
    if (data.judul !== undefined) payload.judul = data.judul;
    if (data.deskripsi !== undefined) payload.deskripsi = data.deskripsi;
    if (data.deadline !== undefined) payload.deadline = data.deadline;
    if (data.allow_multiple_submit !== undefined) payload.allow_multiple_submit = data.allow_multiple_submit;
    const { error } = await supabaseAdmin.from("forms").update(payload).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
export const saveFormFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        fields: z.array(formFieldSchema).min(0).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { form } = await requireFormAccess(data.id, userId);
    if (form.status !== "draft") throw new Error("Hanya form draft yang field-nya bisa diubah");
    // Hapus & insert ulang (sederhana untuk draft kecil).
    await supabaseAdmin.from("form_fields").delete().eq("form_id", data.id);
    if (data.fields.length > 0) {
      const rows = data.fields.map((f, i) => ({
        form_id: data.id,
        kode: f.kode,
        label: f.label,
        tipe: f.tipe,
        required: f.required,
        placeholder: f.placeholder ?? null,
        help_text: f.help_text ?? null,
        options: f.options as never,
        validation: f.validation as never,
        urutan: f.urutan ?? i,
      }));
      const { error } = await supabaseAdmin.from("form_fields").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveFormTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        targets: z
          .array(
            z.object({
              target_type: z.enum(["opd", "asn_type", "role", "position", "unit_kerja", "individu"]),
              target_value: z.string().min(1).max(80),
            }),
          )
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { form } = await requireFormAccess(data.id, userId);
    if (form.status === "archived") throw new Error("Form arsip tidak bisa diubah");
    await supabaseAdmin.from("form_targets").delete().eq("form_id", data.id);
    if (data.targets.length > 0) {
      const { error } = await supabaseAdmin.from("form_targets").insert(
        data.targets.map((t) => ({
          form_id: data.id,
          target_type: t.target_type,
          target_value: t.target_value,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const publishForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await enforceRateLimit(userId, RateLimits.formPublish);
    const { form } = await requireFormAccess(data.id, userId);
    if (form.status !== "draft") throw new Error("Hanya form draft yang bisa dipublish");
    const { data: fields } = await supabaseAdmin
      .from("form_fields")
      .select("*")
      .eq("form_id", data.id)
      .order("urutan");
    if (!fields || fields.length === 0) throw new Error("Form harus memiliki minimal 1 field");
    const snapshot: FormSchemaSnapshot = {
      version: 1,
      fields: fields.map((f, i) => ({
        kode: f.kode,
        label: f.label,
        tipe: f.tipe as FormField["tipe"],
        required: !!f.required,
        placeholder: f.placeholder ?? null,
        help_text: f.help_text ?? null,
        options: ((f.options as unknown as FormField["options"]) ?? []) as FormField["options"],
        validation: ((f.validation as unknown as FormField["validation"]) ?? {}) as FormField["validation"],
        urutan: typeof f.urutan === "number" ? f.urutan : i,
      })),
      publishedAt: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("forms")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: userId,
        schema_snapshot: snapshot as never,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const generated = await generateAssignmentsForForm(data.id);
    return { ok: true, assignments: generated };
  });

export const archiveForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireFormAccess(data.id, userId);
    const { error } = await supabaseAdmin
      .from("forms")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
