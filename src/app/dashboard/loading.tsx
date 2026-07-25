import { AppHeader } from "@/components/app-header";

/**
 * Shown while the server checks the session and loads rides. Mirrors the real
 * card layout so the page settles into place rather than jumping.
 */
export default function DashboardLoading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <div className="flex justify-end">
          <div className="h-10 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-col gap-3 px-4 pt-4 pb-3.5">
                <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
                <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
