"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "./actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type PushState =
  | { phase: "loading" }
  | { phase: "unsupported"; reason: string }
  | { phase: "idle" }
  | { phase: "subscribed" }
  | { phase: "working" };

export function PushSettings() {
  const [state, setState] = useState<PushState>({ phase: "loading" });
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS Safari only exposes push once the site runs as an installed
        // home-screen app — the most common reason to land here on a phone.
        const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setState({
          phase: "unsupported",
          reason:
            isIos && !standalone
              ? "On iPhone, notifications need the installed app: open this site in Safari, tap Share → Add to Home Screen, then enable notifications from that app."
              : "Push notifications aren't supported in this browser.",
        });
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setState({ phase: subscription ? "subscribed" : "idle" });
      } catch {
        if (!cancelled) {
          setState({ phase: "unsupported", reason: "Could not set up the notification worker." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) return;
    setState({ phase: "working" });
    setMessage(null);
    try {
      // Must be called from the tap handler — iOS refuses permission prompts
      // that aren't triggered by a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ phase: "idle" });
        setMessage({ text: "Notification permission was not granted.", isError: true });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Subscription is missing encryption keys.");
      }
      const result = await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!result.ok) {
        await subscription.unsubscribe();
        setState({ phase: "idle" });
        setMessage({ text: result.message, isError: true });
        return;
      }
      setState({ phase: "subscribed" });
      setMessage({ text: result.message, isError: false });
    } catch (err) {
      setState({ phase: "idle" });
      setMessage({
        text: `Could not enable notifications: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      });
    }
  }

  async function disable() {
    setState({ phase: "working" });
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        const result = await removePushSubscription(subscription.endpoint);
        setMessage({ text: result.message, isError: !result.ok });
      }
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "subscribed" });
      setMessage({
        text: `Could not disable notifications: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      });
    }
  }

  if (!VAPID_PUBLIC_KEY) {
    return (
      <p className="mt-4 text-sm text-destructive">
        Push is not configured: NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing.
      </p>
    );
  }
  if (state.phase === "loading") {
    return <p className="mt-4 text-sm text-muted-foreground">Checking notification support…</p>;
  }
  if (state.phase === "unsupported") {
    return <p className="mt-4 text-sm text-muted-foreground">{state.reason}</p>;
  }

  const subscribed = state.phase === "subscribed";
  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={state.phase === "working"}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {state.phase === "working"
          ? "Working…"
          : subscribed
            ? "Disable notifications on this device"
            : "Enable notifications on this device"}
      </button>
      {message ? (
        <span
          role="status"
          className={message.isError ? "text-sm text-destructive" : "text-sm text-green-700"}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
