import { describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";
import { createEmailChannel } from "@/lib/notify/email";

function fakeResendClient(send: ReturnType<typeof vi.fn>): Resend {
  return { emails: { send } } as unknown as Resend;
}

describe("createEmailChannel", () => {
  it("sends through Resend with subject built from label, time, and verdict", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "rs_abc" }, error: null });
    const channel = createEmailChannel({
      from: "bike-my-day <test@example.com>",
      client: fakeResendClient(send),
    });

    const result = await channel.send(
      {
        rideLabel: "Morning commute",
        whenLocal: "2026-04-27T08:00",
        verdictText: "Looks great — light tailwind, dry, 14 °C.",
        details: { temperatureC: 14, precipitationMm: 0, windSpeedMs: 3 },
      },
      { kind: "email", email: "rider@example.com" },
    );

    expect(result.external_id).toBe("rs_abc");
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.from).toBe("bike-my-day <test@example.com>");
    expect(arg.to).toEqual(["rider@example.com"]);
    expect(arg.subject).toContain("Morning commute");
    expect(arg.subject).toContain("08:00");
    expect(arg.text).toContain("Looks great");
    expect(arg.html).toContain("Looks great");
    expect(arg.text).toContain("14 °C");
  });

  it("rejects non-email destinations", async () => {
    const channel = createEmailChannel({
      client: fakeResendClient(vi.fn()),
    });
    await expect(
      channel.send(
        {
          rideLabel: "x",
          whenLocal: "2026-04-27T08:00",
          verdictText: "y",
        },
        { kind: "webpush", endpoint: "x", keys: { p256dh: "x", auth: "x" } },
      ),
    ).rejects.toThrow(/Email channel can't dispatch to webpush/);
  });

  it("surfaces Resend errors", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Daily quota exceeded" } });
    const channel = createEmailChannel({ client: fakeResendClient(send) });
    await expect(
      channel.send(
        { rideLabel: "x", whenLocal: "2026-04-27T08:00", verdictText: "y" },
        { kind: "email", email: "rider@example.com" },
      ),
    ).rejects.toThrow(/Daily quota exceeded/);
  });

  it("escapes HTML in user-controlled fields", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "rs_xyz" }, error: null });
    const channel = createEmailChannel({ client: fakeResendClient(send) });
    await channel.send(
      {
        rideLabel: "<script>alert(1)</script>",
        whenLocal: "2026-04-27T08:00",
        verdictText: "Looks fine. Wind 3 m/s & dry.",
      },
      { kind: "email", email: "rider@example.com" },
    );
    const html = send.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&amp;");
  });
});
