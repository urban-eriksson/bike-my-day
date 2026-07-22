import { HomeActions } from "./home-actions";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">bike my day</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">
        A nightly heads-up on whether tomorrow&apos;s ride is worth doing — sun, rain, wind
        direction along your route, all turned into one plain sentence.
      </p>
      <HomeActions />
    </main>
  );
}
