import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata = { title: "Dashboard — bike my day" };

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
      <p className="mt-6 text-sm text-gray-600">
        Signed in as <span className="font-medium text-gray-900">{user.email}</span>.
      </p>
      <p className="mt-12 text-sm text-gray-500">
        Routes and verdicts will live here. Add your first ride in step 4.
      </p>
    </main>
  );
}
