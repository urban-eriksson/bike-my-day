import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from bike_my_day import db, mail, main, notify, push, verdict
from bike_my_day.weather import parse

c = TestClient(main.app)


def last_code() -> str:
    match = re.search(r"\b(\d{6})\b", mail.outbox[-1].body)
    assert match
    return match.group(1)


def login(email="rider@example.com"):
    assert c.post("/api/auth/code", json={"email": email}).json() == {"sent": True}
    code = last_code()
    res = c.post("/api/auth/verify", json={"email": email.upper(), "code": code})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_login_and_me():
    h = login()
    me = c.get("/api/me", headers=h).json()
    assert me["user"]["email"] == "rider@example.com"
    assert me["profile"] == {"preferences": "", "locale": "sv"}
    assert me["token"]
    assert "kod" in mail.outbox[-1].subject  # Swedish by default


def test_wrong_code_burns_attempts():
    c.post("/api/auth/code", json={"email": "a@example.com", "locale": "en"})
    code = last_code()
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert (
            c.post("/api/auth/verify", json={"email": "a@example.com", "code": wrong}).status_code
            == 401
        )
    assert (
        c.post("/api/auth/verify", json={"email": "a@example.com", "code": code}).status_code == 401
    )


def test_code_rate_limit():
    for _ in range(3):
        assert c.post("/api/auth/code", json={"email": "b@example.com"}).status_code == 200
    assert c.post("/api/auth/code", json={"email": "b@example.com"}).status_code == 429


def test_requires_token():
    assert c.get("/api/rides").status_code == 401
    assert c.get("/api/rides", headers={"Authorization": "Bearer junk"}).status_code == 401


RIDE = {
    "label": "Jobbet",
    "start": {"address": "Hem", "lat": 59.33, "lon": 18.07},
    "end": {"address": "Jobb", "lat": 59.4, "lon": 17.95},
    "depart_local_time": "08:00",
    "return_local_time": "17:00",
    "days_of_week": [5, 1, 1, 2],
    "timezone": "Europe/Stockholm",
}


def test_ride_crud_and_isolation():
    h = login()
    created = c.post("/api/rides", json=RIDE, headers=h).json()
    assert created["days_of_week"] == [1, 2, 5]
    assert created["muted"] is False

    updated = c.put(
        f"/api/rides/{created['id']}", json={**RIDE, "label": "Ny", "muted": True}, headers=h
    ).json()
    assert updated["label"] == "Ny" and updated["muted"] is True
    assert updated["start_lat"] == 59.33

    other = login("other@example.com")
    assert c.get("/api/rides", headers=other).json() == []
    assert c.get(f"/api/rides/{created['id']}/forecast", headers=other).status_code == 404

    c.delete(f"/api/rides/{created['id']}", headers=h)
    assert c.get("/api/rides", headers=h).json() == []


def test_ride_validation():
    h = login()
    bad_return = {**RIDE, "return_local_time": "07:00"}
    assert c.post("/api/rides", json=bad_return, headers=h).status_code == 422
    assert c.post("/api/rides", json={**RIDE, "days_of_week": []}, headers=h).status_code == 422
    assert (
        c.post("/api/rides", json={**RIDE, "timezone": "Mars/Base"}, headers=h).status_code == 422
    )
    assert (
        c.post("/api/rides", json={**RIDE, "depart_local_time": "8"}, headers=h).status_code == 422
    )


def test_profile():
    h = login()
    assert c.put("/api/me/profile", json={"locale": "en"}, headers=h).json() == {
        "preferences": "",
        "locale": "en",
    }
    c.put("/api/me/profile", json={"preferences": " no rain "}, headers=h)
    assert c.get("/api/me", headers=h).json()["profile"] == {
        "preferences": "no rain",
        "locale": "en",
    }
    assert c.put("/api/me/profile", json={"locale": "de"}, headers=h).status_code == 422


SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "p", "auth": "a"}}


def test_subscription_moves_between_accounts_on_one_phone():
    a, b = login("a@example.com"), login("b@example.com")
    c.put("/api/subscriptions", json=SUB, headers=a)
    c.put("/api/subscriptions", json=SUB, headers=a)  # every app open: idempotent
    c.put("/api/subscriptions", json=SUB, headers=b)
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT u.email FROM push_subscriptions s JOIN users u ON u.id = s.user_id"
        ).fetchall()
    assert [r["email"] for r in rows] == ["b@example.com"]


def test_delete_account_cascades():
    h = login()
    c.post("/api/rides", json=RIDE, headers=h)
    c.put("/api/subscriptions", json=SUB, headers=h)
    assert c.delete("/api/me", headers=h).json() == {"deleted": True}
    assert c.get("/api/me", headers=h).status_code == 401
    with db.connect() as conn:
        for table in ("rides", "push_subscriptions", "users"):
            assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0


def fake_run(ride, preferences, locale, now, provider=None, client=None):
    hour = "2026-04-27T08:00"
    return verdict.VerdictRun(
        text=f"Fint ({locale}, {preferences or '-'})",
        score=4,
        usage={"input_tokens": 1, "output_tokens": 1},
        snapshot=parse(
            {
                "hourly": {
                    "time": [hour],
                    "temperature_2m": [14],
                    "apparent_temperature": [12.5],
                    "precipitation_probability": [0],
                    "precipitation": [0],
                    "weather_code": [1],
                    "cloud_cover": [10],
                    "wind_speed_10m": [3.2],
                    "wind_direction_10m": [200],
                    "wind_gusts_10m": [7],
                    "is_day": [1],
                },
                "daily": {"time": ["2026-04-27"], "sunrise": ["05:30"], "sunset": ["20:45"]},
            },  # fmt: skip
            hour,
            "Europe/Stockholm",
        ),
        scheduled_for=datetime(2026, 4, 27, 6, tzinfo=UTC),
    )


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(notify, "run_verdict", fake_run)
    monkeypatch.setattr(main, "run_verdict", fake_run)
    monkeypatch.setattr(push, "webpush", lambda **kw: calls.append(kw))
    return calls


def test_preview_push_and_forecast(sent):
    h = login()
    ride = c.post("/api/rides", json=RIDE, headers=h).json()
    preview = c.get(f"/api/rides/{ride['id']}/preview", headers=h).json()
    assert preview["score"] == 4 and preview["snapshot"]["temperature_c"] == 14

    body = {"text": preview["text"], "score": 4, "when_local": "2026-04-27T08:00"}
    assert c.post(f"/api/rides/{ride['id']}/push", json=body, headers=h).status_code == 409
    c.put("/api/subscriptions", json=SUB, headers=h)
    assert c.post(f"/api/rides/{ride['id']}/push", json=body, headers=h).json() == {"sent": 1}
    assert "Jobbet — ⭐⭐⭐⭐☆" in sent[0]["data"]

    assert c.get(f"/api/rides/{ride['id']}/forecast", headers=h).json()["notification"] is None


def test_nightly_run(sent):
    h = login()
    c.put("/api/me/profile", json={"preferences": "inget regn", "locale": "en"}, headers=h)
    ride = c.post("/api/rides", json={**RIDE, "days_of_week": [1]}, headers=h).json()
    muted = c.post(
        "/api/rides", json={**RIDE, "label": "Tyst", "days_of_week": [1], "muted": True}, headers=h
    ).json()
    c.put("/api/subscriptions", json=SUB, headers=h)
    sunday_evening = datetime(2026, 4, 26, 20, tzinfo=UTC)

    dry = notify.run(sunday_evening, dry_run=True)
    assert {r["status"] for r in dry} == {"dry_run", "skipped"}
    assert sent == []

    results = {r["ride_id"]: r for r in notify.run(sunday_evening)}
    assert results[ride["id"]]["status"] == "sent"
    assert results[muted["id"]]["detail"] == "muted"
    assert len(sent) == 1 and "Fint (en, inget regn)" in sent[0]["data"]
    assert f"/rides/{ride['id']}/forecast" in sent[0]["data"]

    again = {r["ride_id"]: r for r in notify.run(sunday_evening)}
    assert again[ride["id"]]["detail"] == "already sent" and len(sent) == 1

    stored = c.get(f"/api/rides/{ride['id']}/forecast", headers=h).json()["notification"]
    assert stored["score"] == 4 and stored["forecast_json"]["wind_gusts_ms"] == 7
    assert stored["scheduled_for"] == "2026-04-27T06:00:00Z"


def test_nightly_prunes_dead_subscriptions(monkeypatch):
    from types import SimpleNamespace

    from pywebpush import WebPushException

    def gone(**kw):
        raise WebPushException("gone", response=SimpleNamespace(status_code=410))

    monkeypatch.setattr(notify, "run_verdict", fake_run)
    monkeypatch.setattr(push, "webpush", gone)
    h = login()
    c.post("/api/rides", json={**RIDE, "days_of_week": [1]}, headers=h)
    c.put("/api/subscriptions", json=SUB, headers=h)
    [result] = notify.run(datetime(2026, 4, 26, 20, tzinfo=UTC))
    assert result["detail"] == "all subscriptions expired"
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM push_subscriptions").fetchone()[0] == 0
