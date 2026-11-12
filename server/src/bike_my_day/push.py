"""Web push. The payload shape `{title, body, url}` is what `public/sw.js` reads,
and the title/body text matches what the TypeScript version sent."""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from typing import Any

from pywebpush import WebPushException, webpush

from bike_my_day import config
from bike_my_day.geo import js_num

log = logging.getLogger("bike_my_day.push")

# A verdict is stale once the ride window has passed.
TTL_SECONDS = 12 * 3600


class SubscriptionGone(Exception):
    """The push service says the subscription no longer exists (404/410)."""


def stars(score: int) -> str:
    clamped = max(0, min(5, score))
    return "⭐" * clamped + "☆" * (5 - clamped)


def render(
    ride_label: str,
    when_local: str,
    text: str,
    score: int | None,
    url: str,
    details: dict[str, Any] | None,
) -> dict[str, str]:
    lines = [text]
    if details:
        parts: list[str] = []
        t = details.get("temperature_c")
        if t is not None:
            feels = details.get("apparent_temperature_c")
            suffix = f" (feels {js_num(feels)})" if feels is not None else ""
            parts.append(f"{js_num(t)} °C{suffix}")
        mm = details.get("precipitation_mm")
        if mm is not None:
            parts.append(f"{js_num(mm)} mm")
        wind = details.get("wind_speed_ms")
        if wind is not None:
            gusts = details.get("wind_gusts_ms")
            parts.append(
                f"{js_num(wind)} m/s" + (f" (gusts {js_num(gusts)})" if gusts is not None else "")
            )
        if parts:
            lines.append(" · ".join(parts))
    # Stars headline the ride quality; the depart time stands in when the
    # model's score line could not be parsed.
    headline = stars(score) if score is not None else when_local[11:16]
    return {"title": f"{ride_label} — {headline}", "body": "\n".join(lines), "url": url}


def send(sub: sqlite3.Row | dict[str, Any], payload: dict[str, str]) -> None:
    """Raises SubscriptionGone for a dead subscription, RuntimeError otherwise."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=config.VAPID_PRIVATE,
            vapid_claims={"sub": config.VAPID_SUBJECT},
            ttl=TTL_SECONDS,
        )
    except WebPushException as err:
        code = err.response.status_code if err.response is not None else None
        if code in (404, 410):
            raise SubscriptionGone(sub["endpoint"]) from err
        raise RuntimeError(f"push failed ({code})") from err


@dataclass
class Fanout:
    sent: int
    pruned: int
    failures: list[str]


def send_to_all(
    conn: sqlite3.Connection, subs: list[sqlite3.Row], payload: dict[str, str]
) -> Fanout:
    """Push to every device; delete subscriptions the push service reports dead."""
    result = Fanout(sent=0, pruned=0, failures=[])
    for sub in subs:
        try:
            send(sub, payload)
            result.sent += 1
        except SubscriptionGone:
            conn.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub["id"],))
            result.pruned += 1
        except Exception as err:
            log.warning("push to %s failed: %s", sub["id"], err)
            result.failures.append(str(err))
    return result
