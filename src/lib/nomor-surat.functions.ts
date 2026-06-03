// Sprint A — Nomor Surat Resmi
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const issueNomorSurat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ permohonan_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: p } = await supabaseAdmin
      .from("permohonan").select("id,opd_id,nomor_surat").eq("id", data.permohonan_id).maybeSingle();
    if (!p || !p.opd_id) throw new Error("Permohonan tidak valid");
    if (p.nomor_surat) return { nomor: p.nomor_surat, already: true };
    const { data: nomor, error } = await context.supabase.rpc("fn_generate_nomor_surat", {
      _opd_id: p.opd_id, _permohonan_id: data.permohonan_id,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "nomor_surat.issue", entitas: "permohonan",
      entitas_id: data.permohonan_id, data_sesudah: { nomor },
    });
    return { nomor: nomor as string, already: false };
  });

export const previewNomorFormat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ opd_id: z.string().uuid(), format: z.string().max(100).optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const { data: opd } = await supabaseAdmin
      .from("opd").select("singkatan,nomor_surat_format,nomor_surat_kode")
      .eq("id", data.opd_id).maybeSingle();
    const fmt = data.format ?? opd?.nomor_surat_format ?? "{kode}/{seq}/{singkatan}/{tahun}";
    const tahun = new Date().getFullYear();
    const preview = fmt
      .replace("{kode}", opd?.nomor_surat_kode ?? "470")
      .replace("{seq}", "001")
      .replace("{singkatan}", opd?.singkatan ?? "OPD")
      .replace("{tahun}", String(tahun));
    return { preview, format: fmt };
  });
