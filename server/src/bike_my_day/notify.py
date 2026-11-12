"""The nightly forecast run: one push per ride departing in the next 24 hours.

Run by a systemd timer at 04:00 Europe/Stockholm:  python -m bike_my_day.notify
`--dry-run` lists what would be sent without calling Open-Meteo, Claude or the
push services.

Idempotent: `notifications.unique(ride_id, scheduled_for)` plus the `sent_at`
check mean a rerun sends nothing twice. A ride whose every push failed keeps
`sent_at` unset, so a rerun retries it.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from bike_my_day import config, db, push
from bike_my_day.schedule import Due, select_due
from bike_my_day.verdict import VerdictRun, run_verdict

log = logging.getLogger("bike_my_day.notify")

# Each ride costs a weather fetch and a model call, seconds apiece. A small pool
# keeps the run short without stampeding Open-Meteo or Anthropic.
CONCURRENCY = 5


def _verdict(due: Due, profiles: dict[str, dict[str, str]], now: datetime) -> VerdictRun | str:
    profile = profiles.get(due.ride["user_id"], {"preferences": "", "locale": "sv"})
    try:
        return run_verdict(due.ride, profile["preferences"], profile["locale"], now)
    except Exception as err:
        log.warning("verdict failed for ride %s: %s", due.ride["id"], err)
        return str(err)


def run(now: datetime | None = None, dry_run: bool = False) -> list[dict[str, Any]]:
    now = now or datetime.now(UTC)
    started = time.monotonic()
    results: list[dict[str, Any]] = []

    with db.connect() as conn:
        rows = conn.execute(
            f"SELECT user_id, {db.RIDE_COLUMNS} FROM rides WHERE active = 1 ORDER BY created_at"
        ).fetchall()
        rides = [{**db.ride_out(r), "user_id": r["user_id"]} for r in rows]
        due = select_due(now, rides)

        subs_by_user: dict[str, list[Any]] = {}
        for s in conn.execute("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions"):
            subs_by_user.setdefault(s["user_id"], []).append(s)
        profiles = {
            p["user_id"]: {"preferences": p["preferences"], "locale": p["locale"]}
            for p in conn.execute("SELECT user_id, preferences, locale FROM profiles")
        }

        def result(d: Due, status: str, detail: str) -> dict[str, Any]:
            return {
                "ride_id": d.ride["id"],
                "scheduled_for": db.iso(d.scheduled_for),
                "status": status,
                "detail": detail,
            }

        todo: list[Due] = []
        for d in due:
            devices = subs_by_user.get(d.ride["user_id"], [])
            already = conn.execute(
                "SELECT sent_at FROM notifications WHERE ride_id = ? AND scheduled_for = ?",
                (d.ride["id"], db.iso(d.scheduled_for)),
            ).fetchone()
            if d.ride["muted"]:
                results.append(result(d, "skipped", "muted"))
            elif not devices:
                results.append(result(d, "skipped", "no push subscription"))
            elif already is not None and already["sent_at"]:
                results.append(result(d, "skipped", "already sent"))
            elif dry_run:
                results.append(result(d, "dry_run", f"would push to {len(devices)} device(s)"))
            else:
                todo.append(d)

        # Network work in the pool; every database write stays on this thread.
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            verdicts = list(pool.map(lambda d: _verdict(d, profiles, now), todo))

        for d, run_ in zip(todo, verdicts, strict=True):
            if isinstance(run_, str):
                results.append(result(d, "error", run_))
                continue
            s = run_.snapshot
            payload = push.render(
                d.ride["label"],
                s["as_of_local"],
                run_.text,
                run_.score,
                f"/rides/{d.ride['id']}/forecast",
                {
                    "temperature_c": s["temperature_c"],
                    "apparent_temperature_c": s["apparent_temperature_c"],
                    "precipitation_mm": s["precipitation_mm"],
                    "wind_speed_ms": s["wind_speed_ms"],
                    "wind_gusts_ms": s["wind_gusts_ms"],
                },
            )
            fan = push.send_to_all(conn, subs_by_user[d.ride["user_id"]], payload)
            pruned = f", pruned {fan.pruned} expired" if fan.pruned else ""
            if fan.sent == 0:
                # All-expired is the rider's state, nothing to retry; any real
                # failure leaves sent_at unset so a rerun tries again.
                if fan.failures:
                    detail = f"push failed for all devices: {fan.failures[0]}{pruned}"
                    results.append(result(d, "error", detail))
                else:
                    results.append(result(d, "skipped", "all subscriptions expired"))
                continue
            conn.execute(
                """INSERT INTO notifications (id, user_id, ride_id, scheduled_for, forecast_json,
                       verdict_text, score, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(ride_id, scheduled_for) DO UPDATE SET
                       forecast_json = excluded.forecast_json,
                       verdict_text = excluded.verdict_text,
                       score = excluded.score, sent_at = excluded.sent_at""",
                (
                    db.new_id(),
                    d.ride["user_id"],
                    d.ride["id"],
                    db.iso(d.scheduled_for),
                    json.dumps(s),
                    run_.text,
                    run_.score,
                    db.now_iso(),
                ),  # fmt: skip
            )
            conn.commit()  # one ride's record must not wait on the next ride's push
            total = len(subs_by_user[d.ride["user_id"]])
            results.append(result(d, "sent", f"pushed to {fan.sent}/{total} device(s){pruned}"))

    log.info(
        "%d candidate(s), %d due, %.1fs: %s",
        len(rides),
        len(due),
        time.monotonic() - started,
        json.dumps(results, ensure_ascii=False),
    )
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Send tonight's bike forecasts.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    if not args.dry_run and not (config.VAPID_PRIVATE and config.VAPID_PUBLIC):
        log.error("VAPID keys are not configured")
        return 1
    results = run(dry_run=args.dry_run)
    return 1 if any(r["status"] == "error" for r in results) else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    sys.exit(main())
