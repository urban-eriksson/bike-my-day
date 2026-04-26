import { nextOccurrence } from "@/lib/rides/next-occurrence";

/**
 * How many hours ahead of a ride the verdict goes out. With an hourly cron
 * and a 14h lead, a ride at 08:00 local on day D gets its email at ~18:00
 * local on day D-1 — late afternoon the night before, time to plan.
 */
export const DEFAULT_LEAD_HOURS = 14;

export type RideForCron = {
  id: string;
  user_id: string;
  days_of_week: number[];
  depart_local_time: string;
  timezone: string;
};

export type DueRide = {
  ride: RideForCron;
  /** Absolute UTC instant the ride departs. */
  scheduledFor: Date;
};

/**
 * Select rides whose next occurrence falls inside the lead window
 * `(now + leadHours - 1h, now + leadHours]`. The window is exactly the cron
 * interval (1h) so each (ride, occurrence) pair fires at most once. The
 * notifications table's `unique (ride_id, scheduled_for)` constraint
 * idempotency-guards the second-line of defense (e.g., overlapping cron runs
 * or manual re-triggers).
 */
export function selectDueRides(
  now: Date,
  rides: RideForCron[],
  leadHours: number = DEFAULT_LEAD_HOURS,
): DueRide[] {
  const leadMs = leadHours * 60 * 60 * 1000;
  const windowStart = leadMs - 60 * 60 * 1000;
  const due: DueRide[] = [];
  for (const ride of rides) {
    let scheduledFor: Date;
    try {
      scheduledFor = nextOccurrence(
        {
          days_of_week: ride.days_of_week,
          depart_local_time: ride.depart_local_time,
          timezone: ride.timezone,
        },
        now,
      );
    } catch {
      continue; // skip rides with malformed config
    }
    const delta = scheduledFor.getTime() - now.getTime();
    if (delta > windowStart && delta <= leadMs) {
      due.push({ ride, scheduledFor });
    }
  }
  return due;
}
