"""Outgoing email (after snicksnack's).

`BMD_MAIL_MODE=log` (default) writes the message to the log and to `outbox`, so
local dev reads the code off the console and tests read it off `outbox`; nothing
leaves the machine. `ses` sends through Amazon SES with the instance role.

Sends are best-effort: a failure is logged and swallowed, because the caller is
an auth endpoint that must not leak whether an address exists by way of a 500.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from bike_my_day import config

log = logging.getLogger("bike_my_day.mail")


@dataclass
class Message:
    to: str
    subject: str
    body: str


#: Everything "sent" in log mode, newest last. Tests assert against this.
outbox: list[Message] = []


@lru_cache(maxsize=1)
def _ses() -> Any:
    import boto3

    return boto3.client("ses", region_name=config.MAIL_REGION)


def _send(msg: Message) -> None:
    if config.MAIL_MODE != "ses":
        outbox.append(msg)
        log.info("mail (not sent, MAIL_MODE=%s) to %s: %s", config.MAIL_MODE, msg.to, msg.body)
        return
    try:
        _ses().send_email(
            Source=config.MAIL_FROM,
            Destination={"ToAddresses": [msg.to]},
            ReplyToAddresses=[config.MAIL_REPLY_TO],
            Message={
                "Subject": {"Data": msg.subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": msg.body, "Charset": "UTF-8"}},
            },
        )
    except Exception:
        log.exception("SES send to %s failed", msg.to)


def send_login_code(email: str, code: str, locale: str) -> None:
    minutes = config.CODE_TTL_MINUTES
    if locale == "en":
        subject = f"{code} is your bike my day code"
        body = (
            f"Your bike my day sign-in code is {code}\n\n"
            f"It works for {minutes} minutes and once only. Type it into the app where you "
            "asked for it.\n\n"
            "If you did not ask for this, ignore it; nobody can sign in without the code.\n"
        )
    else:
        subject = f"{code} är din kod till bike my day"
        body = (
            f"Din inloggningskod till bike my day är {code}\n\n"
            f"Den gäller i {minutes} minuter och bara en gång. Skriv in den i appen där du "
            "bad om den.\n\n"
            "Om du inte bad om koden kan du strunta i det här mejlet; ingen kan logga in "
            "utan den.\n"
        )
    _send(Message(to=email, subject=subject, body=body))
