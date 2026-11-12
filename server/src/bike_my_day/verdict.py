"""The forecast text: weather + wind along the route + the rider's preferences,
turned into one or two sentences and a 0-5 score by Claude.

The prompt text is carried over verbatim from the TypeScript version, and so is
the number formatting (`round_to`, `js_num`), so riders get the same kind of
verdict as before the move.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from bike_my_day import config
from bike_my_day.geo import LatLon, bearing, compass, js_num, round_to, wind_components
from bike_my_day.schedule import minutes_of_day, next_occurrence
from bike_my_day.weather import OpenMeteo, Provider, Snapshot

SYSTEM_PROMPT_BASE = """You are the forecast generator for a bike-commute weather app.

You receive (a) a structured weather snapshot for a specific hour and place, including wind decomposed into headwind / crosswind along the rider's route, and (b) the user's own free-text preferences describing what makes or breaks a ride for them.

Your output has EXACTLY this shape — a score line, then the text:

SCORE: <integer 0-5>
<one or at most two short sentences>

The score rates how good the ride will be, honoring the user's preferences: 5 = perfect conditions, 3 = rideable but flawed, 0 = don't ride. When a return leg is given, cover BOTH legs in the text (out first, then return) and make the score reflect the WORSE leg — the rider commits to the whole day. The text is plain prose — no Markdown, no emoji, no preamble — and:

- Tells the rider whether tomorrow's ride looks good, marginal, or bad, consistent with the score.
- Names the one or two factors that drove that judgment, in concrete numbers (°C, mm, m/s, compass direction).
- Honors the user's preferences over generic norms — if they say "fine in light rain", do not flag light rain as bad; if they say "headwind over 8 m/s is a no", flag any forecast above that.
- Uses headwind / tailwind language directly (the wind component along their leg is given to you — do not re-derive it from raw direction).

Do not hedge with "you might want to consider". Be direct. The rider will read this in 2 seconds and decide."""  # noqa: E501

# Only the prose is localised: the SCORE line stays machine-shaped so parsing is
# language-independent.
LANGUAGE_RULES = {
    "en": "Write the text in English.",
    "sv": "Write the text in Swedish (svenska), in natural idiomatic prose — not translated-sounding English. Use Swedish weather vocabulary (motvind, medvind, byar, nederbörd, halka). Keep the units as given (°C, mm, m/s) and keep the compass direction as the short code you are given. The SCORE line itself stays exactly as specified, in English.",  # noqa: E501
}

SCORE_RE = re.compile(r"^\s*SCORE:\s*([0-5])\s*\n")


def system_prompt(locale: str) -> str:
    return f"{SYSTEM_PROMPT_BASE}\n\n{LANGUAGE_RULES.get(locale, LANGUAGE_RULES['sv'])}"


def _r(x: float, digits: int = 1) -> str:
    return js_num(round_to(x, digits))


def leg_lines(s: Snapshot, leg_bearing: float) -> list[str]:
    wind = wind_components(leg_bearing, s["wind_direction_from_deg"], s["wind_speed_ms"])
    gust = wind_components(leg_bearing, s["wind_direction_from_deg"], s["wind_gusts_ms"])
    head_tail = (
        f"headwind {_r(wind.headwind)} m/s"
        if wind.headwind > 0
        else f"tailwind {_r(-wind.headwind)} m/s"
    )
    side = "from the left" if wind.crosswind > 0 else "from the right"
    cross = f"crosswind {_r(abs(wind.crosswind))} m/s {side}"
    gust_head = (
        f"gusting to {_r(gust.headwind)} m/s headwind"
        if gust.headwind > 0
        else f"gusting to {_r(-gust.headwind)} m/s tailwind"
    )
    probability = s["precipitation_probability_pct"]
    chance = "" if probability is None else f" ({js_num(probability)}% chance)"
    wind_from = s["wind_direction_from_deg"]
    return [
        f"Hour: {s['as_of_local']} ({s['timezone']})",
        f"Leg bearing: {js_num(round_to(leg_bearing, 0))}° ({compass(leg_bearing)})",
        f"Temperature: {_r(s['temperature_c'])} °C "
        f"(feels like {_r(s['apparent_temperature_c'])} °C)",
        f"Precipitation: {_r(s['precipitation_mm'], 2)} mm{chance}",
        f"Cloud cover: {js_num(s['cloud_cover_pct'])}%",
        f"Wind: {_r(s['wind_speed_ms'])} m/s from {js_num(wind_from)}° ({compass(wind_from)}), "
        f"{head_tail}, {cross}",
        f"Gusts: {_r(s['wind_gusts_ms'])} m/s, {gust_head}",
        f"Daylight at depart: {'yes' if s['is_day'] else 'no'} "
        f"(sunrise {s['sunrise_local']}, sunset {s['sunset_local']})",
        f"WMO weather code: {js_num(s['weather_code'])}",
    ]


def build_prompt(
    label: str,
    start: LatLon,
    end: LatLon,
    preferences: str,
    snapshot: Snapshot,
    return_snapshot: Snapshot | None,
    locale: str,
) -> tuple[str, str]:
    lines = [f"Ride: {label}"]
    lines += ["", "=== Outbound leg ==="] if return_snapshot else [""]
    lines += leg_lines(snapshot, bearing(start, end))
    if return_snapshot:
        # Destination → start: the bearing flips, so tailwind out is headwind home.
        lines += ["", "=== Return leg ===", *leg_lines(return_snapshot, bearing(end, start))]
    prefs = preferences.strip()
    lines += [
        "",
        "User preferences (free text — let these override generic norms):",
        prefs if prefs else "(none — apply sensible defaults)",
    ]
    return system_prompt(locale), "\n".join(lines)


def parse_output(raw: str) -> tuple[str, int | None]:
    """A malformed score line degrades to score=None with the text kept: a
    notification without stars beats no notification."""
    match = SCORE_RE.match(raw)
    if not match:
        return raw.strip(), None
    return raw[match.end() :].strip(), int(match.group(1))


@dataclass
class VerdictRun:
    text: str
    score: int | None
    usage: dict[str, int]
    snapshot: Snapshot
    scheduled_for: datetime


def _anthropic() -> Any:
    import anthropic

    return anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY or None)


def run_verdict(
    ride: dict[str, Any],
    preferences: str,
    locale: str,
    now: datetime,
    provider: Provider | None = None,
    client: Any = None,
) -> VerdictRun:
    """Next departure → forecast at the start (and at the destination for the
    return hour on a round trip) → Claude. Touches no database."""
    at = next_occurrence(ride["days_of_week"], ride["depart_local_time"], ride["timezone"], now)
    weather = provider or OpenMeteo()
    snapshot = weather.forecast(ride["start_lat"], ride["start_lon"], at, ride["timezone"])

    # Same-day offset arithmetic sidesteps timezone maths; a return time at or
    # before departure is ignored as invalid.
    return_snapshot = None
    if ride.get("return_local_time"):
        delta = minutes_of_day(ride["return_local_time"]) - minutes_of_day(
            ride["depart_local_time"]
        )
        if delta > 0:
            return_snapshot = weather.forecast(
                ride["end_lat"], ride["end_lon"], at + timedelta(minutes=delta), ride["timezone"]
            )

    system, user = build_prompt(
        ride["label"],
        LatLon(ride["start_lat"], ride["start_lon"]),
        LatLon(ride["end_lat"], ride["end_lon"]),
        preferences,
        snapshot,
        return_snapshot,
        locale,
    )
    response = (client or _anthropic()).messages.create(
        model=config.VERDICT_MODEL,
        max_tokens=256,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    raw = "".join(b.text for b in response.content if b.type == "text")
    text, score = parse_output(raw)
    return VerdictRun(
        text=text,
        score=score,
        usage={
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
        snapshot=snapshot,
        scheduled_for=at,
    )
