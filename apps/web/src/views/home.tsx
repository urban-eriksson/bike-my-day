import { Link, Navigate } from "react-router";
import { useI18n } from "@/lib/i18n/provider";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/use-title";

type Platform = "standalone" | "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "desktop";
}

/** A soft accent glow in the corner, shared by the home and login screens. */
export function Glow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-24 right-[-15%] h-96 w-96 rounded-full blur-3xl"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 85%, transparent), transparent)",
      }}
    />
  );
}

/**
 * The app is built to live on a phone's home screen (iOS push requires it),
 * so anyone visiting in a browser gets install steps for their platform
 * instead of being funneled straight into the browser flow.
 */
export function HomeView() {
  const { t } = useI18n();
  const { session } = useSession();
  useTitle(t.meta.home);
  if (session.status === "signed-in") return <Navigate to="/dashboard" replace />;
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center overflow-hidden px-6 py-16">
      <Glow />
      <h1 className="text-4xl font-semibold tracking-tight">{t.nav.brand}</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">{t.home.tagline}</p>
      <HomeActions />
    </main>
  );
}

function HomeActions() {
  const { t } = useI18n();
  const platform = detectPlatform();

  if (platform === "standalone") {
    return (
      <div className="mt-8 flex gap-3">
        <Link
          to="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t.home.signIn}
        </Link>
        <Link
          to="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {t.home.dashboard}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 max-w-md">
      <h2 className="font-heading text-xl font-semibold">{t.home.installHeading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.home.installHelp}</p>

      {platform !== "android" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t.home.iphone}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
            <li>{t.home.iosStep1}</li>
            <li>{t.home.iosStep2}</li>
            <li>{t.home.iosStep3}</li>
            <li>{t.home.installStepSignIn}</li>
          </ol>
        </div>
      ) : null}

      {platform !== "ios" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t.home.android}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-foreground/80">
            <li>{t.home.androidStep1}</li>
            <li>{t.home.androidStep2}</li>
            <li>{t.home.androidStep3}</li>
            <li>{t.home.installStepSignIn}</li>
          </ol>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        {t.home.browsing}{" "}
        <Link to="/login" className="underline">
          {t.home.continueInBrowser}
        </Link>
        {platform === "desktop" ? t.home.desktopNote : "."}
      </p>
    </div>
  );
}
