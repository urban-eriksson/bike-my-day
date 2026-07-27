import webpush from "web-push";
import type { Channel, ChannelDestination, DispatchResult, VerdictNotification } from "./types";

/**
 * Minimal surface of the `web-push` module we depend on; injectable for tests.
 */
export type WebPushClient = {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { TTL?: number },
  ): Promise<{ statusCode: number }>;
};

export type WebPushChannelOptions = {
  /** Inject a custom client for tests. */
  client?: WebPushClient;
  /** VAPID configuration; falls back to env vars. */
  vapid?: { publicKey: string; privateKey: string; subject: string };
};

/**
 * The push service reported the subscription no longer exists (HTTP 404/410).
 * Callers should delete the stored subscription row and move on — the device
 * revoked permission, cleared site data, or the endpoint rotated.
 */
export class PushSubscriptionGoneError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(`Push subscription gone (${statusCode}): ${endpoint}`);
    this.name = "PushSubscriptionGoneError";
  }
}

export type PushPayload = {
  title: string;
  body: string;
  /** Path the service worker opens when the notification is tapped. */
  url: string;
};

/** A verdict is stale once the ride window has passed. */
const TTL_SECONDS = 60 * 60 * 12;

/** An operational alert is only useful while it is still actionable. */
const ALERT_TTL_SECONDS = 60 * 60 * 6;

export function createWebPushChannel(options: WebPushChannelOptions = {}): Channel {
  const client = options.client ?? createDefaultClient(options.vapid);

  return {
    kind: "webpush",
    async send(
      notification: VerdictNotification,
      dest: ChannelDestination,
    ): Promise<DispatchResult> {
      if (dest.kind !== "webpush") {
        throw new Error(`Webpush channel can't dispatch to ${dest.kind}`);
      }

      await deliver(client, renderPushPayload(notification), dest, TTL_SECONDS);
      // Push services return no useful message id.
      return {};
    },
  };
}

/** Shared send + error translation for every payload kind. */
async function deliver(
  client: WebPushClient,
  payload: PushPayload,
  dest: Extract<ChannelDestination, { kind: "webpush" }>,
  ttlSeconds: number,
): Promise<void> {
  try {
    await client.sendNotification(
      { endpoint: dest.endpoint, keys: dest.keys },
      JSON.stringify(payload),
      { TTL: ttlSeconds },
    );
  } catch (err) {
    const statusCode = (err as { statusCode?: unknown })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      throw new PushSubscriptionGoneError(statusCode, dest.endpoint);
    }
    throw new Error(`Web push send failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Sends an already-rendered payload, bypassing verdict rendering. Operational
 * alerts to the operator are not ride verdicts — pushing one through
 * VerdictNotification would title it with a star rating it doesn't have.
 *
 * Short TTL: a capacity warning that arrives a day late is noise.
 */
export async function sendPushPayload(
  payload: PushPayload,
  dest: Extract<ChannelDestination, { kind: "webpush" }>,
  options: WebPushChannelOptions = {},
): Promise<void> {
  const client = options.client ?? createDefaultClient(options.vapid);
  await deliver(client, payload, dest, ALERT_TTL_SECONDS);
}

function createDefaultClient(vapid?: WebPushChannelOptions["vapid"]): WebPushClient {
  const publicKey = vapid?.publicKey ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = vapid?.privateKey ?? process.env.VAPID_PRIVATE_KEY;
  const subject = vapid?.subject ?? process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID env vars missing: set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT " +
        "(generate keys with `npx web-push generate-vapid-keys`)",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

/** ⭐ for earned stars, ☆ for the rest — the closest plain text gets to gold/grey. */
export function renderStars(score: number): string {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  return "⭐".repeat(clamped) + "☆".repeat(5 - clamped);
}

export function renderPushPayload(n: VerdictNotification): PushPayload {
  const bodyLines = [n.verdictText];
  const detail = renderDetailLine(n);
  if (detail) bodyLines.push(detail);
  // Stars headline the ride quality; fall back to the depart time when the
  // LLM's score line couldn't be parsed.
  const headline = n.score != null ? renderStars(n.score) : n.whenLocal.slice(11, 16);
  return {
    title: `${n.rideLabel} — ${headline}`,
    body: bodyLines.join("\n"),
    url: n.url ?? "/dashboard",
  };
}

function renderDetailLine(n: VerdictNotification): string | undefined {
  if (!n.details) return undefined;
  const d = n.details;
  const parts: string[] = [];
  if (d.temperatureC !== undefined) {
    parts.push(
      `${d.temperatureC} °C${d.apparentTemperatureC !== undefined ? ` (feels ${d.apparentTemperatureC})` : ""}`,
    );
  }
  if (d.precipitationMm !== undefined) parts.push(`${d.precipitationMm} mm`);
  if (d.windSpeedMs !== undefined) {
    parts.push(
      `${d.windSpeedMs} m/s${d.windGustsMs !== undefined ? ` (gusts ${d.windGustsMs})` : ""}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
