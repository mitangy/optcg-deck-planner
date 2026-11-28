"""First-party error reporting (#1500): record uncaught errors from the apps and the API, grouped by fingerprint."""

from __future__ import annotations

import hashlib
import re
from datetime import timedelta
from urllib.parse import urlsplit

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.admin.models import ClientError
from app.core.time import as_utc, utcnow

MESSAGE_MAX = 500
STACK_MAX = 4000
URL_MAX = 200
RELEASE_MAX = 40
APPS = ("duel", "planner", "api", "game-server")
DEDUPE_WINDOW = timedelta(hours=1)
KEEP_FOR = timedelta(days=30)

_NUMBERS = re.compile(r"\d+")
_HEX_RUN = re.compile(r"\b[0-9a-f]{8,}\b", re.I)
_FRAME_POS = re.compile(r":\d+(?::\d+)?\)?$")
_HASHED_FILE = re.compile(r"-[A-Za-z0-9_]{6,}\.(js|mjs|css)")
# SQLAlchemy appends the statement and its bound parameters to the message: that is player data.
_SQL_TAIL = re.compile(r"\s*\[(SQL|parameters):.*", re.S)


def clean_message(raw: str) -> str:
    return _SQL_TAIL.sub("", raw.strip())[:MESSAGE_MAX]


def clean_url(raw: str) -> str:
    """The path only: a query string or fragment can carry tokens."""
    if not raw:
        return ""
    return (urlsplit(raw).path or "")[:URL_MAX]


def _top_frame(stack: str) -> str:
    for line in stack.splitlines():
        line = line.strip()
        if line.startswith("at ") or line.startswith("File ") or "@" in line:
            return _HASHED_FILE.sub(".\\1", _FRAME_POS.sub("", line))
    return ""


def fingerprint(app: str, message: str, stack: str) -> str:
    """The same bug on another build, with other ids or line numbers in it, lands in one group."""
    msg = _NUMBERS.sub("#", _HEX_RUN.sub("#", message.strip().lower()))
    return hashlib.sha1(f"{app}|{msg}|{_top_frame(stack)}".encode()).hexdigest()


def record_client_error(
    db: Session,
    *,
    app: str,
    message: str,
    stack: str = "",
    url: str = "",
    release: str = "",
    user_id: int | None = None,
) -> ClientError:
    message = clean_message(message)
    stack = stack[:STACK_MAX]
    fp = fingerprint(app, message, stack)
    now = utcnow()
    existing = db.scalar(
        select(ClientError)
        .where(ClientError.fingerprint == fp, ClientError.last_seen_at >= now - DEDUPE_WINDOW)
        .order_by(ClientError.id.desc())
        .limit(1)
    )
    if existing is not None:
        # One UPDATE, so two reports landing together both count.
        db.execute(
            update(ClientError)
            .where(ClientError.id == existing.id)
            .values(
                count=ClientError.count + 1,
                last_seen_at=now,
                user_id=existing.user_id if existing.user_id is not None else user_id,
            )
        )
        db.commit()
        db.refresh(existing)
        return existing
    db.execute(delete(ClientError).where(ClientError.last_seen_at < now - KEEP_FOR))
    row = ClientError(
        app=app,
        message=message,
        stack=stack,
        url=clean_url(url),
        release=release[:RELEASE_MAX],
        user_id=user_id,
        count=1,
        fingerprint=fp,
        created_at=now,
        last_seen_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def grouped_errors(db: Session, days: int, limit: int = 100) -> list[dict]:
    """Recent errors, one entry per fingerprint, the most recently seen first."""
    since = utcnow() - timedelta(days=days)
    groups = db.execute(
        select(
            ClientError.fingerprint,
            func.sum(ClientError.count),
            func.min(ClientError.created_at),
            func.max(ClientError.last_seen_at),
            func.count(func.distinct(ClientError.user_id)),
            func.max(ClientError.id),
        )
        .where(ClientError.last_seen_at >= since)
        .group_by(ClientError.fingerprint)
        .order_by(func.max(ClientError.last_seen_at).desc())
        .limit(limit)
    ).all()
    latest = {r.id: r for r in db.scalars(select(ClientError).where(ClientError.id.in_([g[5] for g in groups])))}
    out = []
    for fp, total, first, last, users, latest_id in groups:
        row = latest[latest_id]
        out.append(
            {
                "fingerprint": fp,
                "app": row.app,
                "message": row.message,
                "stack": row.stack,
                "url": row.url,
                "release": row.release,
                "count": int(total or 0),
                "users": int(users or 0),
                "first_seen": as_utc(first).isoformat(),
                "last_seen": as_utc(last).isoformat(),
            }
        )
    return out
