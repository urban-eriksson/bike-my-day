"""Email identity: a six-digit code, no passwords and no magic links (from snicksnack).

An installed PWA has its own cookie jar, so a link opened from the mail app would
sign in Safari and leave the home-screen app signed out. A code the user types
works wherever they already are.

The token is a bearer JWT the client keeps in localStorage. It carries the email
as well as the id, so a token from a deleted account can never name somebody
else's row. `GET /api/me` re-issues it, so a rider who opens the app now and
then never meets the expiry.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr

from bike_my_day import config, db, mail
from bike_my_day.ratelimit import Limiter

router = APIRouter(prefix="/api", tags=["auth"])

_code_per_email = Limiter(*config.CODE_LIMIT_PER_EMAIL)
_code_global = Limiter(*config.CODE_LIMIT_GLOBAL)

Db = Annotated[sqlite3.Connection, Depends(db.get_db)]


class CodeIn(BaseModel):
    email: EmailStr
    locale: str = "sv"


class VerifyIn(BaseModel):
    email: EmailStr
    code: str


class User(BaseModel):
    id: str
    email: str


class TokenOut(BaseModel):
    token: str
    user: User


def normalize_email(value: str) -> str:
    return value.strip().lower()


def create_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "em": user.email,
        "exp": datetime.now(UTC) + timedelta(days=config.TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, config.SECRET, algorithm="HS256")


def resolve_user(conn: sqlite3.Connection, token: str) -> User | None:
    try:
        payload = jwt.decode(token, config.SECRET, algorithms=["HS256"])
        user_id, email = str(payload["sub"]), str(payload["em"])
    except (jwt.PyJWTError, KeyError):
        return None
    row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or row["email"] != email:
        return None
    return User(id=row["id"], email=row["email"])


def current_user(conn: Db, authorization: Annotated[str, Header()] = "") -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    user = resolve_user(conn, token)
    if user is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _hash_code(email: str, code: str) -> str:
    """HMAC rather than a bare digest: a leaked database is not enough to
    recover a live code without the server secret."""
    return hmac.new(config.SECRET.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


@router.post("/auth/code")
def request_code(body: CodeIn, conn: Db) -> dict[str, bool]:
    """Mint a one-time code and mail it. Says nothing about whether the address
    already has an account. Anyone may sign up, as with Supabase before."""
    email = normalize_email(body.email)
    if not _code_per_email.allow(email) or not _code_global.allow("all"):
        raise HTTPException(status_code=429, detail="too many codes requested")

    code = f"{secrets.randbelow(1_000_000):06d}"
    # Only the newest code works: two codes in flight is a support question.
    conn.execute("UPDATE login_codes SET used = 1 WHERE email = ? AND used = 0", (email,))
    expires = datetime.now(UTC) + timedelta(minutes=config.CODE_TTL_MINUTES)
    conn.execute(
        "INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)",
        (email, _hash_code(email, code), db.iso(expires)),
    )
    conn.commit()
    locale = body.locale if body.locale in ("sv", "en") else "sv"
    mail.send_login_code(email, code, locale)
    return {"sent": True}


@router.post("/auth/verify")
def verify_code(body: VerifyIn, conn: Db) -> TokenOut:
    """Brute force is bounded by the per-code attempt budget: five guesses
    against a million codes, then the code is dead."""
    email = normalize_email(body.email)
    entry = conn.execute(
        """SELECT id, code_hash FROM login_codes
           WHERE email = ? AND used = 0 AND expires_at > ? AND attempts < ?
           ORDER BY id DESC LIMIT 1""",
        (email, db.now_iso(), config.CODE_MAX_ATTEMPTS),
    ).fetchone()
    wrong = HTTPException(status_code=401, detail="wrong or expired code")
    if entry is None:
        raise wrong
    if not hmac.compare_digest(entry["code_hash"], _hash_code(email, body.code.strip())):
        conn.execute("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", (entry["id"],))
        conn.commit()  # raising below would otherwise lose the count
        raise wrong
    conn.execute("UPDATE login_codes SET used = 1 WHERE id = ?", (entry["id"],))

    row = conn.execute("SELECT id, email FROM users WHERE email = ?", (email,)).fetchone()
    if row is None:
        user = User(id=db.new_id(), email=email)
        conn.execute(
            "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
            (user.id, user.email, db.now_iso()),
        )
    else:
        user = User(id=row["id"], email=row["email"])
    return TokenOut(token=create_token(user), user=user)


@router.delete("/me")
def delete_me(user: CurrentUser, conn: Db) -> dict[str, bool]:
    """Erase the account; every table cascades from users."""
    conn.execute("DELETE FROM login_codes WHERE email = ?", (user.email,))
    conn.execute("DELETE FROM users WHERE id = ?", (user.id,))
    return {"deleted": True}
