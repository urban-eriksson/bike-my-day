import { getT } from "@/lib/i18n/server";
import { HomeActions } from "./home-actions";

export default async function Home() {
  const t = await getT();
  return (
    <main className="relative mx-auto flex min-h-screen max-w-2xl flex-col justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-15%] h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 85%, transparent), transparent)",
        }}
      />
      <h1 className="text-4xl font-semibold tracking-tight">{t.nav.brand}</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">{t.home.tagline}</p>
      <HomeActions />
    </main>
  );
}
