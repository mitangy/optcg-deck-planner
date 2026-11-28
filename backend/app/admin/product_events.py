"""Funnel events (#1499): what the browser may report, and how a batch is cleaned before it is stored.

Nothing here keeps an IP, an email or a user agent. The only trace of the browser is ``device`` (coarse) and
a random client id the page made up itself.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.admin.models import ProductEvent

# ``signup`` is not here: it is written server side when an account is created, so a browser cannot inflate it.
EVENT_NAMES = frozenset(
    {
        "landing",
        "home_view",
        "deck_picked",
        "game_start",
        "game_done",
        "signup_prompt_shown",
        "review_opened",
        "planner_open_from_duel",
        "setting_changed",
    }
)
# Events that mean "this visitor showed up today": a second one the same UTC day adds nothing.
ONCE_A_DAY = frozenset({"landing", "home_view"})
KEEP_DAYS = 180
APPS = frozenset({"duel", "planner"})
MAX_BATCH = 20
MAX_BODY_BYTES = 16 * 1024
# Only these props are kept: what the funnel needs to split by, never free text.
PROP_KEYS = ("mode", "leader", "key", "path")
MAX_PROP_LEN = 80
MAX_PATH_LEN = 120
_ANON_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_MOBILE_UA = re.compile(r"Mobi|Android|iPhone|iPad|iPod", re.I)


def clean_anon_id(raw: Any) -> str | None:
    return raw if isinstance(raw, str) and _ANON_ID.match(raw) else None


def device_of(user_agent: str | None) -> str:
    return "mobile" if user_agent and _MOBILE_UA.search(user_agent) else "desktop"


def _clean_prop(key: str, value: Any) -> str | int | bool | None:
    if isinstance(value, bool) or isinstance(value, int):
        return value
    if not isinstance(value, str) or not value:
        return None
    if key == "path":
        # A query string can carry tokens or share links, so only the path is kept.
        value = value.split("?", 1)[0].split("#", 1)[0]
        return value[:MAX_PATH_LEN] or None
    return value[:MAX_PROP_LEN]


def clean_props(raw: Any) -> dict[str, str | int | bool] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, str | int | bool] = {}
    for key in PROP_KEYS:
        value = _clean_prop(key, raw.get(key))
        if value is not None:
            out[key] = value
    return out or None


def clean_batch(raw: Any) -> list[tuple[str, dict[str, str | int | bool] | None]]:
    """The allowlisted events of a batch, at most ``MAX_BATCH`` of them, as (name, props)."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw[:MAX_BATCH]:
        name = item.get("name") if isinstance(item, dict) else None
        if isinstance(name, str) and name in EVENT_NAMES:
            out.append((name, clean_props(item.get("props"))))
    return out


def already_today(db: Session, names: set[str], *, user_id: int | None, anon_id: str | None, since: datetime) -> set[str]:
    """Which of the once-a-day ``names`` this visitor already has since ``since`` (start of the UTC day)."""
    who = ProductEvent.user_id == user_id if user_id is not None else ProductEvent.anon_id == anon_id
    return set(db.scalars(select(ProductEvent.name).where(who, ProductEvent.name.in_(names), ProductEvent.created_at >= since).distinct()))


def prune_old(db: Session, now: datetime) -> int:
    """Delete events older than ``KEEP_DAYS``; the privacy policy promises it."""
    res = db.execute(delete(ProductEvent).where(ProductEvent.created_at < now - timedelta(days=KEEP_DAYS)))
    db.commit()
    return res.rowcount or 0
