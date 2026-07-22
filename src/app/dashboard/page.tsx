import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { RideCard, type RideCardData } from "./ride-card";

export const metadata = { title: "bike my day" };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rides, error } = await supabase
    .from("rides")
    .select(
      "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, depart_local_time, return_local_time, days_of_week, muted, active",
    )
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">bike my day</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary"
          >
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mt-8">
        <div className="flex justify-end">
          <Link
            href="/rides/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New ride
          </Link>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive">Failed to load rides: {error.message}</p>
        ) : !rides || rides.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No rides yet. Add one to start getting forecasts.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
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
        )}
      </section>
    </main>
  );
}
