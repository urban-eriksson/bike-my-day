import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { reasonText } from "@/lib/errors";
import { useT } from "@/lib/i18n/provider";
import { pushSupported, registerWorker, subscribe, unsubscribe, vapidPublicKey } from "@/lib/push";

type PushState =
  | { phase: "loading" }
  | { phase: "unsupported"; reason: string }
  | { phase: "idle" }
  | { phase: "subscribed" }
  | { phase: "working" };

export function PushToggle({
  hideWhenSubscribed = false,
}: {
  /** Render nothing once subscribed — for inline prompts outside Settings. */
  hideWhenSubscribed?: boolean;
} = {}) {
  const t = useT();
  const [state, setState] = useState<PushState>({ phase: "loading" });
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        // iOS Safari only exposes push once the site runs as an installed
        // home-screen app — the most common reason to land here on a phone.
        const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setState({
          phase: "unsupported",
          reason: isIos && !standalone ? t.push.iosHint : t.push.unsupported,
        });
        return;
      }
      if (!(await vapidPublicKey())) {
        if (!cancelled) setState({ phase: "unsupported", reason: t.push.notConfigured });
        return;
      }
      try {
        const registration = await registerWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (!cancelled) setState({ phase: subscription ? "subscribed" : "idle" });
      } catch {
        if (!cancelled) setState({ phase: "unsupported", reason: t.push.workerFailed });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function enable() {
    setState({ phase: "working" });
    setMessage(null);
    try {
      // Must be called from the tap handler — iOS refuses permission prompts
      // that aren't triggered by a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ phase: "idle" });
        setMessage({ text: t.push.permissionDenied, isError: true });
        return;
      }
      await subscribe();
      setState({ phase: "subscribed" });
      setMessage({ text: t.push.enabled, isError: false });
    } catch (err) {
      setState({ phase: "idle" });
      setMessage({
        text: t.push.enableFailed(reasonText(err, t)),
        isError: true,
      });
    }
  }

  async function disable() {
    setState({ phase: "working" });
    setMessage(null);
    try {
      await unsubscribe();
      setState({ phase: "idle" });
      setMessage({ text: t.push.disabled, isError: false });
    } catch (err) {
      setState({ phase: "subscribed" });
      setMessage({
        text: t.push.disableFailed(reasonText(err, t)),
        isError: true,
      });
    }
  }

  if (state.phase === "loading") {
    return <p className="mt-4 text-sm text-muted-foreground">{t.push.checking}</p>;
  }
  if (state.phase === "unsupported") {
    return <p className="mt-4 max-w-prose text-sm text-muted-foreground">{state.reason}</p>;
  }

  const subscribed = state.phase === "subscribed";
  if (hideWhenSubscribed && subscribed && !message) return null;
  return (
    <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={state.phase === "working"}
      >
        {state.phase === "working" ? t.push.working : subscribed ? t.push.disable : t.push.enable}
      </Button>
      {message ? (
        <span
          role="status"
          className={
            message.isError ? "text-sm text-destructive" : "text-sm font-medium text-primary"
          }
        >
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
