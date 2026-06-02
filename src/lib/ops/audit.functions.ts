// F4.2 — Audit explorer server fns with cursor pagination + filters.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decodeCursor, encodeCursor } from "@/lib/db/cursor";

async function assertViewer(userId: string) {
  const { data: isSuper } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (isSuper === true) return;
  // admin_pemda role may not exist in enum; rely on permission flag below.
  const { data: hasPerm } = await supabaseAdmin.rpc("has_permission", { _user_id: userId, _code: "can_view_audit_logs" });
  if (hasPerm !== true) throw new Error("Forbidden");
}

const FilterSchema = z.object({
  actor_email: z.string().max(120).optional(),
  entitas: z.string().max(80).optional(),
  entitas_id: z.string().max(120).optional(),
  aksi: z.string().max(80).optional(),
  request_id: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

function applyFilters<T>(q: T, f: z.infer<typeof FilterSchema>): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = q;
  if (f.actor_email) query = query.ilike("user_email", `%${f.actor_email.replace(/[%_]/g, "")}%`);
  if (f.entitas) query = query.eq("entitas", f.entitas);
  if (f.entitas_id) query = query.eq("entitas_id", f.entitas_id);
  if (f.aksi) query = query.ilike("aksi", `%${f.aksi.replace(/[%_]/g, "")}%`);
  if (f.request_id) query = query.eq("request_id", f.request_id);
  if (f.from) query = query.gte("created_at", f.from);
  if (f.to) query = query.lte("created_at", f.to);
  return query as T;
}

export const auditExplorerList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FilterSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertViewer((context as { userId: string }).userId);
    let q = supabaseAdmin
      .from("audit_log")
      .select("id,created_at,user_email,aksi,entitas,entitas_id,request_id,data_sebelum,data_sesudah")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.limit);
    q = applyFilters(q, data);
    const cur = decodeCursor(data.cursor);
    if (cur) {
      q = q.or(`created_at.lt.${cur.ts},and(created_at.eq.${cur.ts},id.lt.${cur.id})`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const last = list[list.length - 1];
    const nextCursor = list.length === data.limit && last
      ? encodeCursor({ ts: last.created_at as string, id: last.id as string })
      : null;
    return { items: list, nextCursor };
  });

export const auditDistinctEntities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertViewer((context as { userId: string }).userId);
    const { data } = await supabaseAdmin
      .from("audit_log").select("entitas").not("entitas", "is", null).limit(1000);
    const set = new Set<string>((data ?? []).map((r) => r.entitas).filter((x): x is string => !!x));
    return Array.from(set).sort();
  });
