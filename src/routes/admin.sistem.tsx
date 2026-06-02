// F5.9 — Hub menu Sistem (Super Admin).
// Kumpulan kartu menuju seluruh halaman teknis. Route tujuan tetap menggunakan
// path existing (mis. /admin/system/*, /admin/governance, /admin/audit) agar
// tidak ada link mati. Akses dibatasi super_admin via SuperAdminOnly.
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Settings, Shield, ShieldCheck, FileClock, Database, Cloud, HardDrive,
  Activity, LifeBuoy, AlertTriangle, FolderOpen, ListChecks, ScanLine, Server,
} from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";

export const Route = createFileRoute("/admin/sistem")({
  head: () => ({
    meta: [
      { title: "Pengaturan Sistem — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <SistemHub />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Item = {
  to: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Konfigurasi & Tata Kelola",
    items: [
      { to: "/admin/config", label: "Konfigurasi Sistem", desc: "Mode akses, kebijakan global, dan pengaturan inti.", icon: Settings },
      { to: "/admin/governance", label: "Tata Kelola Sistem", desc: "Ringkasan governance dan skor kesehatan produksi.", icon: ShieldCheck },
      { to: "/admin/security/permissions", label: "Pengaturan Hak Akses", desc: "Matriks permission per pengguna dan per role.", icon: Shield },
      { to: "/admin/system/feature-flags", label: "Pengaturan Fitur", desc: "Aktif/nonaktifkan fitur tanpa redeploy.", icon: ListChecks },
      { to: "/admin/system/settings", label: "Audit Konfigurasi", desc: "Riwayat perubahan pengaturan sistem.", icon: FileClock },
    ],
  },
  {
    title: "Data & Riwayat",
    items: [
      { to: "/admin/audit", label: "Riwayat Aktivitas", desc: "Audit log pengguna dan sistem dengan filter & ekspor.", icon: FileClock },
      { to: "/admin/verifikasi-log", label: "Log Verifikasi", desc: "Jejak verifikasi akun warga dan staff.", icon: ScanLine },
      { to: "/admin/system/retention", label: "Retensi Data", desc: "Kebijakan penyimpanan dan pembersihan data lama.", icon: Database },
    ],
  },
  {
    title: "Penyimpanan & Backup",
    items: [
      { to: "/admin/storage", label: "File & Dokumen", desc: "Telusuri file pada bucket penyimpanan.", icon: FolderOpen },
      { to: "/admin/system/storage-provider", label: "Penyedia Penyimpanan", desc: "Pilih Lovable Cloud atau Cloudflare R2.", icon: Cloud },
      { to: "/admin/backup", label: "Backup Data", desc: "Ekspor & impor data sistem.", icon: HardDrive },
      { to: "/admin/system/backup-status", label: "Status Backup", desc: "Pantau snapshot backup terakhir dan usianya.", icon: Database },
    ],
  },
  {
    title: "Operasional & Pemulihan",
    items: [
      { to: "/admin/system-health", label: "Status Sistem", desc: "Cron, queue, dead-letter, dan diagnostik runtime.", icon: Activity },
      { to: "/admin/system/load-readiness", label: "Kesiapan Sistem", desc: "Indikator beban dan kapasitas sebelum go-live.", icon: Server },
      { to: "/admin/system/disaster-recovery", label: "Pemulihan Sistem", desc: "Prosedur dan checklist disaster recovery.", icon: LifeBuoy },
      { to: "/admin/system/go-live", label: "Go-Live Checklist", desc: "Kesiapan rilis ke produksi.", icon: AlertTriangle },
      { to: "/admin/system/uat", label: "UAT", desc: "Skenario User Acceptance Testing dan hasilnya.", icon: ListChecks },
    ],
  },
];

function SistemHub() {
  return (
    <AdminShell breadcrumb={[{ label: "Pengaturan Sistem" }]}>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Pengaturan Sistem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Area khusus Super Admin untuk konfigurasi teknis, audit, backup, dan pemulihan sistem.
          Menu di halaman ini disembunyikan dari sidebar agar dashboard tetap ringkas.
        </p>
      </div>
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <Link
                  key={it.to}
                  to={it.to}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-soft transition hover:border-primary hover:bg-primary-soft"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                    <it.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">{it.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{it.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
