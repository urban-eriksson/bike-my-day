import { nextOccurrence } from "@/lib/rides/next-occurrence";

/**
 * How many hours ahead the cron looks for upcoming rides. Vercel's free plan
 * caps cron frequency at once per day, so we run a single daily tick (08:00
 * UTC by default — see vercel.json) and dispatch verdicts for every ride
 * whose next occurrence falls in the next 24 hours. With the cron firing at
 * the same wall-clock time every day, each (ride, occurrence) pair lands in
 * exactly one tick's window.
 */
export const DEFAULT_LOOKAHEAD_HOURS = 24;

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
 * Select rides whose next occurrence falls inside `(now, now + lookaheadHours]`.
 * The notifications table's `unique (ride_id, scheduled_for)` constraint is the
 * second-line idempotency guard if a tick is ever retried or a ride is moved
 * forward and re-fires.
 */
export function selectDueRides(
  now: Date,
  rides: RideForCron[],
  lookaheadHours: number = DEFAULT_LOOKAHEAD_HOURS,
): DueRide[] {
  const lookaheadMs = lookaheadHours * 60 * 60 * 1000;
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
    if (delta > 0 && delta <= lookaheadMs) {
      due.push({ ride, scheduledFor });
    }
  }
  return due;
}
