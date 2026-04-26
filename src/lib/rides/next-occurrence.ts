/**
 * Find the next time a ride should occur in absolute (UTC) terms, given:
 *   - days_of_week: 0–6 with 0 = Sunday (matches JS Date.getDay() and our schema)
 *   - depart_local_time: "HH:MM" or "HH:MM:SS"
 *   - timezone: IANA name (e.g. "Europe/Stockholm")
 *
 * If today's slot has already passed in the rider's local time, falls through
 * to the next matching weekday. Always returns a Date strictly in the future
 * relative to `now`.
 */
export function nextOccurrence(
  ride: { days_of_week: number[]; depart_local_time: string; timezone: string },
  now: Date = new Date(),
): Date {
  const [hStr, mStr] = ride.depart_local_time.split(":");
  const targetHour = Number.parseInt(hStr, 10);
  const targetMinute = Number.parseInt(mStr, 10);
  if (!Number.isFinite(targetHour) || !Number.isFinite(targetMinute)) {
    throw new Error(`Invalid depart_local_time: ${ride.depart_local_time}`);
  }

  for (let i = 0; i < 14; i++) {
    const candidateUtc = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dow = localDayOfWeek(candidateUtc, ride.timezone);
    if (!ride.days_of_week.includes(dow)) continue;

    const { year, month, day } = localYMD(candidateUtc, ride.timezone);
    const candidate = utcInstantForLocalWallClock(
      year,
      month,
      day,
      targetHour,
      targetMinute,
      ride.timezone,
    );
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  throw new Error("No matching day of week within the next 14 days");
}

/** 0 = Sunday … 6 = Saturday, in the given IANA timezone. */
function localDayOfWeek(at: Date, timezone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(at);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const v = map[weekday];
  if (v === undefined) throw new Error(`Unrecognised weekday: ${weekday}`);
  return v;
}

function localYMD(at: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Return the UTC instant whose wall-clock reading in `timezone` is exactly
 * (year, month, day, hour, minute).
 *
 * Strategy: pretend the wall-clock components are already UTC ("naive"). Then
 * render that naive instant in the target timezone — the difference between
 * the wall-clock we wanted and what we got back IS the timezone offset for
 * this instant. Apply it once and you land on the right UTC. (DST-ambiguous
 * hours are accepted; either valid answer is fine for "next ride".)
 */
function utcInstantForLocalWallClock(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const wallClockOfNaive = wallClockReading(new Date(naive), timezone);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMs = wantedAsUtc - wallClockOfNaive;
  return new Date(naive + offsetMs);
}

/** Render the given UTC instant as wall-clock components in `timezone`, then re-encode them as a UTC milliseconds value (i.e. ignore the original UTC offset, just keep the digits). */
function wallClockReading(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
}
