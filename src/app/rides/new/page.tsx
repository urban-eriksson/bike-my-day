import Link from "next/link";
import { PushToggle } from "@/components/push-toggle";
import { NewRideForm } from "./new-ride-form";

export const metadata = { title: "New ride — bike my day" };

export default function NewRidePage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New ride</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Start typing an address or place and pick a suggestion — that pins the exact spot the
        forecast is fetched for.
      </p>
      <NewRideForm />
      <div className="mt-8 border-t border-border pt-4">
        <PushToggle hideWhenSubscribed />
      </div>
    </main>
  );
}
