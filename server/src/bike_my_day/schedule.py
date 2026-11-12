"""When rides happen.

`days_of_week` uses 0 = Sunday … 6 = Saturday (the JavaScript convention the
Supabase schema had); Python's `weekday()` has Monday = 0.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# The nightly job fires once a day at a fixed wall-clock time and handles every
# ride departing in the next 24 hours, so each (ride, occurrence) pair lands in
# exactly one run.
LOOKAHEAD = timedelta(hours=24)


def js_weekday(dt: datetime) -> int:
    return (dt.weekday() + 1) % 7


def minutes_of_day(hhmm: str) -> int:
    parts = hhmm.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def next_occurrence(
    days_of_week: list[int], depart_local_time: str, timezone: str, now: datetime
) -> datetime:
    """The next departure strictly after `now`, as an aware datetime in the
    rider's timezone. Today counts if the time has not passed yet."""
    hour, minute = (int(p) for p in depart_local_time.split(":")[:2])
    tz = ZoneInfo(timezone)
    today = now.astimezone(tz).date()
    for i in range(14):
        day = today + timedelta(days=i)
        candidate = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
        if js_weekday(candidate) in days_of_week and candidate > now:
            return candidate
    raise ValueError("no matching day of week within the next 14 days")


@dataclass
class Due:
    ride: dict
    scheduled_for: datetime


def select_due(now: datetime, rides: list[dict], lookahead: timedelta = LOOKAHEAD) -> list[Due]:
    """Rides whose next departure falls in (now, now + lookahead]. Rides with a
    malformed schedule are skipped rather than failing the run."""
    due: list[Due] = []
    for ride in rides:
        try:
            at = next_occurrence(
                ride["days_of_week"], ride["depart_local_time"], ride["timezone"], now
            )
        except (ValueError, KeyError, IndexError):
            continue
        if timedelta(0) < at - now <= lookahead:
            due.append(Due(ride=ride, scheduled_for=at))
    return due
