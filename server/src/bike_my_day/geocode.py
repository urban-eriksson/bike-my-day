"""Photon (OpenStreetMap) geocoding, keyless.

The browser calls Photon directly for autocomplete (it allows CORS); the server
only falls back to it when a ride is saved with a free-typed address that has
no pinned coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from bike_my_day import config

SEARCH_URL = "https://photon.komoot.io/api"


@dataclass
class Hit:
    label: str
    latitude: float
    longitude: float


def _str(v: Any) -> str | None:
    return v if isinstance(v, str) and v else None


def normalize(feature: dict[str, Any]) -> Hit | None:
    coords = (feature.get("geometry") or {}).get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    if not all(isinstance(c, int | float) for c in coords[:2]):
        return None
    p = feature.get("properties") or {}
    street = _str(p.get("street"))
    housenumber = _str(p.get("housenumber"))
    primary = _str(p.get("name")) or (
        " ".join(x for x in (street, housenumber) if x) if street else None
    )
    if not primary:
        return None
    locality = _str(p.get("city")) or _str(p.get("district")) or _str(p.get("state"))
    parts: list[str] = []
    for part in (primary, locality, _str(p.get("country"))):
        if part and part not in parts:
            parts.append(part)
    return Hit(label=", ".join(parts), latitude=coords[1], longitude=coords[0])


# The same region the browser's autocomplete uses for Swedish riders: without
# it a free-typed "Storgatan 2" can resolve to the other side of Europe.
SWEDEN_BBOX = "10.0,55.0,24.5,69.5"
STOCKHOLM = {"lat": 59.33, "lon": 18.07}


def geocode(
    query: str, count: int = 5, timezone: str | None = None, client: httpx.Client | None = None
) -> list[Hit]:
    q = query.strip()
    if len(q) < 2:
        return []
    params: dict[str, str | int | float] = {"q": q, "limit": count}
    if timezone == "Europe/Stockholm":
        params.update(bbox=SWEDEN_BBOX, **STOCKHOLM)
    http = client or httpx.Client(timeout=10, headers={"user-agent": config.USER_AGENT})
    res = http.get(SEARCH_URL, params=params)
    if res.status_code != 200:
        raise RuntimeError(f"Geocoding failed: {res.status_code}")
    features = res.json().get("features") or []
    return [hit for hit in (normalize(f) for f in features) if hit is not None]
