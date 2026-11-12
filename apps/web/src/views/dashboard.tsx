import { Plus } from "lucide-react";
import { Link, Navigate } from "react-router";
import { Page } from "@/components/page";
import { RideCard } from "@/components/ride-card";
import { Button } from "@/components/ui/button";
import { api, type Ride } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useT } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";
import { useTitle } from "@/lib/use-title";

export function DashboardView() {
  const t = useT();
  const { session } = useSession();
  useTitle(t.meta.home);
  const rides = useLoad("rides", () => api<Ride[]>("/rides"));

  if (rides.status === "loading") return <DashboardSkeleton />;
  if (rides.status === "error") {
    return (
      <Page>
        <p className="text-sm text-destructive">
          {t.dashboard.loadFailed(errorText(rides.error, t))}
        </p>
      </Page>
    );
  }

  const preferences = session.status === "signed-in" ? session.me.profile.preferences : "";
  // Brand-new account (no preferences, no rides): guide through onboarding.
  if (preferences.trim() === "" && rides.data.length === 0) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <Page>
      <h1 className="sr-only">{t.dashboard.heading}</h1>
      {rides.data.length === 0 ? (
        <div className="mt-20 flex flex-col items-center gap-5 text-center">
          <p className="max-w-xs text-base text-muted-foreground">{t.dashboard.empty}</p>
          <Button asChild size="lg">
            <Link to="/rides/new">
              <Plus /> {t.dashboard.addRide}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <Button asChild variant="outline">
              <Link to="/rides/new">
                <Plus /> {t.dashboard.newRide}
              </Link>
            </Button>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {rides.data.map((r) => (
              <RideCard
                key={r.id}
                ride={r}
                onChanged={(next) =>
                  rides.set(rides.data.map((x) => (x.id === next.id ? next : x)))
                }
                onDeleted={(id) => rides.set(rides.data.filter((x) => x.id !== id))}
              />
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}

/** Mirrors the real card layout so the page settles into place rather than jumping. */
function DashboardSkeleton() {
  return (
    <Page>
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
    </Page>
  );
}
