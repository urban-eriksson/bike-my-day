import os
import tempfile

# Before any bike_my_day import: config reads the environment once.
os.environ["BMD_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["BMD_MAIL_MODE"] = "log"
os.environ["BMD_VAPID_PUBLIC"] = "test-public"
os.environ["BMD_VAPID_PRIVATE"] = "test-private"

import pytest  # noqa: E402

from bike_my_day import auth, config, db  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    if os.path.exists(config.DB_PATH):
        os.remove(config.DB_PATH)
    auth._code_per_email.reset()
    auth._code_global.reset()
    with db.connect():
        pass
    yield


def pytest_addoption(parser):
    parser.addoption("--live", action="store_true", help="also run tests that call real services")
