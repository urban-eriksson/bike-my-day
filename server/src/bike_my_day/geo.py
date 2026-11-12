"""Route geometry and wind along it.

Conventions (matching meteorological norms):
  - Bearings are compass degrees [0, 360), clockwise from true north: where the
    rider is heading.
  - Wind direction is where the wind blows FROM (Open-Meteo's
    `wind_direction_10m`).
  - headwind > 0 resists the rider, < 0 is a tailwind. crosswind > 0 comes from
    the rider's left, < 0 from their right.
"""

from __future__ import annotations

import math
from typing import NamedTuple

EARTH_RADIUS_KM = 6371

DIRS = (
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
)  # fmt: skip


class LatLon(NamedTuple):
    lat: float
    lon: float


class Wind(NamedTuple):
    headwind: float
    crosswind: float


def bearing(start: LatLon, end: LatLon) -> float:
    """Initial great-circle bearing from start to end. For commute-scale legs it
    is essentially the rhumb-line bearing too."""
    phi1 = math.radians(start.lat)
    phi2 = math.radians(end.lat)
    dlon = math.radians(end.lon - start.lon)
    y = math.sin(dlon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def distance_km(a: LatLon, b: LatLon) -> float:
    """Haversine distance: straight line, not route length."""
    dlat = math.radians(b.lat - a.lat)
    dlon = math.radians(b.lon - a.lon)
    s = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(a.lat)) * math.cos(math.radians(b.lat)) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(s))


def compass(deg: float) -> str:
    """Compass degrees → 16-point direction ("NNW")."""
    return DIRS[js_round(((deg % 360) + 360) % 360 / 22.5) % 16]


def wind_components(leg_bearing: float, wind_from: float, speed: float) -> Wind:
    """With a = wind_from - leg_bearing: headwind = speed*cos(a), crosswind =
    -speed*sin(a). a = 0 is wind straight in the face."""
    a = math.radians(wind_from - leg_bearing)
    return Wind(headwind=speed * math.cos(a), crosswind=-speed * math.sin(a))


def js_round(x: float) -> int:
    """JavaScript's Math.round (halves go up), not Python's banker's rounding.
    The verdict prompt used to be built in TypeScript; keeping its numbers
    identical keeps the model's behaviour identical."""
    return math.floor(x + 0.5)


def round_to(x: float, digits: int = 1) -> float:
    f = 10**digits
    return js_round(x * f) / f


def js_num(x: float | int) -> str:
    """A number as JavaScript's template strings print it: 4.0 → "4"."""
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)
