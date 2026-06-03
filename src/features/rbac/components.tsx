// Komponen UI deklaratif untuk gating berbasis permission/role.
// Penyesuaian cerdas: render fallback informatif, hindari flicker saat loading.
import type { ReactNode } from "react";
import { ShieldAlert, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useCan } from "./hooks";
import { ROLE_LABEL, ASN_TYPE_LABEL, POSITION_LABEL, type Permission, type AppRole } from "./constants";

type GateProps = {
  permission?: Permission | Permission[];
  role?: AppRole | AppRole[];
  /** Render apa pun selain anak kalau tidak diizinkan. `null` menyembunyikan. */
  fallback?: ReactNode;
  /** Hide selama auth masih loading agar tidak flash. Default true. */
  hideWhileLoading?: boolean;
  children: ReactNode;
};

/**
 * PermissionGate — sembunyikan/ganti UI bila user tidak punya permission/role.
 * Super admin selalu lolos (via useCan).
 */
export function PermissionGate({ permission, role, fallback = null, hideWhileLoading = true, children }: GateProps) {
  const { loading, isSuperAdmin, roles } = useAuth();
  const canPerm = useCan(permission ?? ([] as Permission[]));
  if (loading) return hideWhileLoading ? null : <>{children}</>;
  if (isSuperAdmin) return <>{children}</>;

  const permOk = permission ? canPerm : true;
  const roleOk = role
    ? (Array.isArray(role) ? role : [role]).some((r) => roles.includes(r))
    : true;

  if (permOk && roleOk) return <>{children}</>;
  return <>{fallback}</>;
}

/**
 * AccessDenied — fallback siap pakai dengan pesan jelas.
 */
export function AccessDenied({ message, backTo = "/" }: { message?: string; backTo?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center px-4">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-soft">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="mt-3 font-display text-lg font-bold">Akses Ditolak</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? "Anda tidak memiliki izin untuk membuka halaman/fitur ini."}
        </p>
        <Link to={backTo} className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
          Kembali
        </Link>
      </div>
    </div>
  );
}

/**
 * RoleBadge — chip seragam untuk role.
 */
export function RoleBadge({ role, className = "" }: { role: AppRole; className?: string }) {
  const tone: Record<AppRole, string> = {
    super_admin: "bg-destructive/10 text-destructive border-destructive/30",
    admin_pemda: "bg-accent/15 text-accent border-accent/30",
    pimpinan: "bg-gold/20 text-gold-foreground border-gold/40",
    admin_opd: "bg-primary/10 text-primary border-primary/30",
    admin_desa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    asn: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30",
    warga: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone[role]} ${className}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

/**
 * Tampilkan ringkasan klasifikasi ASN (asn_type + system_position) jika ada.
 */
export function AsnClassificationBadge() {
  const { asnType, systemPosition } = useAuth();
  if (!asnType && !systemPosition) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {asnType && (
        <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {ASN_TYPE_LABEL[asnType]}
        </span>
      )}
      {systemPosition && (
        <span className="inline-flex items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {POSITION_LABEL[systemPosition]}
        </span>
      )}
    </div>
  );
}

/**
 * RequiresPermission — alert kecil saat permission tidak dimiliki (untuk inline hint).
 */
export function RequiresPermissionHint({ permission }: { permission: Permission | Permission[] }) {
  const can = useCan(permission);
  if (can) return null;
  const list = Array.isArray(permission) ? permission : [permission];
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>Butuh izin: <span className="font-mono">{list.join(", ")}</span>. Hubungi Super Admin untuk pemberian akses.</span>
    </div>
  );
}
