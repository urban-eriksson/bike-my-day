import { AppHeader } from "@/components/app-header";
import { PushToggle } from "@/components/push-toggle";
import { NewRideForm } from "./new-ride-form";

export const metadata = { title: "New ride — bike my day" };

export default function NewRidePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="text-2xl font-semibold">New ride</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start typing an address or place and pick a suggestion — that pins the exact spot the
          forecast is fetched for.
        </p>
        <NewRideForm />
        <div className="mt-8 border-t border-border pt-4">
          <PushToggle hideWhenSubscribed />
        </div>
      </main>
    </>
  );
}
