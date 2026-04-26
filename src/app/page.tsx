import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">bike my day</h1>
      <p className="mt-3 max-w-md text-base text-gray-600">
        A nightly heads-up on whether tomorrow&apos;s ride is worth doing — sun, rain, wind
        direction along your route, all turned into one plain sentence.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
          Sign in
        </Link>
        <Link
          href="/dashboard"
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
