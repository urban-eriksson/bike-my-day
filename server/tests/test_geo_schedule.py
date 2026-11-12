import math
from datetime import UTC, datetime, timedelta

import pytest

from bike_my_day.geo import LatLon, bearing, distance_km, wind_components
from bike_my_day.schedule import next_occurrence, select_due


def near(a, b, eps=0.5):
    return abs(a - b) < eps


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [((0, 0), (1, 0), 0), ((0, 0), (0, 1), 90), ((1, 0), (0, 0), 180), ((0, 1), (0, 0), 270)],
)
def test_bearing_cardinals(start, end, expected):
    assert near(bearing(LatLon(*start), LatLon(*end)), expected)


def test_uppsala_to_stockholm_is_south_southeast():
    assert 150 < bearing(LatLon(59.86, 17.64), LatLon(59.33, 18.07)) < 180


def test_distance_stockholm_uppsala():
    assert 60 < distance_km(LatLon(59.33, 18.07), LatLon(59.86, 17.64)) < 70


@pytest.mark.parametrize(
    ("leg", "wind_from", "head", "cross"),
    [(0, 180, -10, 0), (0, 0, 10, 0), (0, 90, 0, -10), (0, 270, 0, 10), (90, 0, 0, 10)],
)
def test_wind_components(leg, wind_from, head, cross):
    w = wind_components(leg, wind_from, 10)
    assert math.isclose(w.headwind, head, abs_tol=1e-9)
    assert math.isclose(w.crosswind, cross, abs_tol=1e-9)


FRIDAY_NOON = datetime(2026, 4, 24, 12, tzinfo=UTC)  # Fri 14:00 Stockholm
WEEKDAYS = [1, 2, 3, 4, 5]


def utc(at):
    return at.astimezone(UTC).replace(tzinfo=None)


def test_next_occurrence_skips_to_monday():
    at = next_occurrence(WEEKDAYS, "08:00", "Europe/Stockholm", FRIDAY_NOON)
    assert utc(at) == datetime(2026, 4, 27, 6)


def test_next_occurrence_later_today():
    at = next_occurrence(
        WEEKDAYS, "08:00", "Europe/Stockholm", datetime(2026, 4, 24, 5, tzinfo=UTC)
    )
    assert utc(at) == datetime(2026, 4, 24, 6)


def test_next_occurrence_tokyo():
    at = next_occurrence(WEEKDAYS, "08:00", "Asia/Tokyo", FRIDAY_NOON)
    assert utc(at) == datetime(2026, 4, 26, 23)


def test_next_occurrence_rejects_garbage():
    with pytest.raises(ValueError):
        next_occurrence([1], "noon", "Europe/Stockholm", FRIDAY_NOON)


RIDE = {"id": "r1", "days_of_week": WEEKDAYS, "depart_local_time": "08:00",
        "timezone": "Europe/Stockholm"}  # fmt: skip


def test_select_due_window():
    sunday_late = datetime(2026, 4, 26, 20, tzinfo=UTC)
    due = select_due(sunday_late, [RIDE])
    assert [utc(d.scheduled_for) for d in due] == [datetime(2026, 4, 27, 6)]
    assert select_due(datetime(2026, 4, 24, 18, tzinfo=UTC), [RIDE]) == []
    assert len(select_due(datetime(2026, 4, 25, 14, tzinfo=UTC), [RIDE], timedelta(hours=60))) == 1


def test_select_due_skips_malformed():
    broken = {**RIDE, "depart_local_time": "nope"}
    assert select_due(datetime(2026, 4, 26, 20, tzinfo=UTC), [broken]) == []
