"""The Python port must say exactly what the TypeScript version said: the
verdict prompt, push text, next departure and compass point. The golden file was
generated from the old code (src/lib) before it was removed."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from bike_my_day.geo import LatLon, compass
from bike_my_day.push import render
from bike_my_day.schedule import next_occurrence
from bike_my_day.verdict import build_prompt

GOLDEN = json.loads((Path(__file__).parent / "golden" / "typescript.json").read_text())


@pytest.mark.parametrize("name", ["one_way_sv", "round_trip_en"])
def test_prompt_matches_typescript(name):
    case = GOLDEN[name]
    i = case["input"]
    system, user = build_prompt(
        i["rideLabel"],
        LatLon(i["start"]["lat"], i["start"]["lon"]),
        LatLon(i["end"]["lat"], i["end"]["lon"]),
        i["preferences"],
        i["snapshot"],
        i.get("returnSnapshot"),
        i["locale"],
    )
    assert system == case["prompt"]["system"]
    assert user == case["prompt"]["user"]


def test_push_text_matches_typescript():
    first, second = GOLDEN["push"]
    assert (
        render(
            "Jobbet",
            "2026-04-27T08:00",
            "Bra.",
            4,
            "/rides/x/forecast",
            {
                "temperature_c": 14,
                "apparent_temperature_c": 12.5,
                "precipitation_mm": 0,
                "wind_speed_ms": 3.2,
                "wind_gusts_ms": 7,
            },
        )
        == first
    )
    assert render("Jobbet", "2026-04-27T08:00", "Hm.", None, "/dashboard", None) == second


def test_next_occurrence_matches_typescript():
    for case in GOLDEN["next"]:
        now = datetime.fromisoformat(case["now"].replace("Z", "+00:00"))
        at = next_occurrence(case["days"], case["time"], case["tz"], now)
        assert (
            at.astimezone().isoformat()
            == datetime.fromisoformat(case["at"].replace("Z", "+00:00")).astimezone().isoformat()
        )


def test_compass_matches_typescript():
    for deg, expected in GOLDEN["compass"]:
        assert compass(deg) == expected
