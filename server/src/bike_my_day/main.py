"""bike-my-day API. The web app (static, on CloudFront) is the only client; every
route but health, the push key and login needs a bearer token."""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from bike_my_day import auth, config, db, geocode, push
from bike_my_day.auth import CurrentUser, Db
from bike_my_day.verdict import run_verdict

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bike_my_day.api")

app = FastAPI(title="bike my day")
if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.include_router(auth.router)

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_PREFERENCES = 4000


# --- health, push key ------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/push/key")
def push_key() -> dict[str, str | None]:
    return {"key": config.VAPID_PUBLIC or None}


# --- me / profile ----------------------------------------------------------


def _profile(conn: sqlite3.Connection, user_id: str) -> dict[str, str]:
    row = conn.execute(
        "SELECT preferences, locale FROM profiles WHERE user_id = ?", (user_id,)
    ).fetchone()
    return (
        {"preferences": row["preferences"], "locale": row["locale"]}
        if row
        else {
            "preferences": "",
            "locale": "sv",
        }
    )


@app.get("/api/me")
def me(user: CurrentUser, conn: Db) -> dict[str, Any]:
    """Who am I, plus a fresh token: a rider who opens the app every few
    months never meets the expiry."""
    rides = conn.execute("SELECT count(*) FROM rides WHERE user_id = ?", (user.id,)).fetchone()[0]
    return {
        "user": user.model_dump(),
        "profile": _profile(conn, user.id),
        "rides": rides,
        "token": auth.create_token(user),
    }


class ProfileIn(BaseModel):
    preferences: str | None = Field(default=None, max_length=MAX_PREFERENCES)
    locale: str | None = None

    @field_validator("locale")
    @classmethod
    def known_locale(cls, value: str | None) -> str | None:
        if value is not None and value not in ("sv", "en"):
            raise ValueError("locale must be sv or en")
        return value


@app.put("/api/me/profile")
def save_profile(body: ProfileIn, user: CurrentUser, conn: Db) -> dict[str, str]:
    """The locale lives here as well as in the browser: the nightly job has no
    request to read it from."""
    current = _profile(conn, user.id)
    preferences = (
        body.preferences.strip() if body.preferences is not None else current["preferences"]
    )
    locale = body.locale or current["locale"]
    conn.execute(
        """INSERT INTO profiles (user_id, preferences, locale) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET preferences = excluded.preferences,
           locale = excluded.locale""",
        (user.id, preferences, locale),
    )
    return {"preferences": preferences, "locale": locale}


# --- rides -----------------------------------------------------------------


def _own_ride(conn: sqlite3.Connection, user_id: str, ride_id: str) -> dict[str, Any]:
    row = conn.execute(
        f"SELECT {db.RIDE_COLUMNS} FROM rides WHERE id = ? AND user_id = ?", (ride_id, user_id)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="ride not found")
    return db.ride_out(row)


class Place(BaseModel):
    address: str = Field(min_length=1, max_length=300)
    # Pinned when the rider picked an autocomplete suggestion.
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)


class RideIn(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    start: Place
    end: Place
    depart_local_time: str
    return_local_time: str | None = None
    days_of_week: list[int] = Field(min_length=1, max_length=7)
    timezone: str = Field(min_length=1, max_length=64)
    muted: bool = False

    @field_validator("label")
    @classmethod
    def strip_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("label is required")
        return value

    @field_validator("depart_local_time", "return_local_time")
    @classmethod
    def hhmm(cls, value: str | None) -> str | None:
        if value is not None and not HHMM.match(value):
            raise ValueError("time must be HH:MM")
        return value

    @field_validator("days_of_week")
    @classmethod
    def days(cls, value: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in value):
            raise ValueError("days are 0 (Sunday) to 6")
        return sorted(set(value))

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as err:
            raise ValueError("unknown timezone") from err
        return value


def _resolve(place: Place, field: str, timezone: str) -> tuple[str, float, float]:
    if place.lat is not None and place.lon is not None:
        return place.address.strip(), place.lat, place.lon
    try:
        hits = geocode.geocode(place.address, count=1, timezone=timezone)
    except Exception as err:
        raise HTTPException(status_code=502, detail="geocoding failed") from err
    if not hits:
        raise HTTPException(status_code=422, detail={"field": field, "error": "not_found"})
    return hits[0].label, hits[0].latitude, hits[0].longitude


def _validate_times(body: RideIn) -> None:
    if body.return_local_time is not None and body.return_local_time <= body.depart_local_time:
        raise HTTPException(status_code=422, detail={"field": "return", "error": "before_depart"})


@app.get("/api/rides")
def list_rides(user: CurrentUser, conn: Db) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"SELECT {db.RIDE_COLUMNS} FROM rides WHERE user_id = ? ORDER BY created_at DESC",
        (user.id,),
    ).fetchall()
    return [db.ride_out(r) for r in rows]


@app.post("/api/rides", status_code=201)
def create_ride(body: RideIn, user: CurrentUser, conn: Db) -> dict[str, Any]:
    _validate_times(body)
    start = _resolve(body.start, "start", body.timezone)
    end = _resolve(body.end, "end", body.timezone)
    ride_id = db.new_id()
    conn.execute(
        """INSERT INTO rides (id, user_id, label, start_address, start_lat, start_lon,
               end_address, end_lat, end_lon, depart_local_time, return_local_time,
               days_of_week, timezone, muted, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            ride_id,
            user.id,
            body.label,
            *start,
            *end,
            body.depart_local_time,
            body.return_local_time,
            json.dumps(body.days_of_week),
            body.timezone,
            int(body.muted),
            db.now_iso(),
        ),  # fmt: skip
    )
    return _own_ride(conn, user.id, ride_id)


@app.put("/api/rides/{ride_id}")
def update_ride(ride_id: str, body: RideIn, user: CurrentUser, conn: Db) -> dict[str, Any]:
    """Coordinates are kept when the address text is unchanged; an edited
    address uses the pinned coordinates or is geocoded, as on create."""
    _validate_times(body)
    existing = _own_ride(conn, user.id, ride_id)
    start = (
        (existing["start_address"], existing["start_lat"], existing["start_lon"])
        if body.start.address.strip() == existing["start_address"]
        else _resolve(body.start, "start", body.timezone)
    )
    end = (
        (existing["end_address"], existing["end_lat"], existing["end_lon"])
        if body.end.address.strip() == existing["end_address"]
        else _resolve(body.end, "end", body.timezone)
    )
    conn.execute(
        """UPDATE rides SET label = ?, start_address = ?, start_lat = ?, start_lon = ?,
               end_address = ?, end_lat = ?, end_lon = ?, depart_local_time = ?,
               return_local_time = ?, days_of_week = ?, timezone = ?, muted = ?
           WHERE id = ? AND user_id = ?""",
        (
            body.label,
            *start,
            *end,
            body.depart_local_time,
            body.return_local_time,
            json.dumps(body.days_of_week),
            body.timezone,
            int(body.muted),
            ride_id,
            user.id,
        ),  # fmt: skip
    )
    return _own_ride(conn, user.id, ride_id)


@app.delete("/api/rides/{ride_id}")
def delete_ride(ride_id: str, user: CurrentUser, conn: Db) -> dict[str, bool]:
    conn.execute("DELETE FROM rides WHERE id = ? AND user_id = ?", (ride_id, user.id))
    return {"deleted": True}


@app.get("/api/rides/{ride_id}/preview")
def preview(ride_id: str, user: CurrentUser, conn: Db) -> dict[str, Any]:
    """A live verdict for the next departure. Costs one Claude call, so it runs
    only when the rider asks for it."""
    ride = _own_ride(conn, user.id, ride_id)
    profile = _profile(conn, user.id)
    try:
        run = run_verdict(ride, profile["preferences"], profile["locale"], datetime.now(UTC))
    except Exception as err:
        log.exception("preview failed for ride %s", ride_id)
        raise HTTPException(status_code=502, detail=str(err)) from err
    return {
        "ride": ride,
        "text": run.text,
        "score": run.score,
        "usage": run.usage,
        "snapshot": run.snapshot,
    }


@app.get("/api/rides/{ride_id}/forecast")
def stored_forecast(ride_id: str, user: CurrentUser, conn: Db) -> dict[str, Any]:
    """The latest forecast that was actually pushed, which is what a tapped
    notification should show; no model re-run."""
    ride = _own_ride(conn, user.id, ride_id)
    row = conn.execute(
        """SELECT verdict_text, score, forecast_json, scheduled_for, sent_at FROM notifications
           WHERE ride_id = ? AND sent_at IS NOT NULL ORDER BY scheduled_for DESC LIMIT 1""",
        (ride_id,),
    ).fetchone()
    notification = None
    if row is not None:
        notification = dict(row)
        notification["forecast_json"] = (
            json.loads(row["forecast_json"]) if row["forecast_json"] else None
        )
    return {"ride": ride, "notification": notification}


class Details(BaseModel):
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    precipitation_mm: float | None = None
    wind_speed_ms: float | None = None
    wind_gusts_ms: float | None = None


class PushIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    score: int | None = Field(default=None, ge=0, le=5)
    when_local: str = Field(min_length=16, max_length=32)
    details: Details | None = None


@app.post("/api/rides/{ride_id}/push")
def push_preview(ride_id: str, body: PushIn, user: CurrentUser, conn: Db) -> dict[str, int]:
    """Push the verdict the rider is looking at to their own devices: the same
    path the nightly job takes, so it doubles as an end-to-end push test. The
    text comes from the client rather than a second model call; the only thing
    a rider can spoof is what is pushed to themselves."""
    ride = _own_ride(conn, user.id, ride_id)
    subs = conn.execute(
        "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", (user.id,)
    ).fetchall()
    if not subs:
        raise HTTPException(status_code=409, detail="no_devices")
    payload = push.render(
        ride["label"],
        body.when_local,
        body.text,
        body.score,
        f"/rides/{ride_id}/forecast",
        body.details.model_dump() if body.details else None,
    )
    result = push.send_to_all(conn, subs, payload)
    if result.sent == 0:
        conn.commit()  # keep the pruning
        raise HTTPException(
            status_code=502, detail="push_failed" if result.failures else "all_expired"
        )
    return {"sent": result.sent}


# --- push subscriptions ----------------------------------------------------


class Keys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=512)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(max_length=2048, pattern=r"^https://")
    keys: Keys
    take_over: bool = False


class EndpointIn(BaseModel):
    endpoint: str = Field(max_length=2048)


@app.put("/api/subscriptions")
def save_subscription(body: SubscriptionIn, user: CurrentUser, conn: Db) -> dict[str, bool]:
    """One device per rider: the one where notifications were most recently
    turned on. Turning them on (take_over) replaces any other device. The app
    also re-sends its subscription on every open; that only refreshes this
    device, or claims the slot when the rider has none (so a subscription the
    server lost heals itself), and otherwise answers subscribed=False so the app
    shows notifications as off here."""
    current = conn.execute(
        "SELECT endpoint FROM push_subscriptions WHERE user_id = ?", (user.id,)
    ).fetchone()
    if current and current["endpoint"] != body.endpoint and not body.take_over:
        return {"subscribed": False}
    # The endpoint may belong to another account that used this phone before.
    conn.execute(
        "DELETE FROM push_subscriptions WHERE user_id = ? OR endpoint = ?",
        (user.id, body.endpoint),
    )
    conn.execute(
        """INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (db.new_id(), user.id, body.endpoint, body.keys.p256dh, body.keys.auth, db.now_iso()),
    )
    return {"subscribed": True}


@app.delete("/api/subscriptions")
def delete_subscription(body: EndpointIn, user: CurrentUser, conn: Db) -> dict[str, bool]:
    conn.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
        (body.endpoint, user.id),
    )
    return {"subscribed": False}
