import Link from "next/link";
import { NewRideForm } from "./new-ride-form";

export const metadata = { title: "New ride — bike my day" };

export default function NewRidePage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New ride</h1>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
          ← Dashboard
        </Link>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Addresses are resolved against Open-Meteo&apos;s place-name database — use a city, town, or
        neighborhood name (e.g. <em>Uppsala</em>, <em>Södermalm Stockholm</em>). Street addresses
        won&apos;t resolve.
      </p>
      <NewRideForm />
    </main>
  );
}
