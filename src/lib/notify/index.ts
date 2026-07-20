import { createWebPushChannel, PushSubscriptionGoneError } from "./webpush";
import type { Channel, ChannelDestination, DispatchResult, VerdictNotification } from "./types";

export type { Channel, ChannelDestination, DispatchResult, VerdictNotification } from "./types";
export { PushSubscriptionGoneError };

/**
 * Singleton registry. As we add native push, register it here so the
 * dispatcher can route by destination.kind without the call site needing
 * to know which channels exist.
 */
const REGISTRY: Partial<Record<ChannelDestination["kind"], Channel>> = {};

export function registerChannel(channel: Channel): void {
  REGISTRY[channel.kind] = channel;
}

/** Lazy-init the default channels on first use. */
function ensureDefaults(): void {
  if (!REGISTRY.webpush) REGISTRY.webpush = createWebPushChannel();
}

export async function dispatch(
  notification: VerdictNotification,
  destination: ChannelDestination,
): Promise<DispatchResult> {
  ensureDefaults();
  const channel = REGISTRY[destination.kind];
  if (!channel) {
    throw new Error(`No channel registered for kind=${destination.kind}`);
  }
  return channel.send(notification, destination);
}
