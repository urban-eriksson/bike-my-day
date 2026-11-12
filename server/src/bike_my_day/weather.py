"""Open-Meteo forecast for one hour at one place.

The snapshot dict is stored as `notifications.forecast_json` and rendered by the
web app, so its keys are part of the API: temperatures in °C, precipitation in
mm, wind in m/s, directions in compass degrees measured FROM.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import httpx

from bike_my_day import config

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

HOURLY_VARS = (
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "is_day",
)
DAILY_VARS = ("sunrise", "sunset")

Snapshot = dict[str, Any]


class Provider(Protocol):
    def forecast(self, lat: float, lon: float, at: datetime, timezone: str) -> Snapshot: ...


def local_hour(at: datetime, timezone: str) -> str:
    """`YYYY-MM-DDTHH:00` in the rider's timezone: Open-Meteo's hourly key."""
    return at.astimezone(ZoneInfo(timezone)).strftime("%Y-%m-%dT%H:00")


class OpenMeteo:
    def __init__(self, client: httpx.Client | None = None, base_url: str = FORECAST_URL) -> None:
        self.client = client or httpx.Client(timeout=20, headers={"user-agent": config.USER_AGENT})
        self.base_url = base_url

    def forecast(self, lat: float, lon: float, at: datetime, timezone: str) -> Snapshot:
        hour_key = local_hour(at, timezone)
        date_key = hour_key[:10]
        res = self.client.get(
            self.base_url,
            params={
                "latitude": lat,
                "longitude": lon,
                "timezone": timezone,
                "wind_speed_unit": "ms",
                "hourly": ",".join(HOURLY_VARS),
                "daily": ",".join(DAILY_VARS),
                "start_date": date_key,
                "end_date": date_key,
                "start_hour": hour_key,
                "end_hour": hour_key,
            },
            headers={"accept": "application/json"},
        )
        if res.status_code != 200:
            raise RuntimeError(f"Open-Meteo forecast failed: {res.status_code}")
        return parse(res.json(), hour_key, timezone)


def parse(body: dict[str, Any], hour_key: str, timezone: str) -> Snapshot:
    hourly = body.get("hourly") or {}
    daily = body.get("daily") or {}
    if "time" not in hourly or "time" not in daily:
        raise RuntimeError("Open-Meteo response missing hourly/daily payload")
    try:
        idx = hourly["time"].index(hour_key)
    except ValueError as err:
        raise RuntimeError(f"Open-Meteo response did not include hour {hour_key}") from err

    def hour(key: str) -> Any:
        values = hourly.get(key) or []
        return values[idx] if idx < len(values) else None

    def number(key: str) -> float:
        v = hour(key)
        if isinstance(v, bool) or not isinstance(v, int | float):
            raise RuntimeError(f"Open-Meteo: missing or non-numeric {key}")
        return v

    def day(key: str) -> str:
        values = daily.get(key) or []
        if not values or not isinstance(values[0], str):
            raise RuntimeError(f"Open-Meteo: missing {key}")
        return values[0]

    probability = hour("precipitation_probability")
    return {
        "as_of_local": hour_key,
        "timezone": body.get("timezone") or timezone,
        "temperature_c": number("temperature_2m"),
        "apparent_temperature_c": number("apparent_temperature"),
        "precipitation_probability_pct": (
            probability if isinstance(probability, int | float) else None
        ),
        "precipitation_mm": number("precipitation"),
        "weather_code": number("weather_code"),
        "cloud_cover_pct": number("cloud_cover"),
        "wind_speed_ms": number("wind_speed_10m"),
        "wind_direction_from_deg": number("wind_direction_10m"),
        "wind_gusts_ms": number("wind_gusts_10m"),
        "is_day": number("is_day") == 1,
        "sunrise_local": day("sunrise"),
        "sunset_local": day("sunset"),
    }
