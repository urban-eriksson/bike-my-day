"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

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
    );
  }

  return (
    <div className="mt-8 max-w-md">
      <h2 className="text-lg font-semibold">Put it on your phone</h2>
      <p className="mt-1 text-sm text-gray-600">
        bike my day lives on your home screen — that&apos;s how the daily forecast reaches you as a
        notification.
      </p>

      {platform !== "android" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">iPhone</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>
              Open <span className="font-medium">this page in Safari</span> on the phone
            </li>
            <li>
              Tap the <span className="font-medium">Share</span> button
            </li>
            <li>
              Choose <span className="font-medium">Add to Home Screen</span>
            </li>
            <li>Open the app from the new icon and sign in</li>
          </ol>
        </div>
      ) : null}

      {platform !== "ios" ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Android</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Open this page in Chrome on the phone</li>
            <li>
              Tap the <span className="font-medium">⋮</span> menu
            </li>
            <li>
              Choose <span className="font-medium">Add to Home screen</span> (or{" "}
              <span className="font-medium">Install app</span>)
            </li>
            <li>Open the app from the new icon and sign in</li>
          </ol>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-gray-500">
        Just looking around?{" "}
        <Link href="/login" className="underline">
          Continue in the browser
        </Link>
        {platform === "desktop" ? " — but notifications only work from the installed app." : "."}
      </p>
    </div>
  );
}
