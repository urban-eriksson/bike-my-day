from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from bike_my_day import verdict, weather


def body(hour="2026-04-27T08:00", **overrides):
    hourly = {
        "time": [hour],
        "temperature_2m": [3.6],
        "apparent_temperature": [-1.5],
        "precipitation_probability": [None],
        "precipitation": [0],
        "weather_code": [3],
        "cloud_cover": [87],
        "wind_speed_10m": [4.7],
        "wind_direction_10m": [342],
        "wind_gusts_10m": [9.1],
        "is_day": [1],
    }
    hourly.update(overrides)
    return {
        "timezone": "Europe/Stockholm",
        "hourly": hourly,
        "daily": {"time": ["2026-04-27"], "sunrise": ["2026-04-27T05:30"],
                  "sunset": ["2026-04-27T20:45"]},
    }  # fmt: skip


def test_parse_snapshot():
    s = weather.parse(body(), "2026-04-27T08:00", "Europe/Stockholm")
    assert s["temperature_c"] == 3.6
    assert s["precipitation_probability_pct"] is None
    assert s["is_day"] is True


def test_parse_missing_hour():
    with pytest.raises(RuntimeError, match="did not include hour"):
        weather.parse(body(), "2026-04-27T09:00", "Europe/Stockholm")


def test_parse_non_numeric():
    with pytest.raises(RuntimeError, match="temperature_2m"):
        weather.parse(body(temperature_2m=[None]), "2026-04-27T08:00", "Europe/Stockholm")


def test_local_hour():
    at = datetime(2026, 4, 27, 6, 30, tzinfo=UTC)
    assert weather.local_hour(at, "Europe/Stockholm") == "2026-04-27T08:00"


def test_parse_output():
    assert verdict.parse_output("SCORE: 4\nGreat morning.") == ("Great morning.", 4)
    assert verdict.parse_output("Just a sentence.") == ("Just a sentence.", None)
    assert verdict.parse_output("SCORE: 9\nToo high.") == ("SCORE: 9\nToo high.", None)


class FakeProvider:
    def __init__(self):
        self.calls = []

    def forecast(self, lat, lon, at, timezone):
        self.calls.append((lat, lon, weather.local_hour(at, timezone)))
        hour = weather.local_hour(at, timezone)
        return weather.parse(body(hour), hour, timezone)


class FakeClient:
    def __init__(self, text, stop_reason="end_turn"):
        self.sent = []
        self.messages = self
        self.text = text
        self.stop_reason = stop_reason

    def create(self, **kwargs):
        self.sent.append(kwargs)
        # Haiku 5.5 may think first: the answer is not necessarily content[0].
        content = [SimpleNamespace(type="thinking", thinking="")]
        if self.text:
            content.append(SimpleNamespace(type="text", text=self.text))
        return SimpleNamespace(
            content=content,
            stop_reason=self.stop_reason,
            usage=SimpleNamespace(input_tokens=100, output_tokens=20),
        )


RIDE = {
    "label": "Jobbet", "start_lat": 59.33, "start_lon": 18.07, "end_lat": 59.4,
    "end_lon": 17.95, "depart_local_time": "08:00", "return_local_time": "17:00",
    "days_of_week": [1], "timezone": "Europe/Stockholm",
}  # fmt: skip


def test_run_verdict_round_trip():
    provider, client = FakeProvider(), FakeClient("SCORE: 3\nMotvind hem.")
    run = verdict.run_verdict(
        RIDE, "", "sv", datetime(2026, 4, 26, 20, tzinfo=UTC), provider=provider, client=client
    )
    assert run.score == 3 and run.text == "Motvind hem."
    assert provider.calls == [
        (59.33, 18.07, "2026-04-27T08:00"),
        (59.4, 17.95, "2026-04-27T17:00"),
    ]
    sent = client.sent[0]
    assert sent["model"] == "claude-haiku-5-5"
    assert sent["output_config"] == {"effort": "low"}
    assert "=== Return leg ===" in sent["messages"][0]["content"]
    assert "Swedish" in sent["system"]


@pytest.mark.parametrize(
    ("text", "stop_reason"), [("", "refusal"), ("", "max_tokens")], ids=["refusal", "only-thinking"]
)
def test_run_verdict_fails_loudly_without_an_answer(text, stop_reason):
    # Callers skip the ride (nightly) or answer 502 (preview) instead of
    # pushing an empty notification.
    client = FakeClient(text, stop_reason)
    with pytest.raises(RuntimeError):
        verdict.run_verdict(
            RIDE,
            "",
            "sv",
            datetime(2026, 4, 26, 20, tzinfo=UTC),
            provider=FakeProvider(),
            client=client,
        )


@pytest.mark.skipif("not config.getoption('--live')", reason="hits Photon and Open-Meteo")
def test_live_services_accept_us():
    """Photon 403s a generic User-Agent; this is the check that we send a real one."""
    from bike_my_day import geocode

    [hit] = geocode.geocode("Storgatan 1", count=1, timezone="Europe/Stockholm")
    assert 55 < hit.latitude < 69.5 and 10 < hit.longitude < 24.5
    snapshot = weather.OpenMeteo().forecast(59.33, 18.07, datetime.now(UTC), "Europe/Stockholm")
    assert "temperature_c" in snapshot
