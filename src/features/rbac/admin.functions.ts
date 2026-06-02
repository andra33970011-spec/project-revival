// Server functions untuk UI manajemen RBAC.
// Hardening B6:
//  - assertSuper untuk operasi sensitif (lihat audit, grant permission elevated).
//  - assertSuperOrPemda untuk grant role admin_opd / admin_desa.
//  - super_admin role hanya bisa di-grant via DB (sudah dilindungi trigger).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getUserContext } from "./guards";

async function assertSuper(userId: string) {
  const ctx = await getUserContext(supabaseAdmin, userId);
  if (!ctx.isSuper) throw new Error("Forbidden: hanya Super Admin");
}

async function assertSuperOrPemda(userId: string) {
  const ctx = await getUserContext(supabaseAdmin, userId);
  if (!ctx.isElevated) throw new Error("Forbidden: hanya Super Admin / Admin Pemda");
}

// Daftar permission yang dianggap "elevated" — grant via override hanya
// boleh dilakukan super_admin / admin_pemda.
const ELEVATED_PERMS = new Set<string>([
  "can_manage_users",
  "can_manage_roles",
  "can_manage_opd",
  "can_view_audit_logs",
  "can_approve_registration",
]);


export const rbacListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().trim().max(80).optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    let q = supabaseAdmin
      .from("profiles")
      .select("id,nama_lengkap,nip,jabatan,asn_type,system_position,opd_id, opd:opd!opd_id(singkatan,nama)")
      .order("nama_lengkap")
      .limit(200);
    if (data.q && data.q.length >= 2) {
      const like = `%${data.q.replace(/[%_]/g, "")}%`;
      q = q.or(`nama_lengkap.ilike.${like},nip.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.id);
    const roles = ids.length
      ? (await supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids)).data ?? []
      : [];
    const grouped = new Map<string, string[]>();
    for (const r of roles) {
      const arr = grouped.get(r.user_id) ?? [];
      arr.push(r.role as string);
      grouped.set(r.user_id, arr);
    }
    return {
      rows: (rows ?? []).map((r) => ({ ...r, roles: grouped.get(r.id) ?? [] })),
    };
  });

export const rbacGetUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    const [{ data: prof }, { data: roles }, { data: overrides }, { data: effective }, { data: allPerms }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,nama_lengkap,nip,jabatan,asn_type,system_position,opd_id, opd:opd!opd_id(singkatan,nama)").eq("id", data.user_id).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user_id),
        supabaseAdmin.from("user_permissions").select("permission_code,granted,expires_at,reason,granted_by,created_at").eq("user_id", data.user_id),
        supabaseAdmin.rpc("get_effective_permissions", { _user_id: data.user_id }),
        supabaseAdmin.from("permissions").select("code,label,kategori,description").order("kategori").order("code"),
      ]);
    return {
      profile: prof,
      roles: (roles ?? []).map((r) => r.role),
      overrides: overrides ?? [],
      effective: (effective ?? []).map((e: { permission_code: string }) => e.permission_code),
      catalog: allPerms ?? [],
    };
  });

export const rbacUpdateProfileMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      asn_type: z.enum(["pns", "pppk_penuh_waktu", "pppk_paruh_waktu", "honorer"]).nullable().optional(),
      system_position: z.enum([
        "kepala_opd", "sekretaris", "kepala_bidang", "kepala_sekolah",
        "operator", "verifikator", "staff", "guru", "tenaga_teknis", "lainnya",
      ]).nullable().optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    const patch: { asn_type?: typeof data.asn_type; system_position?: typeof data.system_position } = {};
    if (data.asn_type !== undefined) patch.asn_type = data.asn_type;
    if (data.system_position !== undefined) patch.system_position = data.system_position;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rbacSetPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      permission_code: z.string().min(1).max(80),
      granted: z.boolean(),
      expires_at: z.string().datetime().nullable().optional(),
      reason: z.string().max(500).optional(),
    }).parse(i))
  .handler(async ({ data, context }) => {
    // Elevated permission → super_admin / admin_pemda. Permission biasa → super_admin.
    if (ELEVATED_PERMS.has(data.permission_code)) {
      await assertSuperOrPemda(context.userId);
    } else {
      await assertSuper(context.userId);
    }
    const { data: existing } = await supabaseAdmin
      .from("user_permissions").select("id")
      .eq("user_id", data.user_id).eq("permission_code", data.permission_code).maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin.from("user_permissions").update({
        granted: data.granted,
        expires_at: data.expires_at ?? null,
        reason: data.reason ?? null,
        granted_by: context.userId,
      }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_permissions").insert({
        user_id: data.user_id,
        permission_code: data.permission_code,
        granted: data.granted,
        expires_at: data.expires_at ?? null,
        reason: data.reason ?? null,
        granted_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });


export const rbacRemovePermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ user_id: z.string().uuid(), permission_code: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    // F4.1 — soft-revoke: keep audit trail instead of hard delete.
    const { error } = await supabaseAdmin.from("user_permissions")
      .update({ granted: false, revoked_at: new Date().toISOString(), revoked_by: context.userId })
      .eq("user_id", data.user_id).eq("permission_code", data.permission_code)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rbacAuditForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertSuper(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("rbac_audit")
      .select("id,created_at,user_id,target_user_id,aksi,entitas,data_sebelum,data_sesudah")
      .or(`target_user_id.eq.${data.user_id},user_id.eq.${data.user_id}`)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).flatMap((r) => [r.user_id, r.target_user_id]).filter((x): x is string => !!x)));
    const profMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,nama_lengkap").in("id", ids);
      for (const p of profs ?? []) profMap.set(p.id, p.nama_lengkap ?? "");
    }
    return { rows: (rows ?? []).map((r) => ({ ...r, actor_name: r.user_id ? profMap.get(r.user_id) ?? "" : "", target_name: r.target_user_id ? profMap.get(r.target_user_id) ?? "" : "" })) };
  });

export const rbacAuditList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    void context;
    const { data, error } = await supabaseAdmin
      .from("rbac_audit")
      .select("id,created_at,user_id,target_user_id,aksi,entitas,data_sebelum,data_sesudah")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.target_user_id]).filter((x): x is string => !!x)));
    const profMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id,nama_lengkap").in("id", ids);
      for (const p of profs ?? []) profMap.set(p.id, p.nama_lengkap ?? "");
    }
    return {
      rows: rows.map((r) => ({
        ...r,
        actor: r.user_id ? { nama_lengkap: profMap.get(r.user_id) ?? "" } : null,
        target: r.target_user_id ? { nama_lengkap: profMap.get(r.target_user_id) ?? "" } : null,
      })),
    };
  });

