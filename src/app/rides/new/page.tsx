import { AppHeader } from "@/components/app-header";
import { PushToggle } from "@/components/push-toggle";
import { getT } from "@/lib/i18n/server";
import { NewRideForm } from "./new-ride-form";

export async function generateMetadata() {
  return { title: (await getT()).meta.newRide };
}

export default async function NewRidePage() {
  const t = await getT();
  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">{t.ride.newTitle}</h1>
        <p className="mt-2 text-[0.95rem] text-muted-foreground">{t.ride.newHelp}</p>
        <NewRideForm />
        <div className="mt-8 border-t border-border pt-4">
          <PushToggle hideWhenSubscribed />
        </div>
      </main>
    </>
  );
}
