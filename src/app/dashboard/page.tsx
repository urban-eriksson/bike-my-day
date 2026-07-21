import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteRide } from "@/app/rides/actions";
import { distanceKm } from "@/lib/geo/distance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata = { title: "Dashboard — bike my day" };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Address labels end with the country ("Datavägen 9, Järfälla, Sweden") —
 * constant noise on the cards. Drop the last comma segment when it looks
 * like a country (no digits, multi-segment label).
 */
function shortAddress(label: string): string {
  const parts = label.split(",").map((p) => p.trim());
  if (parts.length >= 2 && !/\d/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join(", ");
  }
  return label;
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rides, error } = await supabase
    .from("rides")
    .select(
      "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, depart_local_time, days_of_week, active",
    )
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <p className="mt-2 text-sm text-gray-600">
        Signed in as <span className="font-medium text-gray-900">{user.email}</span>.
      </p>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your rides</h2>
          <Link
            href="/rides/new"
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white"
          >
            New ride
          </Link>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600">Failed to load rides: {error.message}</p>
        ) : !rides || rides.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No rides yet. Add one to start getting forecasts.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rides.map((r) => (
              <li key={r.id} className="rounded border border-gray-200 p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900">{r.label}</div>
                    <div className="mt-1 text-gray-600">
                      {shortAddress(r.start_address)} → {shortAddress(r.end_address)}{" "}
                      <span className="whitespace-nowrap text-gray-400">
                        (
                        {distanceKm(
                          { lat: Number(r.start_lat), lon: Number(r.start_lon) },
                          { lat: Number(r.end_lat), lon: Number(r.end_lon) },
                        ).toFixed(1)}{" "}
                        km)
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {(r.depart_local_time ?? "").slice(0, 5)} ·{" "}
                      {(r.days_of_week ?? []).map((d: number) => DAY_NAMES[d]).join(" ")}
                      {r.active ? "" : " · paused"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Link
                      href={`/rides/${r.id}/preview`}
                      className="text-xs font-medium text-gray-900 hover:underline"
                    >
                      Preview forecast
                    </Link>
                    <form action={deleteRide}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
