"""One UTC helper set (refactor D-10).

SQLite hands back naive datetimes for ``DateTime(timezone=True)`` columns; they are always UTC.
``as_utc`` makes them aware so they compare with ``utcnow()``. Both helpers keep the semantics
the eleven per-module copies had: a naive value is *labelled* UTC, never converted.
"""

from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """The current time as an aware UTC datetime."""
    return datetime.now(timezone.utc)


def as_utc(dt: datetime) -> datetime:
    """``dt`` as aware UTC: a naive value (SQLite round-trip) is taken to be UTC; an aware one is returned unchanged."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def as_utc_or_none(dt: datetime | None) -> datetime | None:
    """``as_utc`` that lets None through, for nullable columns."""
    return None if dt is None else as_utc(dt)
