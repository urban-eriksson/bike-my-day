"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useT } from "@/components/i18n-provider";

type Platform = "detecting" | "standalone" | "ios" | "android" | "desktop";

const subscribeNever = () => () => {};

function detectPlatform(): Platform {
  if (window.matchMedia("(display-mode: standalone)").matches) return "standalone";
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "ios";
  if (/Android/.test(navigator.userAgent)) return "android";
  return "desktop";
}

/**
 * The app is built to live on a phone's home screen (iOS push requires it),
 * so anyone visiting in a browser gets install steps for their platform
 * instead of being funneled straight into the browser flow. Detection is
 * client-side only: the server snapshot renders a neutral placeholder and
 * the client snapshot swaps in the real platform at hydration.
 */
export function HomeActions() {
  const t = useT();
  const platform = useSyncExternalStore<Platform>(
    subscribeNever,
    detectPlatform,
    () => "detecting",
  );

  if (platform === "detecting") {
    return <div className="mt-8 h-9" aria-hidden />;
  }

  if (platform === "standalone") {
    return (
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t.home.signIn}
        </Link>
        <Link
          href="/dashboard"
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
        <Link href="/login" className="underline">
          {t.home.continueInBrowser}
        </Link>
        {platform === "desktop" ? t.home.desktopNote : "."}
      </p>
    </div>
  );
}
