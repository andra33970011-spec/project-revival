// Sprint A — Disposisi berjenjang
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const dispose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      permohonan_id: z.string().uuid(),
      to_user: z.string().uuid(),
      level: z.enum(["kepala_opd", "kabid", "staf", "review"]),
      note: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("submission_dispositions")
      .insert({
        permohonan_id: data.permohonan_id,
        from_user: context.userId,
        to_user: data.to_user,
        level: data.level,
        note: data.note ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("permohonan").update({ current_disposition_id: row.id }).eq("id", data.permohonan_id);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId,
      aksi: "disposisi.create",
      entitas: "permohonan",
      entitas_id: data.permohonan_id,
      data_sesudah: { to_user: data.to_user, level: data.level },
    });
    return { id: row.id };
  });

export const myDisposisiInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("submission_dispositions")
      .select("id,level,note,status,created_at,permohonan_id, permohonan:permohonan!permohonan_id(kode,judul,status)")
      .eq("to_user", context.userId)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const actDisposisi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["accept", "done", "reject"]),
      note: z.string().max(1000).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const status = data.action === "accept" ? "accepted" : data.action === "done" ? "done" : "rejected";
    const { error } = await context.supabase
      .from("submission_dispositions")
      .update({ status, acted_at: new Date().toISOString(), note: data.note ?? undefined })
      .eq("id", data.id)
      .eq("to_user", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDisposisiByPermohonan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ permohonan_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("submission_dispositions")
      .select("id,from_user,to_user,level,note,status,created_at,acted_at")
      .eq("permohonan_id", data.permohonan_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
