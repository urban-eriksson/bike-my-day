import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteRide } from "@/app/rides/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata = { title: "Dashboard — bike my day" };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rides, error } = await supabase
    .from("rides")
    .select("id, label, start_address, end_address, depart_local_time, days_of_week, active")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
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
            No rides yet. Add one to start getting verdicts.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {rides.map((r) => (
              <li key={r.id} className="rounded border border-gray-200 p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-gray-900">{r.label}</div>
                    <div className="mt-1 text-gray-600">
                      {r.start_address} → {r.end_address}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {(r.depart_local_time ?? "").slice(0, 5)} ·{" "}
                      {(r.days_of_week ?? []).map((d: number) => DAY_NAMES[d]).join(" ")}
                      {r.active ? "" : " · paused"}
                    </div>
                  </div>
                  <form action={deleteRide}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
