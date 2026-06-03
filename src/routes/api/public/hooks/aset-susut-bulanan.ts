// Cron hook: jalankan penyusutan bulanan untuk periode aktif (tanggal 1, 02:00)
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function periodeNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const Route = createFileRoute("/api/public/hooks/aset-susut-bulanan")({
  server: {
    handlers: {
      POST: async () => {
        const periode = periodeNow();
        const { data, error } = await supabaseAdmin.rpc("fn_susut_bulanan_run", { _periode: periode });
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, periode, result: data }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
