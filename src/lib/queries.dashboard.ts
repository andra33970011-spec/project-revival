// F3.7 — Server-aggregated dashboard summary via RPC `dashboard_summary`.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashboardKpi = {
  baru: number;
  diproses: number;
  selesai: number;
  ditolak: number;
  total: number;
};
export type DashboardTrendPoint = { key: string; masuk: number; selesai: number };
export type DashboardKategori = { nama: string; jumlah: number };
export type DashboardSla = { nama: string; total: number; on_time: number };
export type DashboardBacklog = {
  opd_id: string | null;
  singkatan: string | null;
  nama: string | null;
  baru: number;
  diproses: number;
};

export type DashboardSummary = {
  scope: { opd_id: string | null; is_super: boolean; days: number };
  kpi: DashboardKpi;
  trend: DashboardTrendPoint[];
  kategori: DashboardKategori[];
  sla: DashboardSla[];
  backlog: DashboardBacklog[];
};

export const dashboardSummaryQueryOptions = (opd: string | null, days = 14) =>
  queryOptions({
    queryKey: ["dashboard", "summary", opd ?? "all", days],
    queryFn: async (): Promise<DashboardSummary> => {
      // RPC not in generated types yet — minimal cast.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )("dashboard_summary", { _opd: opd, _days: days });
      if (error) throw new Error(error.message);
      return data as DashboardSummary;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
