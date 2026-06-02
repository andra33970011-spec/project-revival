// Cron daily: kirim notifikasi H-1 / overdue untuk permohonan yang masih
// berstatus baru/diproses/menunggu_dokumen dan tenggat ≤ 24 jam.
// Notifikasi dikirim ke pemohon DAN ke admin OPD terkait.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueNotification } from "@/lib/notifications.functions";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/sla-reminder")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const now = new Date();
          const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
          const nowIso = now.toISOString();

          const { data: rows, error } = await supabaseAdmin
            .from("permohonan")
            .select("id,kode,judul,opd_id,pemohon_id,tenggat,status")
            .in("status", ["baru", "diproses", "menunggu_dokumen"])
            .not("tenggat", "is", null)
            .lte("tenggat", horizon)
            .limit(1000);
          if (error) throw new Error(error.message);

          let sent = 0;
          for (const p of rows ?? []) {
            const overdue = p.tenggat && p.tenggat < nowIso;
            const dayKey = nowIso.slice(0, 10);
            const judul = overdue
              ? `Lewat tenggat: ${p.kode}`
              : `Tenggat 24 jam: ${p.kode}`;
            const body = `${p.judul} — tenggat ${new Date(p.tenggat!).toLocaleString("id-ID")}`;
            const link = `/permohonan/${p.id}`;

            // Notif pemohon
            await enqueueNotification({
              userId: p.pemohon_id,
              tipe: "permohonan_sla",
              judul,
              body,
              link,
              meta: { permohonan_id: p.id, overdue: !!overdue },
              dedupeKey: `sla:pemohon:${p.id}:${dayKey}`,
            });
            sent++;

            // Notif admin OPD
            if (p.opd_id) {
              const { data: admins } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("opd_id", p.opd_id);
              for (const a of admins ?? []) {
                await enqueueNotification({
                  userId: a.id,
                  tipe: "permohonan_sla_admin",
                  judul,
                  body,
                  link: `/admin/${p.id}`,
                  meta: { permohonan_id: p.id, overdue: !!overdue },
                  dedupeKey: `sla:admin:${a.id}:${p.id}:${dayKey}`,
                });
                sent++;
              }
            }
          }

          return new Response(
            JSON.stringify({ ok: true, scanned: rows?.length ?? 0, notifications_sent: sent }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          log.error("sla-reminder.fail", {
            error: e instanceof Error ? e.message : String(e),
          });
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
