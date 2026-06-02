import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { opdAttendanceToday } from "@/lib/asn-advanced.functions";
import { asetCompliance } from "@/lib/aset-advanced.functions";

export const Route = createFileRoute("/admin/eksekutif")({
  head: () => ({ meta: [{ title: "Dashboard Pimpinan" }, { name: "robots", content: "noindex" }] }),
  component: () => (<AdminGuard><Page /></AdminGuard>),
});

function Page() {
  const [att, setAtt] = useState<{ total_asn: number; hadir: number; terlambat: number; belum_hadir: number } | null>(null);
  const [aset, setAset] = useState<{ total: number; aktif: number; rusak: number; hilang: number; maintenance: number; terverifikasi_90d: number; belum_verifikasi: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = await opdAttendanceToday({ data: { opd_id: null } }).catch(() => null);
        if (a) setAtt(a as never);
        const s = await asetCompliance({ data: { opd_id: null } });
        setAset(s as never);
      } catch (e) { toast.error((e as Error).message); }
    })();
  }, []);

  return (
    <AdminShell breadcrumb={[{ label: "Admin", to: "/admin" }, { label: "Dashboard Pimpinan" }]}>
      <div className="space-y-8">
        <h1 className="font-display text-2xl font-bold">Dashboard Pimpinan</h1>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Kehadiran ASN Hari Ini</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Total ASN", v: att?.total_asn ?? 0 },
              { l: "Hadir", v: att?.hadir ?? 0 },
              { l: "Terlambat", v: att?.terlambat ?? 0 },
              { l: "Belum Hadir", v: att?.belum_hadir ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-2xl font-bold">{k.v}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Kepatuhan Aset</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { l: "Total Aset", v: aset?.total ?? 0 },
              { l: "Aktif", v: aset?.aktif ?? 0 },
              { l: "Rusak", v: aset?.rusak ?? 0 },
              { l: "Hilang", v: aset?.hilang ?? 0 },
              { l: "Maintenance", v: aset?.maintenance ?? 0 },
              { l: "Terverifikasi 90 hari", v: aset?.terverifikasi_90d ?? 0 },
              { l: "Belum Verifikasi", v: aset?.belum_verifikasi ?? 0 },
            ].map((k) => (
              <div key={k.l} className="rounded-xl border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{k.l}</div>
                <div className="mt-1 text-2xl font-bold">{k.v}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
