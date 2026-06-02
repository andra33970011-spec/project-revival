// Admin diagnostics UI — surfaces operational metrics from cron_history,
// retry_queue, dead_letter_jobs and upload cleanup pipeline. Super admin only.
import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, RotateCcw, Radio } from "lucide-react";
import { toast } from "sonner";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SuperAdminOnly } from "@/components/admin/SuperAdminOnly";
import { AdminShell, StatCard } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getOpsStatusFn,
  getRecentCronHistory,
  getDeadLetterJobs,
} from "@/lib/ops/status.functions";
import {
  replayDeadLetterFn,
  retryFailedJobFn,
  listRecentRetryJobs,
  listTopRateLimitHits,
} from "@/lib/ops/replay.functions";
import { getRealtimeStats, type RealtimeStats } from "@/lib/realtime/manager";

export const Route = createFileRoute("/admin/system-health")({
  head: () => ({
    meta: [
      { title: "Status Sistem — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AdminGuard>
      <SuperAdminOnly>
        <SystemHealthPage />
      </SuperAdminOnly>
    </AdminGuard>
  ),
});

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("id-ID");
  } catch {
    return s;
  }
}

function fmtDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed" || status === "success"
      ? "bg-emerald-100 text-emerald-700"
      : status === "running"
      ? "bg-blue-100 text-blue-700"
      : status === "completed_with_errors"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SystemHealthPage() {
  const fetchStatus = useServerFn(getOpsStatusFn);
  const fetchCron = useServerFn(getRecentCronHistory);
  const fetchDL = useServerFn(getDeadLetterJobs);
  const fetchRetry = useServerFn(listRecentRetryJobs);
  const fetchRateHits = useServerFn(listTopRateLimitHits);
  const replayFn = useServerFn(replayDeadLetterFn);
  const retryFn = useServerFn(retryFailedJobFn);
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["ops-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30_000,
  });
  const cronQ = useQuery({
    queryKey: ["ops-cron"],
    queryFn: () => fetchCron(),
    refetchInterval: 60_000,
  });
  const dlQ = useQuery({
    queryKey: ["ops-dead-letters"],
    queryFn: () => fetchDL(),
    refetchInterval: 60_000,
  });
  const retryQ = useQuery({
    queryKey: ["ops-retry-queue"],
    queryFn: () => fetchRetry(),
    refetchInterval: 60_000,
  });
  const rateQ = useQuery({
    queryKey: ["ops-rate-hits"],
    queryFn: () => fetchRateHits(),
    refetchInterval: 60_000,
  });

  // F2.7 — local realtime stats snapshot (browser-only, per tab).
  const [rt, setRt] = useState<RealtimeStats>(() => getRealtimeStats());
  useEffect(() => {
    const id = setInterval(() => setRt(getRealtimeStats()), 5_000);
    return () => clearInterval(id);
  }, []);

  const replayMut = useMutation({
    mutationFn: (id: string) => replayFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Dead-letter di-replay ke retry queue");
      qc.invalidateQueries({ queryKey: ["ops-dead-letters"] });
      qc.invalidateQueries({ queryKey: ["ops-retry-queue"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
    onError: (e: Error) => toast.error(e.message || "Gagal replay"),
  });
  const retryMut = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Job dijadwalkan ulang");
      qc.invalidateQueries({ queryKey: ["ops-retry-queue"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
    onError: (e: Error) => toast.error(e.message || "Gagal retry"),
  });

  const s = statusQ.data;
  const refreshAll = () => {
    statusQ.refetch();
    cronQ.refetch();
    dlQ.refetch();
    retryQ.refetch();
    rateQ.refetch();
  };

  return (
    <AdminShell breadcrumb={[{ label: "Status Sistem" }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Status Sistem</h1>
            <p className="text-sm text-muted-foreground">
              Pemantauan operasional: cron, retry queue, dead-letter, dan upload cleanup.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        {statusQ.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Gagal memuat status: {(statusQ.error as Error)?.message ?? "unknown"}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Clock}
            label="Retry Pending"
            value={String((s?.retryQueue.pending ?? 0) + (s?.retryQueue.retrying ?? 0))}
            delta={`${s?.retryQueue.deadLetter ?? 0} dead-letter`}
          />
          <StatCard
            icon={AlertTriangle}
            label="Dead-letter belum dibereskan"
            value={String(s?.deadLetters.unresolved ?? 0)}
            delta={`total ${s?.deadLetters.total ?? 0}`}
          />
          <StatCard
            icon={Activity}
            label="Upload orphan"
            value={String(s?.uploads.orphanedPending ?? 0)}
            delta={`${s?.uploads.stuck ?? 0} stuck > 12 jam`}
          />
          <StatCard
            icon={CheckCircle2}
            label="Cron 24 jam"
            value={String(s?.cron.recentRuns ?? 0)}
            delta={`${s?.cron.failuresLast24h ?? 0} gagal`}
          />
        </div>

        {s?.cron.stale && s.cron.stale.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="size-4" /> Cron job belum jalan dalam SLA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {s.cron.stale.map((j) => (
                <div key={j.jobName} className="flex justify-between border-b border-border/50 py-1 last:border-0">
                  <span className="font-medium">{j.jobName}</span>
                  <span className="text-muted-foreground">
                    {j.minutesSince ?? "—"} menit sejak sukses terakhir
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riwayat Cron (30 terakhir)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Job</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Mulai</th>
                  <th className="px-4 py-2">Durasi</th>
                  <th className="px-4 py-2">Rows</th>
                </tr>
              </thead>
              <tbody>
                {(cronQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-4 py-2 font-medium">{r.job_name}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.started_at)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDuration(r.duration_ms)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.affected_rows ?? "—"}</td>
                  </tr>
                ))}
                {(cronQ.data ?? []).length === 0 && !cronQ.isLoading && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Belum ada cron yang tercatat.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dead-letter Jobs (unresolved)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Job</th>
                  <th className="px-4 py-2">Pesan</th>
                  <th className="px-4 py-2">Retry</th>
                  <th className="px-4 py-2">Gagal pada</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(dlQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-4 py-2 font-medium">{r.job_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.error_message ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.retry_count}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.failed_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" disabled={replayMut.isPending}>
                            <RotateCcw className="size-3.5" /> Replay
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Replay dead-letter job?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Job <span className="font-mono">{r.job_name}</span> akan dimasukkan kembali ke retry queue. Pastikan handler-nya idempotent.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction onClick={() => replayMut.mutate(r.id)}>Replay</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
                {(dlQ.data ?? []).length === 0 && !dlQ.isLoading && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Tidak ada dead-letter aktif. 🎉</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retry Queue (30 terakhir)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Job</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Attempts</th>
                  <th className="px-4 py-2">Next run</th>
                  <th className="px-4 py-2">Last error</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(retryQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="px-4 py-2 font-medium">{r.job_name}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2 text-muted-foreground">{r.attempts}/{r.max_attempts}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtDate(r.next_run_at)}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[260px]" title={r.last_error ?? ""}>
                      {r.last_error ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" disabled={retryMut.isPending} onClick={() => retryMut.mutate(r.id)}>
                        <RotateCcw className="size-3.5" /> Retry
                      </Button>
                    </td>
                  </tr>
                ))}
                {(retryQ.data ?? []).length === 0 && !retryQ.isLoading && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Retry queue kosong.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="size-4" /> Realtime (tab ini)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Channel aktif" value={rt.activeChannels} />
              <Row label="Total listener" value={rt.totalListeners} />
              <Row label="Channel dibuka" value={rt.channelsOpened} />
              <Row label="Channel ditutup" value={rt.channelsClosed} />
              <Row label="Subscribe error" value={rt.subscribeErrors} />
              <Row label="Duplikat dilewati" value={rt.duplicatesSkipped} />
              <Row label="Reconnect attempts" value={rt.reconnectAttempts} />
              <Row label="Backoff terakhir" value={rt.lastBackoffMs ? `${rt.lastBackoffMs}ms` : "—"} />
              <Row label="Status tab" value={rt.paused ? "paused (hidden)" : "aktif"} />
              <Row label="Event terakhir" value={rt.lastEventAt ? new Date(rt.lastEventAt).toLocaleTimeString("id-ID") : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate-limit hits (1 jam terakhir, top 10)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Bucket</th>
                    <th className="px-4 py-2">Subject</th>
                    <th className="px-4 py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(rateQ.data ?? []).map((r, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-4 py-2 font-mono text-xs">{r.bucket}</td>
                      <td className="px-4 py-2 font-mono text-xs truncate max-w-[180px]">{r.identifier}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.count}</td>
                    </tr>
                  ))}
                  {(rateQ.data ?? []).length === 0 && !rateQ.isLoading && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">Tidak ada hit signifikan.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground">
          Data direfresh otomatis setiap 30–60 detik. Update terakhir: {fmtDate(s?.generatedAt)}
        </p>
      </div>
    </AdminShell>
  );
}
