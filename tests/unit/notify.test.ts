import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWebPushChannel,
  renderPushPayload,
  renderStars,
  PushSubscriptionGoneError,
  type WebPushClient,
} from "@/lib/notify/webpush";
import type { VerdictNotification } from "@/lib/notify/types";

const NOTIFICATION: VerdictNotification = {
  rideLabel: "Morning commute",
  whenLocal: "2026-04-27T08:00",
  verdictText: "Great morning for the ride — calm tailwind on the way in.",
  details: {
    temperatureC: 14,
    apparentTemperatureC: 12,
    precipitationMm: 0,
    windSpeedMs: 3,
    windGustsMs: 6,
  },
};

const DESTINATION = {
  kind: "webpush" as const,
  endpoint: "https://push.example.com/sub/abc123",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

function fakeClient(sendNotification: WebPushClient["sendNotification"]): WebPushClient {
  return { sendNotification };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createWebPushChannel", () => {
  it("sends a JSON payload to the exact subscription", async () => {
    const send = vi.fn().mockResolvedValue({ statusCode: 201 });
    const channel = createWebPushChannel({ client: fakeClient(send) });

    await channel.send(NOTIFICATION, DESTINATION);

    expect(send).toHaveBeenCalledOnce();
    const [subscription, payloadJson, options] = send.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: "https://push.example.com/sub/abc123",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    const payload = JSON.parse(payloadJson);
    expect(payload.title).toBe("Morning commute — 08:00");
    expect(payload.body).toContain("Great morning for the ride");
    expect(payload.body).toContain("14 °C (feels 12)");
    expect(payload.url).toBe("/dashboard");
    expect(options.TTL).toBeGreaterThan(0);
  });

  it("rejects non-webpush destinations", async () => {
    const send = vi.fn();
    const channel = createWebPushChannel({ client: fakeClient(send) });

    await expect(
      channel.send(NOTIFICATION, { kind: "native", token: "t", platform: "ios" }),
    ).rejects.toThrow("Webpush channel can't dispatch to native");
    expect(send).not.toHaveBeenCalled();
  });

  it.each([404, 410])("maps a %i rejection to PushSubscriptionGoneError", async (statusCode) => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error("Gone"), { statusCode }));
    const channel = createWebPushChannel({ client: fakeClient(send) });

    const err = await channel.send(NOTIFICATION, DESTINATION).catch((e) => e);
    expect(err).toBeInstanceOf(PushSubscriptionGoneError);
    expect(err.statusCode).toBe(statusCode);
    expect(err.endpoint).toBe(DESTINATION.endpoint);
  });

  it("rethrows other push-service errors as ordinary errors", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("Internal error"), { statusCode: 500 }));
    const channel = createWebPushChannel({ client: fakeClient(send) });

    const err = await channel.send(NOTIFICATION, DESTINATION).catch((e) => e);
    expect(err).not.toBeInstanceOf(PushSubscriptionGoneError);
    expect(String(err)).toContain("Web push send failed");
  });

  it("throws a clear config error when VAPID env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    vi.stubEnv("VAPID_SUBJECT", "");

    expect(() => createWebPushChannel()).toThrow("VAPID env vars missing");
  });
});

describe("renderPushPayload", () => {
  it("omits the details line when no details are present", () => {
    const payload = renderPushPayload({
      rideLabel: "Evening loop",
      whenLocal: "2026-04-27T17:30",
      verdictText: "Skip it — heavy rain.",
    });
    expect(payload.title).toBe("Evening loop — 17:30");
    expect(payload.body).toBe("Skip it — heavy rain.");
  });

  it("renders a compact details line", () => {
    const payload = renderPushPayload(NOTIFICATION);
    expect(payload.body.split("\n")[1]).toBe("14 °C (feels 12) · 0 mm · 3 m/s (gusts 6)");
  });

  it("headlines the title with stars when a score is present", () => {
    const payload = renderPushPayload({ ...NOTIFICATION, score: 3, url: "/rides/abc/forecast" });
    expect(payload.title).toBe("Morning commute — ⭐⭐⭐☆☆");
    expect(payload.url).toBe("/rides/abc/forecast");
  });

  it("falls back to the depart time when score is absent", () => {
    expect(renderPushPayload(NOTIFICATION).title).toBe("Morning commute — 08:00");
  });
});

describe("renderStars", () => {
  it("fills earned stars and greys the rest, clamping out-of-range scores", () => {
    expect(renderStars(0)).toBe("☆☆☆☆☆");
    expect(renderStars(5)).toBe("⭐⭐⭐⭐⭐");
    expect(renderStars(2)).toBe("⭐⭐☆☆☆");
    expect(renderStars(7)).toBe("⭐⭐⭐⭐⭐");
  });
});
