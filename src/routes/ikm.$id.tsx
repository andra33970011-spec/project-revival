// Public: form IKM 9 unsur sesuai PermenPAN-RB 14/2017.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPublicIkmSurvey, submitIkm } from "@/lib/ikm.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/ikm/$id")({
  head: () => ({ meta: [{ title: "Survei IKM — Layanan Publik" }] }),
  component: Page,
});

const UNSUR = [
  ["u1", "Persyaratan pelayanan"],
  ["u2", "Prosedur pelayanan"],
  ["u3", "Waktu penyelesaian"],
  ["u4", "Biaya/tarif"],
  ["u5", "Produk spesifikasi jenis layanan"],
  ["u6", "Kompetensi pelaksana"],
  ["u7", "Perilaku pelaksana"],
  ["u8", "Penanganan pengaduan, saran, masukan"],
  ["u9", "Sarana dan prasarana"],
] as const;

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fnGet = useServerFn(getPublicIkmSurvey);
  const fnSubmit = useServerFn(submitIkm);
  const [survey, setSurvey] = useState<{ judul: string; periode: string } | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [saran, setSaran] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fnGet({ data: { id } }).then((s) => setSurvey(s)).catch(() => setSurvey(null));
  }, [id, fnGet]);

  async function submit() {
    if (UNSUR.some(([k]) => !values[k])) {
      toast.error("Mohon isi seluruh unsur"); return;
    }
    setBusy(true);
    try {
      await fnSubmit({ data: {
        survey_id: id,
        u1: values.u1, u2: values.u2, u3: values.u3, u4: values.u4, u5: values.u5,
        u6: values.u6, u7: values.u7, u8: values.u8, u9: values.u9,
        saran: saran || undefined,
      } });
      toast.success("Terima kasih atas penilaian Anda");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 py-8">
        <Card className="mx-auto max-w-3xl">
          <CardHeader>
            <CardTitle>Survei Kepuasan Masyarakat</CardTitle>
            {survey && <p className="text-sm text-muted-foreground">{survey.judul} — {survey.periode}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!survey ? <p>Survei tidak tersedia.</p> : (
              <>
                <p className="text-sm text-muted-foreground">Penilaian: 1 (Tidak Baik) sampai 4 (Sangat Baik). Sesuai PermenPAN-RB No. 14/2017.</p>
                <div className="space-y-3">
                  {UNSUR.map(([k, label]) => (
                    <div key={k} className="rounded-md border p-3">
                      <div className="mb-2 text-sm font-medium">{label}</div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((n) => (
                          <button key={n} type="button"
                            className={`h-10 w-10 rounded border text-sm ${values[k] === n ? "bg-primary text-primary-foreground" : "bg-background"}`}
                            onClick={() => setValues((v) => ({ ...v, [k]: n }))}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-medium">Saran (opsional)</label>
                  <Textarea value={saran} onChange={(e) => setSaran(e.target.value)} maxLength={2000} rows={4} />
                </div>
                <Button onClick={submit} disabled={busy}>{busy ? "Mengirim…" : "Kirim Penilaian"}</Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
