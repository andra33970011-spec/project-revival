// Admin OPD / Super admin: kelola pengajuan izin (approve/reject).
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { listIzinAdmin, decideIzin } from "@/lib/asn-izin.functions";

export const Route = createFileRoute("/admin/izin")({
  head: () => ({ meta: [{ title: "Kelola Pengajuan Izin ASN" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><Page /></AdminGuard>),
});

type Row = {
  id: string; user_id: string; opd_id: string | null;
  jenis: string; dari: string; sampai: string; alasan: string;
  lampiran_url: string | null; status: string; catatan_approval: string | null;
  created_at: string;
  profile: { nama_lengkap: string | null; nip: string | null } | null;
  opd: { nama: string; singkatan: string } | null;
};

const JENIS_LABEL: Record<string, string> = {
  cuti_tahunan: "Cuti Tahunan", cuti_sakit: "Cuti Sakit",
  dinas_luar: "Dinas Luar", wfh: "WFH", lainnya: "Lainnya",
};

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "dibatalkan" | "">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await listIzinAdmin({ data: status ? { status } : {} });
      setRows((r as { rows: Row[] }).rows);
    } catch (e) { toast.error((e as Error).message); }
  }, [status]);

  useEffect(() => { reload(); }, [reload]);

  async function decide(id: string, st: "approved" | "rejected") {
    let catatan: string | undefined;
    if (st === "rejected") {
      const v = prompt("Catatan penolakan (wajib, min 1 char):") ?? "";
      if (!v.trim()) return;
      catatan = v.trim();
    } else {
      const v = prompt("Catatan persetujuan (opsional):") ?? "";
      catatan = v.trim() || undefined;
    }
    setBusy(id);
    try {
      await decideIzin({ data: { id, status: st, catatan } });
      toast.success(st === "approved" ? "Disetujui" : "Ditolak");
      reload();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <AdminGuard>
      <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Pengajuan Izin" }]}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold">Pengajuan Izin ASN</h1>
            <select value={status} onChange={(e) => setStatus(e.target.value as never)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Semua status</option>
              <option value="pending">Pending</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">ASN</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3">Alasan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Belum ada pengajuan.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.profile?.nama_lengkap ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{r.profile?.nip ?? "-"} · {r.opd?.singkatan ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">{JENIS_LABEL[r.jenis] ?? r.jenis}</td>
                    <td className="px-4 py-3 text-xs">{r.dari} → {r.sampai}</td>
                    <td className="px-4 py-3 text-xs max-w-[260px]">
                      {r.alasan}
                      {r.lampiran_url && <a href={r.lampiran_url} target="_blank" rel="noopener" className="ml-1 text-primary underline">[lampiran]</a>}
                      {r.catatan_approval && <div className="mt-1 italic text-muted-foreground">→ {r.catatan_approval}</div>}
                    </td>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button disabled={busy === r.id} onClick={() => decide(r.id, "approved")}
                            className="h-8 rounded-md bg-success/15 px-3 text-xs font-semibold text-success disabled:opacity-50">Setujui</button>
                          <button disabled={busy === r.id} onClick={() => decide(r.id, "rejected")}
                            className="h-8 rounded-md bg-destructive/15 px-3 text-xs font-semibold text-destructive disabled:opacity-50">Tolak</button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminShell>
    </AdminGuard>
  );
}
