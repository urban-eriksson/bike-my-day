"""All configuration comes from BMD_* environment variables.

On the box they are loaded from SSM `/bike-my-day/env` at service start; locally
the defaults are enough to run the API and the tests (mail is logged, not sent).
"""

import os

DB_PATH = os.environ.get("BMD_DB", "./bike-my-day.db")

# Signs login tokens and hashes login codes. Rotating it signs everybody out,
# nothing worse.
DEV_SECRET = "dev-secret-not-for-production-use-only"
SECRET = os.environ.get("BMD_SECRET", DEV_SECRET)
TOKEN_TTL_DAYS = 180

CODE_TTL_MINUTES = 10
CODE_MAX_ATTEMPTS = 5
CODE_LIMIT_PER_EMAIL = (3, 15 * 60)  # enough for a lost mail, not a mail cannon
CODE_LIMIT_GLOBAL = (100, 60 * 60)

# `log` writes mail to the server log; `ses` sends it. Only `ses` reaches an inbox.
MAIL_MODE = os.environ.get("BMD_MAIL_MODE", "log")
MAIL_FROM = os.environ.get("BMD_MAIL_FROM", "Bike my day <noreply@korist.se>")
MAIL_REPLY_TO = os.environ.get("BMD_MAIL_REPLY_TO", "support@korist.se")
MAIL_REGION = os.environ.get("BMD_MAIL_REGION", "eu-north-1")

# Never rotate these: every phone's push subscription is bound to the pair.
VAPID_PUBLIC = os.environ.get("BMD_VAPID_PUBLIC", "")
VAPID_PRIVATE = os.environ.get("BMD_VAPID_PRIVATE", "")
VAPID_SUBJECT = os.environ.get("BMD_VAPID_SUBJECT", "mailto:support@korist.se")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
VERDICT_MODEL = os.environ.get("BMD_VERDICT_MODEL", "claude-haiku-4-5")

WEB_URL = os.environ.get("BMD_WEB_URL", "https://bike-my-day.korist.se")
# Photon refuses generic client User-Agents (python-httpx gets a 403); the
# public OSM services ask callers to name themselves.
USER_AGENT = f"bike-my-day/1.0 (+{WEB_URL})"
# Production is same-origin through CloudFront; this is for the Vite dev server.
CORS_ORIGINS = [o for o in os.environ.get("BMD_CORS_ORIGINS", "").split(",") if o]

if MAIL_MODE == "ses" and SECRET == DEV_SECRET:
    # Real mail means real users: refuse to sign their tokens with a public secret.
    raise RuntimeError("BMD_SECRET must be set when BMD_MAIL_MODE=ses")
