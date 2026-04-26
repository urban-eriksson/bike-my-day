import { describe, expect, it } from "vitest";
import { selectDueRides } from "@/lib/cron/select-due";

const RIDE = {
  id: "r1",
  user_id: "u1",
  days_of_week: [1, 2, 3, 4, 5],
  depart_local_time: "08:00",
  timezone: "Europe/Stockholm",
};

describe("selectDueRides", () => {
  it("includes a ride whose next occurrence is within the lead window", () => {
    // Friday Apr 24 2026 16:00 UTC = Friday 18:00 Stockholm.
    // Ride departs Mon Apr 27 08:00 Stockholm = Mon 06:00 UTC.
    // Difference from now: 24*2 + 14h = 62h. With LEAD=14, NOT in window.
    const fridayEvening = new Date("2026-04-24T16:00:00Z");
    expect(selectDueRides(fridayEvening, [RIDE])).toEqual([]);

    // Sunday Apr 26 16:00 UTC = Sunday 18:00 Stockholm.
    // Ride departs Mon Apr 27 06:00 UTC. Delta = 14h. IN window.
    const sundayEvening = new Date("2026-04-26T16:00:00Z");
    const due = selectDueRides(sundayEvening, [RIDE]);
    expect(due).toHaveLength(1);
    expect(due[0].ride.id).toBe("r1");
    expect(due[0].scheduledFor.toISOString()).toBe("2026-04-27T06:00:00.000Z");
  });

  it("skips rides outside the lead window — too soon, too far", () => {
    // Monday 03:00 UTC = Mon 05:00 Stockholm. Ride at 06:00 UTC same day.
    // Delta = 3h, far below the lead window. Skip.
    const mondayMorning = new Date("2026-04-27T03:00:00Z");
    expect(selectDueRides(mondayMorning, [RIDE])).toEqual([]);

    // Sunday 02:00 UTC = Sun 04:00 Stockholm. Ride at Mon 06:00 UTC.
    // Delta = 28h, far above the lead window. Skip.
    const sundayMorning = new Date("2026-04-26T02:00:00Z");
    expect(selectDueRides(sundayMorning, [RIDE])).toEqual([]);
  });

  it("respects a custom lead window", () => {
    // With LEAD=24, the Sunday morning slot above (delta ~28h) is still out.
    // But with LEAD=28 it should fire.
    const sundayMorning = new Date("2026-04-26T02:00:00Z");
    expect(selectDueRides(sundayMorning, [RIDE], 28)).toHaveLength(1);
  });

  it("skips rides with malformed config without throwing", () => {
    const broken = { ...RIDE, depart_local_time: "noon" };
    const sundayEvening = new Date("2026-04-26T16:00:00Z");
    expect(selectDueRides(sundayEvening, [broken])).toEqual([]);
  });

  it("processes multiple rides independently", () => {
    const sundayEvening = new Date("2026-04-26T16:00:00Z");
    const out = selectDueRides(sundayEvening, [
      RIDE,
      { ...RIDE, id: "r2" },
      { ...RIDE, id: "r3", depart_local_time: "12:00" }, // delta = 18h, out of window
    ]);
    const ids = out.map((d) => d.ride.id).sort();
    expect(ids).toEqual(["r1", "r2"]);
  });
});
