// Pagar tambahan: hanya super_admin yang bisa melihat isi halaman teknis.
// Non-super_admin (admin_opd, admin_desa, admin_pemda, dll) mendapat 403.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { loading, isSuperAdmin } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
        Memuat…
      </div>
    );
  }
  if (!isSuperAdmin) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-surface px-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-3 font-display text-xl font-bold text-foreground">403 — Akses Khusus Super Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Halaman sistem ini hanya dapat diakses oleh Super Admin. Hubungi Super Admin jika Anda memerlukan akses.
          </p>
          <Link
            to="/admin"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
