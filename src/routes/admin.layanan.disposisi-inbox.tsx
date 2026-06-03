// Admin: inbox disposisi (semua role admin/asn yang menerima disposisi).
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { myDisposisiInbox, actDisposisi } from "@/lib/disposisi.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/layanan/disposisi-inbox")({
  head: () => ({ meta: [{ title: "Inbox Disposisi" }, { name: "robots", content: "noindex" }] }),
  component: () => <AdminGuard><AdminShell title="Inbox Disposisi"><Page /></AdminShell></AdminGuard>,
});

type Row = {
  id: string; level: string; note: string | null; status: string;
  created_at: string; permohonan_id: string;
  permohonan: { kode: string; judul: string; status: string } | null;
};

function Page() {
  const fnList = useServerFn(myDisposisiInbox);
  const fnAct = useServerFn(actDisposisi);
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const res = await fnList({ data: undefined });
    setRows(res.rows as unknown as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function act(id: string, action: "accept" | "done" | "reject") {
    try { await fnAct({ data: { id, action } }); toast.success("OK"); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Disposisi untuk Saya</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada disposisi aktif.</p>}
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  <Link to="/permohonan/$id" params={{ id: r.permohonan_id }} className="text-primary underline">
                    {r.permohonan?.kode}
                  </Link>{" "}— {r.permohonan?.judul}
                </div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("id-ID")}</div>
              </div>
              <Badge variant="outline">{r.level}</Badge>
            </div>
            {r.note && <p className="mt-2 text-sm">{r.note}</p>}
            <div className="mt-2 flex gap-2">
              {r.status === "pending" && <Button size="sm" onClick={() => act(r.id, "accept")}>Terima</Button>}
              {r.status === "accepted" && <Button size="sm" onClick={() => act(r.id, "done")}>Selesaikan</Button>}
              <Button size="sm" variant="outline" onClick={() => act(r.id, "reject")}>Tolak</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
