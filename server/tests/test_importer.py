from datetime import UTC, datetime

import pytest

from bike_my_day import db, importer, notify, push
from tests.test_api import fake_run

UID = "6f1c2a43-0d5e-4a51-9f0b-1c2d3e4f5a6b"
RIDE_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

EXPORT = {
    "export": {
        "users": [
            {"id": UID, "email": "rider@example.com", "created_at": "2026-04-01T10:00:00.123+00:00"}
        ],
        "profiles": [{"user_id": UID, "preferences": "no rain", "locale": "en"}],
        "rides": [
            {
                "id": RIDE_ID,
                "user_id": UID,
                "label": "Jobbet",
                "start_address": "Hem",
                "start_lat": 59.33,
                "start_lon": 18.07,
                "end_address": "Jobb",
                "end_lat": 59.4,
                "end_lon": 17.95,
                "depart_local_time": "08:00:00",
                "return_local_time": None,
                "days_of_week": [5, 1],
                "timezone": "Europe/Stockholm",
                "active": True,
                "muted": False,
                "created_at": "2026-04-01T10:05:00+00:00",
            }
        ],  # fmt: skip
        "notification_channels": [
            {
                "id": "c1",
                "user_id": UID,
                "kind": "webpush",
                "created_at": "2026-04-01T10:06:00+00:00",
                "updated_at": "2026-04-02T10:06:00+00:00",
                "destination": {
                    "endpoint": "https://push.example/x",
                    "keys": {"p256dh": "p", "auth": "a"},
                },
            },
            {
                "id": "c2",
                "user_id": UID,
                "kind": "webpush",
                "created_at": "2026-04-01T10:06:00+00:00",
                "destination": {"endpoint": "https://push.example/broken"},
            },
        ],  # fmt: skip
        "notifications": [
            {
                "id": "n1",
                "user_id": UID,
                "ride_id": RIDE_ID,
                "scheduled_for": "2026-04-27T06:00:00+00:00",
                "forecast_json": {"temperature_c": 4},
                "verdict_text": "Kallt.",
                "score": 2,
                "sent_at": "2026-04-27T02:00:03.5+00:00",
            }
        ],  # fmt: skip
    }
}


def test_import_keeps_ids_and_feeds_the_nightly_run(tmp_path, monkeypatch):
    path = tmp_path / "export.json"
    import json

    path.write_text(json.dumps(EXPORT))
    assert importer.main([str(path)]) == 0
    with db.connect() as conn:
        ride = db.ride_out(conn.execute(f"SELECT {db.RIDE_COLUMNS} FROM rides").fetchone())
        sub = conn.execute("SELECT user_id, endpoint FROM push_subscriptions").fetchall()
    assert ride["depart_local_time"] == "08:00" and ride["days_of_week"] == [1, 5]
    assert [(s["user_id"], s["endpoint"]) for s in sub] == [(UID, "https://push.example/x")]

    # The point of keeping ids: the first nightly run after cutover reaches the
    # phone with nobody having opened the new app.
    sent = []
    monkeypatch.setattr(notify, "run_verdict", fake_run)
    monkeypatch.setattr(push, "webpush", lambda **kw: sent.append(kw))
    [result] = notify.run(datetime(2026, 5, 3, 20, tzinfo=UTC))
    assert result["status"] == "sent" and "Fint (en, no rain)" in sent[0]["data"]


def test_import_refuses_a_populated_database(tmp_path):
    importer.run(EXPORT["export"])
    with pytest.raises(SystemExit):
        importer.run(EXPORT["export"])


def test_main_unwraps_the_sql_editor_download(tmp_path):
    import json

    path = tmp_path / "export.json"
    path.write_text(json.dumps([{"export": json.dumps(EXPORT["export"])}]))
    assert importer.main([str(path)]) == 0
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM rides").fetchone()[0] == 1
