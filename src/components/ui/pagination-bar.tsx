// Reusable pagination bar for server-paginated tables.
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PaginationBarProps = {
  page: number; // 0-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  loading?: boolean;
};

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  loading,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages - 1);
  const start = total === 0 ? 0 : current * pageSize + 1;
  const end = Math.min(total, (current + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="text-muted-foreground">
        {loading ? "Memuat…" : total === 0 ? "Tidak ada data" : `${start}–${end} dari ${total}`}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-1 text-muted-foreground">
            <span className="hidden sm:inline">Per halaman</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-background px-1 text-xs"
              aria-label="Jumlah per halaman"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={current <= 0 || loading}
            onClick={() => onPageChange(current - 1)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 disabled:opacity-50"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="px-2 tabular-nums">
            {current + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={current >= totalPages - 1 || loading}
            onClick={() => onPageChange(current + 1)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 disabled:opacity-50"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
