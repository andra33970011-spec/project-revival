// Guard untuk halaman pimpinan / admin pemda. Read-only friendly.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

type Mode = "executive" | "pemda";

export function ExecutiveGuard({ children, mode = "executive" }: { children: ReactNode; mode?: Mode }) {
  const { loading, user, isSuperAdmin, isAdminPemda, isPimpinan } = useAuth();
  // Executive: pimpinan + admin_pemda + super. Pemda: admin_pemda + super.
  const allowed = mode === "executive"
    ? isSuperAdmin || isAdminPemda || isPimpinan
    : isSuperAdmin || isAdminPemda;

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-surface text-sm text-muted-foreground">Memuat…</div>;
  }
  if (!user) {
    return (
      <Gate
        title="Masuk diperlukan"
        msg="Silakan masuk dengan akun pimpinan atau admin pemda."
        cta={{ to: "/auth", label: "Masuk Akun" }}
      />
    );
  }
  if (!allowed) {
    return (
      <Gate
        title="Akses ditolak"
        msg="Akun Anda tidak memiliki akses ke dashboard ini."
        cta={{ to: "/", label: "Kembali ke Beranda" }}
      />
    );
  }
  return <>{children}</>;
}

function Gate({ title, msg, cta }: { title: string; msg: string; cta: { to: string; label: string } }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-soft">
        <h1 className="font-display text-xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
        <Link
          to={cta.to}
          className="mt-4 inline-flex h-10 items-center rounded-md bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}
