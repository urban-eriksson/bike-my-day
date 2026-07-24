import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WelcomeWizard } from "./wizard";

export const metadata = { title: "Welcome — bike my day" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("preferences").eq("user_id", user.id).maybeSingle(),
    supabase.from("rides").select("id", { count: "exact", head: true }),
  ]);

  const preferences = profile?.preferences ?? "";
  // Established users don't need onboarding.
  if (preferences.trim() !== "" && (count ?? 0) > 0) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Welcome to bike my day</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Three quick steps and tomorrow&apos;s ride forecast lands on your phone by itself.
      </p>
      <WelcomeWizard initialPreferences={preferences} hasPreferences={preferences.trim() !== ""} />
    </main>
  );
}
