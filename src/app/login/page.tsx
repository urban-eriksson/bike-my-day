import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — bike my day" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        We&apos;ll email you a one-time link. No password needed.
      </p>
      <LoginForm next={next ?? "/dashboard"} />
    </main>
  );
}
