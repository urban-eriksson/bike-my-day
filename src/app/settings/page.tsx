import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getT } from "@/lib/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PushToggle } from "@/components/push-toggle";
import { SettingsForm } from "./settings-form";

export async function generateMetadata() {
  return { title: (await getT()).meta.preferences };
}

export default async function SettingsPage() {
  const t = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">{t.settings.title}</h1>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">
          {t.settings.signedInAs} <span className="font-medium text-foreground">{user.email}</span>
        </p>

        <h2 className="mt-9 text-xl font-semibold">{t.settings.prefsHeading}</h2>
        <p className="mt-1.5 text-[0.95rem] text-muted-foreground">
          {t.settings.prefsHelp} <em>{t.settings.prefsExample}</em>
        </p>
        <SettingsForm initialPreferences={profile?.preferences ?? ""} />

        <h2 className="mt-11 text-xl font-semibold">{t.settings.notificationsHeading}</h2>
        <p className="mt-1.5 text-[0.95rem] text-muted-foreground">
          {t.settings.notificationsHelp}
        </p>
        <PushToggle />
      </main>
    </>
  );
}
