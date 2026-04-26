import { describe, expect, it } from "vitest";
import { nextOccurrence } from "@/lib/rides/next-occurrence";

const FRIDAY_NOON_UTC = new Date("2026-04-24T12:00:00Z"); // Fri 14:00 in Stockholm (CEST)

describe("nextOccurrence", () => {
  it("picks today if today is a matching weekday and the slot hasn't passed", () => {
    // Friday 12:00 UTC = Friday 14:00 Stockholm. Ride is Mon–Fri 08:00.
    // Today's 08:00 already passed — should fall through to next matching day.
    const next = nextOccurrence(
      {
        days_of_week: [1, 2, 3, 4, 5], // Mon–Fri
        depart_local_time: "08:00",
        timezone: "Europe/Stockholm",
      },
      FRIDAY_NOON_UTC,
    );
    // Next match is Monday Apr 27 at 08:00 Stockholm = 06:00 UTC.
    expect(next.toISOString()).toBe("2026-04-27T06:00:00.000Z");
  });

  it("returns later today when the slot is still in the future", () => {
    const morningUtc = new Date("2026-04-24T05:00:00Z"); // Fri 07:00 Stockholm
    const next = nextOccurrence(
      {
        days_of_week: [1, 2, 3, 4, 5],
        depart_local_time: "08:00",
        timezone: "Europe/Stockholm",
      },
      morningUtc,
    );
    expect(next.toISOString()).toBe("2026-04-24T06:00:00.000Z"); // Fri 08:00 Stockholm
  });

  it("works with a Sunday-only ride starting on a Friday", () => {
    const next = nextOccurrence(
      {
        days_of_week: [0],
        depart_local_time: "10:30",
        timezone: "Europe/Stockholm",
      },
      FRIDAY_NOON_UTC,
    );
    // Next Sunday is Apr 26 at 10:30 Stockholm = 08:30 UTC.
    expect(next.toISOString()).toBe("2026-04-26T08:30:00.000Z");
  });

  it("handles non-European timezones (Asia/Tokyo, JST = UTC+9)", () => {
    const next = nextOccurrence(
      {
        days_of_week: [1, 2, 3, 4, 5],
        depart_local_time: "08:00",
        timezone: "Asia/Tokyo",
      },
      FRIDAY_NOON_UTC, // Fri 12:00 UTC = Fri 21:00 Tokyo (today's slot passed)
    );
    // Next slot is Monday 08:00 Tokyo = Monday 23:00 UTC Sunday Apr 26.
    expect(next.toISOString()).toBe("2026-04-26T23:00:00.000Z");
  });

  it("throws on a malformed depart_local_time", () => {
    expect(() =>
      nextOccurrence(
        { days_of_week: [1], depart_local_time: "noon", timezone: "Europe/Stockholm" },
        FRIDAY_NOON_UTC,
      ),
    ).toThrow(/Invalid depart_local_time/);
  });
});
