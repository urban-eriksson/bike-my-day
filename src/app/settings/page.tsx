import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PushToggle } from "@/components/push-toggle";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings — bike my day" };

export default async function SettingsPage() {
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
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>
      </p>

      <h2 className="mt-8 text-lg font-semibold">Ride preferences</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell the forecast generator what makes or breaks a ride for you. The text below is passed
        verbatim to the LLM along with the forecast — be specific. Example:{" "}
        <em>
          &ldquo;I hate riding under 5&nbsp;°C. Fine in light rain but not heavy. Anything over
          8&nbsp;m/s headwind is a no.&rdquo;
        </em>
      </p>
      <SettingsForm initialPreferences={profile?.preferences ?? ""} />

      <h2 className="mt-10 text-lg font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get each forecast as a push notification on this device. Enable it on every device you want
        notified.
      </p>
      <PushToggle />
    </main>
  );
}
