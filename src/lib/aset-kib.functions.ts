// Sprint C — KIB mapping (A..F)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "@/features/rbac/guards";

const KIB = ["A", "B", "C", "D", "E", "F"] as const;

export const setAsetKib = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      aset_ids: z.array(z.string().uuid()).min(1).max(500),
      kib: z.enum(KIB),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    if (!c.isSuper && !c.isAdminOpd) throw new Error("Forbidden");
    // Cek aset milik OPD admin
    if (!c.isSuper) {
      const { data: rows } = await supabaseAdmin.from("aset").select("id,opd_id").in("id", data.aset_ids);
      if ((rows ?? []).some((r) => r.opd_id !== c.opdId)) throw new Error("Ada aset di luar OPD Anda");
    }
    const { error } = await supabaseAdmin.from("aset").update({ kib: data.kib } as never).in("id", data.aset_ids);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: context.userId, aksi: "aset.kib_set", entitas: "aset",
      entitas_id: data.aset_ids[0], data_sesudah: { kib: data.kib, count: data.aset_ids.length } as never,
    });
    return { ok: true, updated: data.aset_ids.length };
  });

export const kibSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ opd_id: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const c = await getUserContext(supabaseAdmin, context.userId);
    const opd = c.isSuper ? (data.opd_id ?? null) : c.opdId;
    let q = supabaseAdmin.from("aset").select("kib,id");
    if (opd) q = q.eq("opd_id", opd);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, "-": 0 };
    (rows ?? []).forEach((r) => {
      const k = (r as { kib: string | null }).kib ?? "-";
      counts[k] = (counts[k] ?? 0) + 1;
    });
    return { counts, total: rows?.length ?? 0 };
  });
