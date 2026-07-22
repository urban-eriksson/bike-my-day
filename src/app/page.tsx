import { HomeActions } from "./home-actions";

export default function Home() {
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
      <h1 className="text-4xl font-semibold tracking-tight">bike my day</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        A nightly heads-up on whether tomorrow&apos;s ride is worth doing — sun, rain, wind
        direction along your route, all turned into one plain sentence.
      </p>
      <HomeActions />
    </main>
  );
}
