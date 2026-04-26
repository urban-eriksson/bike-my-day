import { describe, expect, it } from "vitest";
import { selectDueRides } from "@/lib/cron/select-due";

const RIDE = {
  id: "r1",
  user_id: "u1",
  days_of_week: [1, 2, 3, 4, 5],
  depart_local_time: "08:00",
  timezone: "Europe/Stockholm",
};

describe("selectDueRides (24h lookahead)", () => {
  it("includes a ride whose next occurrence is within the next 24 hours", () => {
    // Sunday Apr 26 2026 06:00 UTC. Next ride is Monday Apr 27 06:00 UTC
    // (08:00 Stockholm) — exactly 24h away → in window.
    const sundayMorning = new Date("2026-04-26T06:00:00Z");
    const due = selectDueRides(sundayMorning, [RIDE]);
    expect(due).toHaveLength(1);
    expect(due[0].ride.id).toBe("r1");
    expect(due[0].scheduledFor.toISOString()).toBe("2026-04-27T06:00:00.000Z");
  });

  it("includes a ride happening only a few hours from now", () => {
    // Sunday Apr 26 2026 22:00 UTC. Next ride is Monday Apr 27 06:00 UTC,
    // 8h away → in window.
    const sundayLate = new Date("2026-04-26T22:00:00Z");
    expect(selectDueRides(sundayLate, [RIDE])).toHaveLength(1);
  });

  it("excludes rides farther out than the lookahead", () => {
    // Friday Apr 24 16:00 UTC. Next weekday ride is Monday Apr 27 06:00 UTC,
    // ~62h away → out of window.
    const fridayEvening = new Date("2026-04-24T16:00:00Z");
    expect(selectDueRides(fridayEvening, [RIDE])).toEqual([]);
  });

  it("excludes a ride whose occurrence is in the past (delta <= 0)", () => {
    // At Mon Apr 27 06:00:00 UTC exactly: nextOccurrence returns Tue Apr 28
    // 06:00 UTC (24h away → still in window). Use a slightly later moment so
    // today's slot has passed and tomorrow's is just over 24h.
    const mondayAfter = new Date("2026-04-27T06:30:00Z");
    const due = selectDueRides(mondayAfter, [RIDE]);
    // Tue 06:00 UTC is 23.5h away → in window.
    expect(due).toHaveLength(1);
    expect(due[0].scheduledFor.toISOString()).toBe("2026-04-28T06:00:00.000Z");
  });

  it("respects a custom lookahead window", () => {
    // 36h lookahead picks up the Monday ride from Saturday afternoon.
    const saturdayAfternoon = new Date("2026-04-25T18:00:00Z"); // Sat 20:00 Stockholm
    expect(selectDueRides(saturdayAfternoon, [RIDE], 24)).toEqual([]);
    expect(selectDueRides(saturdayAfternoon, [RIDE], 60)).toHaveLength(1);
  });

  it("skips rides with malformed config without throwing", () => {
    const broken = { ...RIDE, depart_local_time: "noon" };
    const sundayLate = new Date("2026-04-26T22:00:00Z");
    expect(selectDueRides(sundayLate, [broken])).toEqual([]);
  });

  it("processes multiple rides independently", () => {
    const sundayLate = new Date("2026-04-26T22:00:00Z");
    const out = selectDueRides(sundayLate, [
      RIDE,
      { ...RIDE, id: "r2" },
      // r3 only runs on Wednesday → next occurrence is in 3+ days, out of 24h window.
      { ...RIDE, id: "r3", days_of_week: [3] },
    ]);
    const ids = out.map((d) => d.ride.id).sort();
    expect(ids).toEqual(["r1", "r2"]);
  });
});
