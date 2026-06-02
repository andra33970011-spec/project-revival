// Server-side authorization layer — SINGLE SOURCE OF TRUTH (Tahap B).
// Semua server fn (loader, mutation, upload, approval) WAJIB mengambil
// AuthzContext dari `getUserContext` dan menggunakan helper di file ini
// alih-alih melakukan role-check manual. RLS tetap menjadi backstop.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Permission } from "./constants";

type SB = SupabaseClient<Database>;

// ============================================================
// Shared user context — dipakai semua helper authorization.
// Memuat: roles, opd_id, desa, status pimpinan (pejabat aktif).
// ============================================================
export type AuthzContext = {
  userId: string;
  opdId: string | null;
  desa: string | null;
  roleSet: Set<string>;
  isSuper: boolean;
  isPemda: boolean;
  isAdminOpd: boolean;
  isAdminDesa: boolean;
  isAsn: boolean;
  isPimpinan: boolean;
  /** Super admin / Admin Pemda — punya cakupan lintas-OPD. */
  isElevated: boolean;
};

export async function getUserContext(supabase: SB, userId: string): Promise<AuthzContext> {
  const [{ data: profile }, { data: roles }, { data: pej }] = await Promise.all([
    supabase.from("profiles").select("opd_id,desa").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("pejabat").select("is_pimpinan").eq("user_id", userId).eq("aktif", true).maybeSingle(),
  ]);
  const roleSet = new Set((roles ?? []).map((r) => r.role as string));
  const isSuper = roleSet.has("super_admin");
  const isPemda = roleSet.has("admin_pemda");
  return {
    userId,
    opdId: (profile?.opd_id as string | null) ?? null,
    desa: (profile?.desa as string | null) ?? null,
    roleSet,
    isSuper,
    isPemda,
    isAdminOpd: roleSet.has("admin_opd"),
    isAdminDesa: roleSet.has("admin_desa"),
    isAsn: roleSet.has("asn"),
    isPimpinan: !!pej?.is_pimpinan,
    isElevated: isSuper || isPemda,
  };
}

// ============================================================
// Permission primitives.
// ============================================================
export async function userHasPermission(
  supabase: SB,
  userId: string,
  code: Permission,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _code: code,
  });
  if (error) return false;
  return Boolean(data);
}

export async function requirePermissionOrThrow(
  supabase: SB,
  userId: string,
  code: Permission,
): Promise<void> {
  const ok = await userHasPermission(supabase, userId, code);
  if (!ok) throw new Error(`Akses ditolak: izin '${code}' tidak dimiliki.`);
}

/** Lempar Forbidden kalau cek async menghasilkan false. */
export async function assertOrThrow(check: Promise<boolean>, msg = "Forbidden"): Promise<void> {
  if (!(await check)) throw new Error(msg);
}

// ============================================================
// Role-level assertions (terbatas, hanya untuk operasi sangat
// sensitif yang tidak terikat permission catalog).
// ============================================================
export function isElevated(ctx: AuthzContext): boolean {
  return ctx.isElevated;
}

export function isSameOpd(ctx: AuthzContext, opdId: string | null): boolean {
  return !!opdId && ctx.opdId === opdId;
}

export function isSameDesa(ctx: AuthzContext, desa: string | null): boolean {
  return !!desa && ctx.desa === desa;
}

// ============================================================
// Domain helpers — semua menerima AuthzContext (sudah di-fetch
// di handler) supaya tidak double-roundtrip ke DB.
// ============================================================

export function canManageFormCtx(ctx: AuthzContext, formOpdId: string | null): boolean {
  if (ctx.isElevated) return true;
  if (ctx.isAdminOpd && isSameOpd(ctx, formOpdId)) return true;
  return false;
}

export function canAccessForm(
  ctx: AuthzContext,
  form: { opd_pemilik_id?: string | null; opd_id?: string | null; target_role?: string | null; target_scope?: string | null; target_opd_ids?: string[] | null },
): boolean {
  if (ctx.isElevated) return true;
  const formOpd = form.opd_pemilik_id ?? form.opd_id ?? null;
  if (ctx.isAdminOpd && isSameOpd(ctx, formOpd)) return true;
  // ASN: scope-based access
  if (!ctx.isAsn) return false;
  if (form.target_scope === "lintas_opd") return true;
  if (form.target_scope === "spesifik") {
    return !!ctx.opdId && (form.target_opd_ids ?? []).includes(ctx.opdId);
  }
  // opd_sendiri (default)
  return isSameOpd(ctx, formOpd);
}

export function canSubmitForm(ctx: AuthzContext, assignment: { user_id?: string | null }): boolean {
  // Submitter harus pemilik assignment.
  return !!assignment.user_id && assignment.user_id === ctx.userId;
}

export function canViewSubmission(
  ctx: AuthzContext,
  submission: { user_id?: string | null; oleh_user_id?: string | null; opd_id?: string | null },
): boolean {
  const owner = submission.user_id ?? submission.oleh_user_id ?? null;
  if (owner === ctx.userId) return true;
  if (ctx.isElevated) return true;
  if (ctx.isAdminOpd && isSameOpd(ctx, submission.opd_id ?? null)) return true;
  if (ctx.isPimpinan && isSameOpd(ctx, submission.opd_id ?? null)) return true;
  return false;
}

export function canReviewSubmission(ctx: AuthzContext, submission: { opd_id?: string | null }): boolean {
  if (ctx.isElevated) return true;
  return ctx.isAdminOpd && isSameOpd(ctx, submission.opd_id ?? null);
}

export function canAccessAssignment(
  ctx: AuthzContext,
  assignment: { user_id?: string | null; opd_id?: string | null },
): boolean {
  if (assignment.user_id === ctx.userId) return true;
  if (ctx.isElevated) return true;
  return ctx.isAdminOpd && isSameOpd(ctx, assignment.opd_id ?? null);
}

export function canUploadDocument(ctx: AuthzContext, target: { opd_id?: string | null }): boolean {
  if (ctx.isElevated) return true;
  // ASN & Admin OPD boleh upload di scope OPD-nya.
  if ((ctx.isAdminOpd || ctx.isAsn) && isSameOpd(ctx, target.opd_id ?? null)) return true;
  return false;
}

export function canShareDocument(
  ctx: AuthzContext,
  doc: { owner_user_id?: string | null; opd_id?: string | null },
): boolean {
  if (ctx.isElevated) return true;
  if (doc.owner_user_id === ctx.userId) return true;
  return ctx.isAdminOpd && isSameOpd(ctx, doc.opd_id ?? null);
}

export function canRequestDocument(ctx: AuthzContext): boolean {
  // Semua staff (admin/asn) boleh mengajukan permintaan dokumen.
  return ctx.isElevated || ctx.isAdminOpd || ctx.isAdminDesa || ctx.isAsn;
}

// ============================================================
// Legacy async helpers (tetap dipertahankan untuk back-compat
// pemanggil yang hanya punya userId). Internally pakai
// getUserContext + permission RPC.
// ============================================================

export async function canManageForm(
  supabase: SB,
  userId: string,
  formOpdId: string | null,
): Promise<boolean> {
  const ctx = await getUserContext(supabase, userId);
  if (canManageFormCtx(ctx, formOpdId)) return true;
  return userHasPermission(supabase, userId, "can_manage_forms" as Permission);
}

export async function canVerifySubmission(
  supabase: SB,
  userId: string,
  submissionOpdId: string | null,
): Promise<boolean> {
  const ctx = await getUserContext(supabase, userId);
  if (canReviewSubmission(ctx, { opd_id: submissionOpdId })) return true;
  return userHasPermission(supabase, userId, "can_verify_submission" as Permission);
}

export async function canApproveDataRequest(
  supabase: SB,
  userId: string,
  targetOpdId: string | null,
): Promise<boolean> {
  const ctx = await getUserContext(supabase, userId);
  if (ctx.isElevated) return true;
  if (ctx.isAdminOpd && isSameOpd(ctx, targetOpdId)) return true;
  return userHasPermission(supabase, userId, "can_approve_data_request" as Permission);
}

export async function canApproveRegistration(
  supabase: SB,
  userId: string,
  candidateOpdId: string | null,
): Promise<boolean> {
  const ctx = await getUserContext(supabase, userId);
  if (ctx.isElevated) return true;
  if (ctx.isAdminOpd && isSameOpd(ctx, candidateOpdId)) return true;
  return userHasPermission(supabase, userId, "can_approve_registration" as Permission);
}

export async function canAccessSubmission(
  supabase: SB,
  userId: string,
  submission: { user_id: string; opd_id: string | null },
): Promise<boolean> {
  if (submission.user_id === userId) return true;
  return canVerifySubmission(supabase, userId, submission.opd_id);
}
