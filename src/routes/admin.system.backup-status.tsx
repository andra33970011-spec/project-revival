// F4.4 — Backup Status (super_admin).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell, StatCard } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { Database, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/system/backup-status")({
  head: () => ({ meta: [{ title: "Backup Status — Admin" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <Page />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

type Snap = { id: string; created_at: string; label: string; tipe: string; size_bytes: number; table_counts: Record<string, number> | null };

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Page() {
  const [rows, setRows] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("backup_snapshot").select("id,created_at,label,tipe,size_bytes,table_counts").order("created_at", { ascending: false }).limit(10).then(({ data }) => {
      setRows((data ?? []) as Snap[]);
      setLoading(false);
    });
  }, []);

  const latest = rows[0];
  const ageH = latest ? (Date.now() - new Date(latest.created_at).getTime()) / 3_600_000 : null;
  const tables = latest?.table_counts ? Object.keys(latest.table_counts) : [];
  const checklist = [
    { item: "Schema backup", ok: tables.length > 0 },
    { item: "Settings backup", ok: tables.includes("app_setting") },
    { item: "Profiles backup", ok: tables.includes("profiles") },
    { item: "Permohonan backup", ok: tables.includes("permohonan") },
  ];

  return (
    <AdminShell breadcrumb={[{ label: "System" }, { label: "Backup Status" }]}>
      <h1 className="mb-1 font-display text-2xl font-bold">Backup & Restore Verification</h1>
      <p className="mb-4 text-sm text-muted-foreground">Status snapshot terkini dan verifikasi cakupan. Tidak menggantikan backup database tingkat infrastruktur.</p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Backup Terakhir" value={latest ? new Date(latest.created_at).toLocaleString("id-ID") : "—"} icon={Database} />
        <StatCard label="Usia (jam)" value={ageH !== null ? ageH.toFixed(1) : "—"} tone={ageH !== null && ageH < 48 ? "success" : "destructive"} />
        <StatCard label="Ukuran" value={latest ? fmtBytes(latest.size_bytes) : "—"} />
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-soft">
        <h2 className="mb-3 font-semibold">Checklist Cakupan</h2>
        <ul className="space-y-2 text-sm">
          {checklist.map((c) => (
            <li key={c.item} className="flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${c.ok ? "text-success" : "text-muted-foreground"}`} />
              <span>{c.item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Tipe</th><th className="px-4 py-3">Ukuran</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Memuat…</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("id-ID")}</td>
                <td className="px-4 py-3">{r.label}</td>
                <td className="px-4 py-3 text-xs">{r.tipe}</td>
                <td className="px-4 py-3 text-xs">{fmtBytes(r.size_bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
