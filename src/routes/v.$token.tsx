// Public: halaman verifikasi dokumen via token QR.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/v/$token")({
  head: ({ params }) => ({
    meta: [
      { title: `Verifikasi Dokumen ${params.token.slice(0, 8)}` },
      { name: "description", content: "Halaman verifikasi keaslian dokumen resmi." },
    ],
  }),
  component: Page,
});

type Row = { token: string; permohonan_id: string | null; nomor_surat: string | null; storage_path: string;
  sha256: string | null; signature_provider: string; created_at: string };

function Page() {
  const { token } = Route.useParams();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dokumen_verifikasi")
        .select("token,permohonan_id,nomor_surat,storage_path,sha256,signature_provider,created_at")
        .eq("token", token).maybeSingle();
      setRow(data as Row | null);
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 py-8">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Verifikasi Dokumen Resmi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p>Memuat…</p>
              : !row ? <p className="text-destructive">Token tidak ditemukan atau dokumen tidak valid.</p>
              : (
                <>
                  <p className="text-sm">Status: <span className="font-medium text-emerald-600">VALID</span></p>
                  <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Nomor Surat</dt><dd>{row.nomor_surat ?? "-"}</dd>
                    <dt className="text-muted-foreground">Diterbitkan</dt><dd>{new Date(row.created_at).toLocaleString("id-ID")}</dd>
                    <dt className="text-muted-foreground">Tanda tangan</dt><dd>{row.signature_provider}</dd>
                    <dt className="text-muted-foreground">SHA256</dt><dd className="break-all font-mono text-xs">{row.sha256 ?? "-"}</dd>
                    <dt className="text-muted-foreground">Token</dt><dd className="break-all font-mono text-xs">{row.token}</dd>
                  </dl>
                </>
              )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
