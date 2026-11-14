"""SQLite storage.

The schema mirrors the Supabase one it replaces, so the export imports as-is:
uuid text ids (kept from Supabase, so push subscriptions stay attached to their
rider), `days_of_week` as a JSON array with 0 = Sunday, local times as "HH:MM".
Timestamps are UTC ISO strings ending in Z, which compare correctly as text.

No migration framework: additive changes go in `_migrate`, the rest is a
fresh database.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from bike_my_day import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (email);
CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferences TEXT NOT NULL DEFAULT '',
    locale TEXT NOT NULL DEFAULT 'sv' CHECK (locale IN ('sv', 'en'))
);
CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    start_address TEXT NOT NULL,
    start_lat REAL NOT NULL,
    start_lon REAL NOT NULL,
    end_address TEXT NOT NULL,
    end_lat REAL NOT NULL,
    end_lon REAL NOT NULL,
    depart_local_time TEXT NOT NULL,
    return_local_time TEXT,
    days_of_week TEXT NOT NULL,
    timezone TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    muted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rides_user_idx ON rides (user_id);
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    scheduled_for TEXT NOT NULL,
    forecast_json TEXT,
    verdict_text TEXT,
    score INTEGER,
    sent_at TEXT,
    UNIQUE (ride_id, scheduled_for)
);
"""


def now_iso() -> str:
    return iso(datetime.now(UTC))


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id() -> str:
    return str(uuid.uuid4())


RIDE_COLUMNS = (
    "id, label, start_address, start_lat, start_lon, end_address, end_lat, end_lon, "
    "depart_local_time, return_local_time, days_of_week, timezone, active, muted"
)


def ride_out(row: sqlite3.Row) -> dict[str, Any]:
    ride = dict(row)
    ride["days_of_week"] = json.loads(ride["days_of_week"])
    ride["active"] = bool(ride["active"])
    ride["muted"] = bool(ride["muted"])
    return ride


def _migrate(conn: sqlite3.Connection) -> None:
    """Additive schema changes for databases created before them."""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    # FastAPI opens a request's connection, runs the endpoint and closes it in
    # separate thread-pool calls, which land on different threads when two
    # requests arrive together. Each request still owns its connection and uses
    # it one step at a time, so sqlite3's same-thread check is only in the way.
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request, committed on success."""
    with connect() as conn:
        yield conn
