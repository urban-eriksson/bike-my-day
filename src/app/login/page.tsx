import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — bike my day" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center overflow-hidden px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-15%] h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 85%, transparent), transparent)",
        }}
      />
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We&apos;ll email you a one-time code. No password needed.
      </p>
      <LoginForm next={next ?? "/dashboard"} />
    </main>
  );
}
