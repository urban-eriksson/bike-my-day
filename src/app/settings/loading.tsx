import { AppHeader } from "@/components/app-header";

export default function SettingsLoading() {
  return (
    <>
      <AppHeader back />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-16 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold">Preferences</h1>
        <div className="mt-3 h-4 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-9 h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-28 animate-pulse rounded-lg bg-muted" />
        <div className="mt-11 h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-10 w-48 animate-pulse rounded-lg bg-muted" />
      </main>
    </>
  );
}
