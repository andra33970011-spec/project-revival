// F5.4 — Disaster Recovery procedures (super_admin).
import { createFileRoute } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/system/disaster-recovery")({
  head: () => ({ meta: [{ title: "Disaster Recovery — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

const PROCS = [
  {
    title: "Database Failure",
    rto: "1 jam", rpo: "24 jam (snapshot harian)",
    steps: [
      "Verifikasi outage via /admin/system/backup-status & cloud status.",
      "Hubungi tim infrastruktur Lovable Cloud.",
      "Bila perlu restore: pilih snapshot terbaru dari backup_snapshot.",
      "Validasi count baris pada permohonan, profiles, audit_log setelah restore.",
      "Jalankan /admin/system/go-live untuk smoke test.",
    ],
  },
  {
    title: "Storage Failure",
    rto: "2 jam", rpo: "tergantung backup bucket",
    steps: [
      "Cek bucket: berkas-permohonan, form-submissions, aset-foto, pejabat-foto.",
      "Re-trigger storage-cleanup hook bila orphan.",
      "Restore file kritis dari snapshot eksternal bila tersedia.",
    ],
  },
  {
    title: "Realtime Failure",
    rto: "15 menit", rpo: "tidak ada (best-effort delivery)",
    steps: [
      "Realtime manager auto-reconnect dengan exponential backoff (max 30s).",
      "Fallback polling 30s aktif otomatis bila gagal subscribe.",
      "Periksa Network → WebSocket di browser admin.",
    ],
  },
  {
    title: "Cron Failure",
    rto: "1 jam", rpo: "tergantung job (max 24j)",
    steps: [
      "Cek cron_history & dead_letter_jobs di /admin/governance.",
      "Replay manual job via /admin/system-health.",
      "Jalankan endpoint manual: /api/public/hooks/retention-cleanup, /api/public/hooks/cleanup-uploads, dll.",
    ],
  },
];

function Page() {
  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Disaster Recovery" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Disaster Recovery</h1>
      <p className="mb-4 text-sm text-muted-foreground">Prosedur pemulihan per skenario kegagalan.</p>
      <div className="space-y-4">
        {PROCS.map((p) => (
          <div key={p.title} className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{p.title}</h2>
              <div className="text-xs text-muted-foreground">RTO: <strong>{p.rto}</strong> · RPO: <strong>{p.rpo}</strong></div>
            </div>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
              {p.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
