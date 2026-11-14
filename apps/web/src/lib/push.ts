import { api } from "./api";

/**
 * Web push for this device. The service worker stays at /sw.js with scope "/",
 * exactly as the Next.js app registered it: subscriptions made there carry over.
 */

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function registerWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

let publicKey: Promise<string | null> | null = null;

/** Fetched at runtime, so the build needs no keys. */
export function vapidPublicKey(): Promise<string | null> {
  publicKey ??= api<{ key: string | null }>("/push/key")
    .then((r) => r.key)
    .catch(() => {
      publicKey = null;
      return null;
    });
  return publicKey;
}

type SubscriptionBody = { endpoint: string; keys: { p256dh: string; auth: string } };

function toBody(subscription: PushSubscription): SubscriptionBody {
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Subscription is missing encryption keys.");
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export async function subscribe(): Promise<void> {
  const key = await vapidPublicKey();
  if (!key) throw new Error("Push is not configured on the server.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  try {
    // Turning notifications on here moves them off any other device.
    await api("/subscriptions", {
      method: "PUT",
      body: { ...toBody(subscription), take_over: true },
    });
  } catch (err) {
    await subscription.unsubscribe();
    throw err;
  }
}

export async function unsubscribe(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe();
  await api("/subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } });
}

/**
 * Re-sends this device's subscription on every app open. The old app only
 * checked the browser, so a subscription the server had lost showed as "on"
 * and silently got nothing; this heals it. Only one device per rider gets
 * notifications: if another one has taken over, this device drops its
 * subscription so the toggle shows "off" here. Best effort and silent.
 */
export function syncSubscription(): Promise<void> {
  lastSync = sync();
  return lastSync;
}

/** Settles when the latest sync has, so the toggle reads the result of it. */
export let lastSync: Promise<void> = Promise.resolve();

async function sync(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const registration = await registerWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const res = await api<{ subscribed: boolean }>("/subscriptions", {
      method: "PUT",
      body: toBody(subscription),
    });
    if (!res.subscribed) await subscription.unsubscribe();
  } catch {
    // Next open tries again.
  }
}

/**
 * On sign-out: this device stops getting the rider's notifications. Must run
 * while the token is still set. Never waits on a worker that was never registered.
 */
export async function releaseDevice(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api("/subscriptions", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
    }).catch(() => {});
    await subscription.unsubscribe();
  } catch {
    // Signing out must not fail on this.
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
