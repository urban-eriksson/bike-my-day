import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RideCard, type RideCardData } from "./ride-card";

export async function generateMetadata() {
  return { title: (await getT()).meta.home };
}

export default async function DashboardPage() {
  const t = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rides, error }, { data: profile }] = await Promise.all([
    supabase
      .from("rides")
      .select(
        "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, depart_local_time, return_local_time, days_of_week, muted, active",
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("preferences").eq("user_id", user.id).maybeSingle(),
  ]);

  // Brand-new account (no preferences, no rides): guide through onboarding.
  if ((profile?.preferences ?? "").trim() === "" && (rides?.length ?? 0) === 0 && !error) {
    redirect("/welcome");
  }

  const hasRides = !!rides && rides.length > 0;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="sr-only">{t.dashboard.heading}</h1>

        {error ? (
          <p className="text-sm text-destructive">{t.dashboard.loadFailed(error.message)}</p>
        ) : !hasRides ? (
          <div className="mt-20 flex flex-col items-center gap-5 text-center">
            <p className="max-w-xs text-base text-muted-foreground">{t.dashboard.empty}</p>
            <Button asChild size="lg">
              <Link href="/rides/new">
                <Plus /> {t.dashboard.addRide}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <Button asChild variant="outline">
                <Link href="/rides/new">
                  <Plus /> {t.dashboard.newRide}
                </Link>
              </Button>
            </div>
            <ul className="mt-4 flex flex-col gap-4">
              {rides.map((r) => (
                <RideCard
                  key={r.id}
                  ride={
                    {
                      id: r.id,
                      label: r.label,
                      start_address: r.start_address,
                      start_lat: Number(r.start_lat),
                      start_lon: Number(r.start_lon),
                      end_address: r.end_address,
                      end_lat: Number(r.end_lat),
                      end_lon: Number(r.end_lon),
                      depart_local_time: String(r.depart_local_time),
                      return_local_time: r.return_local_time ? String(r.return_local_time) : null,
                      days_of_week: r.days_of_week as number[],
                      muted: r.muted,
                    } satisfies RideCardData
                  }
                />
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
