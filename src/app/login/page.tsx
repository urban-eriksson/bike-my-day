import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  return { title: (await getT()).meta.signIn };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getT();
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
      <h1 className="font-heading text-2xl font-semibold">{t.login.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t.login.subtitle}</p>
      <LoginForm next={next ?? "/dashboard"} />
    </main>
  );
}
