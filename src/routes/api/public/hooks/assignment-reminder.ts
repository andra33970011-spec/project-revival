// Public cron endpoint: kirim reminder 24 jam sebelum due_at untuk
// assignment yang belum disubmit. Idempotent via dedupeKey harian.
// Schedule via pg_cron memanggil URL ini dengan header `apikey`.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enqueueNotification } from "@/lib/notifications.functions";
import { log } from "@/lib/logger";

export const Route = createFileRoute("/api/public/hooks/assignment-reminder")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const now = new Date();
          const horizon = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
          const nowIso = now.toISOString();

          // Assignment yang due dalam 24 jam ke depan, belum overdue, belum disubmit.
          const { data: rows, error } = await supabaseAdmin
            .from("form_assignments")
            .select("id,user_id,form_id,due_at,status, forms(judul)")
            .in("status", ["assigned", "in_progress"])
            .not("due_at", "is", null)
            .gte("due_at", nowIso)
            .lte("due_at", horizon)
            .limit(500);
          if (error) throw new Error(error.message);

          let remindersSent = 0;
          for (const a of rows ?? []) {
            const dayKey = nowIso.slice(0, 10); // YYYY-MM-DD → satu reminder per hari
            const judul =
              (a as unknown as { forms: { judul: string } | null }).forms?.judul ?? "Tugas";
            await enqueueNotification({
              userId: a.user_id,
              tipe: "form.assignment_reminder",
              judul: `Pengingat: ${judul}`,
              body: `Tenggat ${new Date(a.due_at!).toLocaleString("id-ID")}`,
              link: "/asn/tugas",
              meta: { assignment_id: a.id, form_id: a.form_id },
              dedupeKey: `reminder:${a.id}:${dayKey}`,
            });
            remindersSent++;
          }

          // Tandai overdue untuk assignment yang sudah lewat due dan belum submit.
          const { data: overdueRows, error: overdueErr } = await supabaseAdmin
            .from("form_assignments")
            .update({ status: "overdue" })
            .in("status", ["assigned", "in_progress"])
            .not("due_at", "is", null)
            .lt("due_at", nowIso)
            .select("id");
          if (overdueErr) throw new Error(overdueErr.message);

          return new Response(
            JSON.stringify({
              ok: true,
              reminders_sent: remindersSent,
              overdue_marked: overdueRows?.length ?? 0,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (e) {
          log.error("assignment-reminder.fail", {
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
