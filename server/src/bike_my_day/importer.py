"""One-off import of the Supabase data:  python -m bike_my_day.importer export.json

The export is one JSON object, produced by running EXPORT_SQL in the Supabase
SQL editor and saving the single cell it returns. Ids are kept as they are, so
every push subscription stays attached to its rider and the nightly job can
reach them before anybody opens the new app.

Refuses to run against a database that already has users; delete it to redo.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from bike_my_day import db

EXPORT_SQL = """
select json_build_object(
  'users', (select coalesce(json_agg(json_build_object(
      'id', id, 'email', lower(email), 'created_at', created_at)), '[]') from auth.users),
  'profiles', (select coalesce(json_agg(p), '[]') from public.profiles p),
  'rides', (select coalesce(json_agg(r), '[]') from public.rides r),
  'notification_channels', (select coalesce(json_agg(c), '[]')
      from public.notification_channels c where kind = 'webpush'),
  'notifications', (select coalesce(json_agg(n), '[]')
      from public.notifications n where sent_at is not null)
) as export;
"""


def utc(ts: str | None) -> str | None:
    """Postgres timestamptz JSON ("2026-04-27T06:00:00+00:00" or with
    fractions) → our "2026-04-27T06:00:00Z"."""
    if ts is None:
        return None
    from datetime import datetime

    return db.iso(datetime.fromisoformat(ts.replace("Z", "+00:00")))


def hhmm(t: str | None) -> str | None:
    return t[:5] if t else None


def run(data: dict[str, Any]) -> dict[str, int]:
    with db.connect() as conn:
        if conn.execute("SELECT count(*) FROM users").fetchone()[0]:
            raise SystemExit("database already has users; refusing to import over them")
        for u in data["users"]:
            conn.execute(
                "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
                (u["id"], u["email"], utc(u["created_at"])),
            )
        for p in data["profiles"]:
            conn.execute(
                "INSERT INTO profiles (user_id, preferences, locale) VALUES (?, ?, ?)",
                (p["user_id"], p.get("preferences") or "", p.get("locale") or "sv"),
            )
        for r in data["rides"]:
            conn.execute(
                """INSERT INTO rides (id, user_id, label, start_address, start_lat, start_lon,
                       end_address, end_lat, end_lon, depart_local_time, return_local_time,
                       days_of_week, timezone, active, muted, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    r["id"],
                    r["user_id"],
                    r["label"],
                    r["start_address"],
                    r["start_lat"],
                    r["start_lon"],
                    r["end_address"],
                    r["end_lat"],
                    r["end_lon"],
                    hhmm(r["depart_local_time"]),
                    hhmm(r.get("return_local_time")),
                    json.dumps(sorted(r["days_of_week"])),
                    r["timezone"],
                    int(r["active"]),
                    int(r.get("muted") or False),
                    utc(r["created_at"]),
                ),  # fmt: skip
            )
        for c in data["notification_channels"]:
            dest = c.get("destination") or {}
            keys = dest.get("keys") or {}
            if not (dest.get("endpoint") and keys.get("p256dh") and keys.get("auth")):
                continue  # malformed rows were skipped by the old cron too
            conn.execute(
                """INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO NOTHING""",
                (
                    c["id"],
                    c["user_id"],
                    dest["endpoint"],
                    keys["p256dh"],
                    keys["auth"],
                    utc(c.get("updated_at") or c["created_at"]),
                ),  # fmt: skip
            )
        for n in data["notifications"]:
            conn.execute(
                """INSERT INTO notifications (id, user_id, ride_id, scheduled_for, forecast_json,
                       verdict_text, score, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    n["id"],
                    n["user_id"],
                    n["ride_id"],
                    utc(n["scheduled_for"]),
                    json.dumps(n["forecast_json"]) if n.get("forecast_json") else None,
                    n.get("verdict_text"),
                    n.get("score"),
                    utc(n.get("sent_at")),
                ),  # fmt: skip
            )
        counts = {
            table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in ("users", "profiles", "rides", "push_subscriptions", "notifications")
        }
    return counts


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        print("Export query for the Supabase SQL editor:\n" + EXPORT_SQL)
        return 2
    data = json.loads(Path(argv[0]).read_text())
    # The SQL editor's download wraps the cell: a list of rows, each keyed by
    # the column name, with the JSON sometimes left as a string.
    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if isinstance(data, dict) and "export" in data:
        data = data["export"]
    if isinstance(data, str):
        data = json.loads(data)
    if not isinstance(data, dict):
        print("not an export: expected one JSON object with users, rides, …", file=sys.stderr)
        return 1
    for table, count in run(data).items():
        print(f"{table}: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
