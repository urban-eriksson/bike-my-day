import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WelcomeWizard } from "./wizard";

export async function generateMetadata() {
  return { title: (await getT()).meta.welcome };
}
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const t = await getT();
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
      <h1 className="font-heading text-2xl font-semibold">{t.welcome.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.welcome.subtitle}</p>
      <WelcomeWizard initialPreferences={preferences} hasPreferences={preferences.trim() !== ""} />
    </main>
  );
}
