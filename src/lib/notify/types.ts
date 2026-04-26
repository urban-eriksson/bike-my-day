/**
 * The verdict + ride context a channel needs in order to deliver a notification.
 * Channel-agnostic: the same payload renders to email, web push, native push.
 */
export type VerdictNotification = {
  rideLabel: string;
  /** Local time string (`"2026-04-27T08:00"`), useful in subjects and bodies. */
  whenLocal: string;
  /** The one-sentence verdict the LLM produced. */
  verdictText: string;
  /** Optional structured snapshot for richer rendering (HTML email, deep links). */
  details?: {
    temperatureC?: number;
    apparentTemperatureC?: number;
    precipitationMm?: number;
    windSpeedMs?: number;
    windGustsMs?: number;
  };
};

/**
 * Stored in `notification_channels.destination` (jsonb). Per channel kind:
 *   email   → { email: string }
 *   webpush → { endpoint, keys: { p256dh, auth } }   (added in step 9)
 *   native  → { token: string, platform: "ios"|"android" } (added later)
 */
export type ChannelDestination =
  | { kind: "email"; email: string }
  | { kind: "webpush"; endpoint: string; keys: { p256dh: string; auth: string } }
  | { kind: "native"; token: string; platform: "ios" | "android" };

export type DispatchResult = {
  /** Provider-side ID (e.g. Resend message id), for tracing/debug. */
  external_id?: string;
};

export type Channel = {
  kind: ChannelDestination["kind"];
  send(notification: VerdictNotification, dest: ChannelDestination): Promise<DispatchResult>;
};
