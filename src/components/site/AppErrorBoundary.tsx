// Root-level error boundary with chunk-load recovery.
// Catches "Failed to fetch dynamically imported module" and similar lazy
// import failures (typically caused by a stale chunk after a new deploy).
// Strategy: attempt a one-shot hard reload; if it keeps failing, show a UI.
import { Component, type ReactNode } from "react";

type State = { error: Error | null; recovering: boolean };

const RELOAD_FLAG = "__lov_chunk_reload";

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg)
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, recovering: false };
  }

  componentDidCatch(error: Error) {
    if (typeof window === "undefined") return;
    if (isChunkLoadError(error)) {
      try {
        const already = sessionStorage.getItem(RELOAD_FLAG);
        if (!already) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          this.setState({ recovering: true });
          // Force fresh bundle fetch
          setTimeout(() => window.location.reload(), 150);
          return;
        }
      } catch {
        /* sessionStorage blocked — fall through */
      }
    }
    // eslint-disable-next-line no-console
    console.error("AppErrorBoundary", error);
  }

  reset = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
    this.setState({ error: null, recovering: false });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.recovering) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          Memuat ulang aplikasi…
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-soft">
            <h1 className="font-display text-xl font-bold text-foreground">Terjadi kesalahan</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aplikasi mengalami gangguan sementara. Coba muat ulang halaman.
            </p>
            <button
              onClick={this.reset}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Muat ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
