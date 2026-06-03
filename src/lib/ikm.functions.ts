// Sprint A — IKM 9 unsur (PermenPAN-RB 14/2017)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Unsur = z.number().int().min(1).max(4);

export const submitIkm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      survey_id: z.string().uuid(),
      permohonan_id: z.string().uuid().optional(),
      u1: Unsur, u2: Unsur, u3: Unsur, u4: Unsur, u5: Unsur,
      u6: Unsur, u7: Unsur, u8: Unsur, u9: Unsur,
      saran: z.string().max(2000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ikm_responses").insert({
      survey_id: data.survey_id,
      permohonan_id: data.permohonan_id ?? null,
      user_id: context.userId,
      u1: data.u1, u2: data.u2, u3: data.u3, u4: data.u4, u5: data.u5,
      u6: data.u6, u7: data.u7, u8: data.u8, u9: data.u9,
      saran: data.saran ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getIkmDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ survey_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: agg } = await supabaseAdmin.rpc("fn_ikm_dashboard", { _survey_id: data.survey_id });
    return { agg: (agg ?? null) as unknown as Record<string, number | string | null> | null };
  });

export const listIkmSurveys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ikm_surveys")
      .select("id,judul,periode,opd_id,aktif,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const createIkmSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      judul: z.string().min(1).max(200),
      periode: z.string().min(1).max(40),
      opd_id: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ikm_surveys").insert({
      judul: data.judul, periode: data.periode, opd_id: data.opd_id ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public read (untuk halaman /ikm/$id), pakai admin client karena perlu fetch survey aktif
export const getPublicIkmSurvey = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("ikm_surveys").select("id,judul,periode,aktif,opd_id").eq("id", data.id).maybeSingle();
    if (!row || !row.aktif) throw new Error("Survey tidak tersedia");
    return row;
  });
