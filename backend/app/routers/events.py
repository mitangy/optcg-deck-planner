"""Giveaway events (#794): public event info and opt-in, and the admin draw tools."""

from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.duel import events as ev
from app.core.time import as_utc_or_none
from app.core.auth import get_current_user, get_optional_user
from app.core.db import get_db
from app.core.models import User
from app.duel.models import DuelEvent, EventDraw, EventEntry
from app.roles import is_staff
from app.core.security import Admin
from app.usernames import duel_display_name

router = APIRouter(prefix="/duel/events", tags=["events"])
admin_router = APIRouter(prefix="/admin/events", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]


def _iso(dt: datetime | None) -> str | None:
    dt = as_utc_or_none(dt)
    return dt.isoformat() if dt else None


def _event_or_404(db: Session, event_id: str) -> ev.Event:
    event = ev.get_event(db, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Unknown event")
    return event


def _draw(db: Session, event_id: str) -> EventDraw | None:
    return db.scalar(select(EventDraw).where(EventDraw.event_id == event_id))


def _ids(raw: str | None) -> list[int]:
    try:
        return [int(x) for x in json.loads(raw or "[]")]
    except (ValueError, TypeError):
        return []


def _ranking(draw: EventDraw | None) -> list[int]:
    if draw is None or draw.seed is None:
        return []
    return ev.rank_eligible(draw.seed, draw.event_id, _ids(draw.eligible_ids))


def _winners(event: ev.Event, draw: EventDraw | None) -> list[int]:
    return ev.pick_winners(_ranking(draw), _ids(draw.forfeited) if draw else [], event.winners)


def _viewer(user: User | None) -> str:
    if user is None:
        return "anonymous"
    if ev.is_guest_email(user.email):
        return "guest"
    return "staff" if is_staff(user) else "player"


def _can_join(event: ev.Event, user: User | None, now: datetime) -> tuple[bool, str | None]:
    if user is None:
        return False, "Sign in to join"
    if ev.is_guest_email(user.email):
        return False, "Guest accounts can't enter. Sign in to join"
    if now >= event.ends_at:
        return False, "Entries are closed"
    return True, None


# ---------------------------------------------------------------- public

@router.get("/current")
def current(db: DB, user: Annotated[User | None, Depends(get_optional_user)]) -> dict:
    """The lobby banner's event: live or upcoming, or one that ended in the last week."""
    now = ev.utcnow()
    event = ev.current_event(db, now)
    if event is None:
        return {"event": None}
    return {"event": _public_event(db, user, event, now)}


@router.get("/{event_id}")
def by_id(event_id: str, db: DB, user: Annotated[User | None, Depends(get_optional_user)]) -> dict:
    """One event by id at any time, so the rules page keeps the seed and eligible ids through the
    draw and the reply window long after the banner stops advertising it (#795)."""
    return {"event": _public_event(db, user, _event_or_404(db, event_id), ev.utcnow())}


def _detail_fields(event: ev.Event) -> dict:
    """Prizing and tourney-style details (#1019), the same on the public and admin shapes."""
    return {
        "description": event.description,
        "prize": event.prize,
        "prize_details": event.prize_details,
        "prize_method": event.prize_method,
        "format": event.format,
        "bracket_size": event.bracket_size,
        "best_of": event.best_of,
        "winners": event.winners,
        "rules_version": event.rules_version,
        "min_games": event.min_games,
        "min_opponents": event.min_opponents,
        "min_turns": event.min_turns,
    }


def _public_event(db: Session, user: User | None, event: ev.Event, now: datetime) -> dict:
    draw = _draw(db, event.id)
    drawn = draw is not None and draw.drawn_at is not None
    can_join, reason = _can_join(event, user, now)
    out = {
        "id": event.id,
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        **_detail_fields(event),
        "status": ev.event_status(event, now, drawn),
        "seed_hash": draw.seed_hash if draw else None,
        "seed": draw.seed if drawn else None,
        "eligible_user_ids": sorted(_ids(draw.eligible_ids)) if drawn else None,
        "viewer": _viewer(user),
        "can_join": can_join,
        "cant_join_reason": reason,
        "opted_in": False,
        "progress": None,
    }
    if user is not None and not ev.is_guest_email(user.email):
        p = ev.user_progress(db, event, user)
        out["opted_in"] = p["opted_in"]
        out["progress"] = {"games": p["games"], "opponents": p["opponents"], "eligible": p["eligible"]}
    return out


class JoinIn(BaseModel):
    accept_rules: bool = False
    rules_version: str = ""


@router.post("/{event_id}/join")
def join(event_id: str, body: JoinIn, db: DB, user: Annotated[User, Depends(get_current_user)]) -> dict:
    event = _event_or_404(db, event_id)
    ok, reason = _can_join(event, user, ev.utcnow())
    if not ok:
        raise HTTPException(status_code=403, detail=reason)
    if body.accept_rules is not True:
        raise HTTPException(status_code=422, detail="You must accept the official rules")
    if body.rules_version != event.rules_version:
        raise HTTPException(status_code=409, detail="The rules changed. Reload and read them again")
    if db.scalar(select(EventEntry.id).where(EventEntry.event_id == event.id, EventEntry.user_id == user.id)) is None:
        db.add(EventEntry(event_id=event.id, user_id=user.id, rules_version=body.rules_version))
        try:
            db.commit()
        except IntegrityError:  # a double click raced us; the entry exists
            db.rollback()
    return {"opted_in": True}


# ---------------------------------------------------------------- admin

def _name(u: User) -> str:
    return duel_display_name(u)


def _admin_state(db: Session, event: ev.Event) -> dict:
    now = ev.utcnow()
    draw = _draw(db, event.id)
    drawn = draw is not None and draw.drawn_at is not None
    parts = ev.participants(db, event)
    games, players = ev.window_counters(db, event)
    state: dict = {
        "id": event.id,
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        "status": ev.event_status(event, now, drawn),
        **_detail_fields(event),
        "winners_count": event.winners,
        "counters": {
            "opted_in": len(parts),
            "games_in_window": games,
            "players_with_game": players,
            "eligible": sum(1 for p in parts if p.eligible),
            "flagged_eligible": sum(1 for p in parts if p.eligible and p.flags),
        },
        "participants": [
            {
                "user_id": p.user.id,
                "name": _name(p.user),
                "email": p.user.email,
                "games": p.games,
                "opponents": p.opponents,
                "eligible": p.eligible,
                "excluded": p.excluded,
                "flags": list(p.flags),
            }
            for p in parts
        ],
        "draw": None,
    }
    if draw is not None:
        forfeited = _ids(draw.forfeited)
        draw_out: dict = {
            "seed_hash": draw.seed_hash,
            "committed_at": _iso(draw.committed_at),
            "drawn_at": _iso(draw.drawn_at),
            "seed": draw.seed if drawn else None,
            "forfeited": forfeited,
            "ranking": [],
            "winners": [],
        }
        if drawn:
            users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(_ids(draw.eligible_ids)))).all()}

            def row(uid: int) -> dict:
                u = users.get(uid)
                return {
                    "user_id": uid,
                    "name": _name(u) if u else "Deleted account",
                    "email": u.email if u else "",
                    "forfeited": uid in forfeited,
                }

            draw_out["ranking"] = [row(uid) for uid in _ranking(draw)]
            draw_out["winners"] = [row(uid) for uid in _winners(event, draw)]
        state["draw"] = draw_out
    return state


@admin_router.get("")
def admin_list_events(_: Admin, db: DB) -> dict:
    """Every event, newest start first, for the admin picker (#1019)."""
    now = ev.utcnow()
    joined = dict(db.execute(select(EventEntry.event_id, func.count()).group_by(EventEntry.event_id)).all())
    drawn = {d.event_id for d in db.scalars(select(EventDraw).where(EventDraw.drawn_at.is_not(None))).all()}
    return {
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "starts_at": e.starts_at.isoformat(),
                "ends_at": e.ends_at.isoformat(),
                "status": ev.event_status(e, now, e.id in drawn),
                "format": e.format,
                "prize": e.prize,
                "joined": joined.get(e.id, 0),
            }
            for e in ev.list_events(db)
        ]
    }


@admin_router.get("/latest")
def admin_latest_event(_: Admin, db: DB) -> dict:
    """The newest event whatever the date, so the admin tab can still draw and forfeit weeks after the end (#795)."""
    event = ev.latest_event(db)
    if event is None:
        raise HTTPException(status_code=404, detail="No events yet")
    return _admin_state(db, event)


@admin_router.get("/{event_id}")
def admin_event(event_id: str, _: Admin, db: DB) -> dict:
    return _admin_state(db, _event_or_404(db, event_id))


# Fields whose change makes players re-read the rules (their join then 409s on the old version).
RULES_FIELDS = (
    "starts_at", "ends_at", "min_games", "min_opponents", "min_turns", "winners",
    "prize", "prize_details", "prize_method", "format", "best_of", "bracket_size",
)
# Fields that cannot move once the draw ran: they decide who was eligible and who won.
DRAWN_LOCKED_FIELDS = ("starts_at", "ends_at", "min_games", "min_opponents", "min_turns", "winners", "prize_method")


class EventIn(BaseModel):
    title: str
    starts_at: datetime
    ends_at: datetime
    description: str = ""
    prize: str = ""
    prize_details: str = ""
    prize_method: str = "draw"
    format: str = "casual"
    bracket_size: int | None = None
    best_of: int = 1
    winners: int = 3
    min_games: int = 3
    min_opponents: int = 2
    min_turns: int = 3


class EventPatch(BaseModel):
    title: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    description: str | None = None
    prize: str | None = None
    prize_details: str | None = None
    prize_method: str | None = None
    format: str | None = None
    bracket_size: int | None = None
    best_of: int | None = None
    winners: int | None = None
    min_games: int | None = None
    min_opponents: int | None = None
    min_turns: int | None = None


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def _clean(values: dict) -> dict:
    """Normalise and validate a full set of event fields; raises 422 with a message the form can show."""
    v = dict(values)
    v["title"] = (v["title"] or "").strip()
    if not 1 <= len(v["title"]) <= 80:
        raise _bad("Title must be 1 to 80 characters")
    v["starts_at"], v["ends_at"] = as_utc_or_none(v["starts_at"]), as_utc_or_none(v["ends_at"])
    if v["ends_at"] <= v["starts_at"]:
        raise _bad("The end must be after the start")
    v["description"] = (v["description"] or "").strip()
    v["prize"] = (v["prize"] or "").strip()
    v["prize_details"] = (v["prize_details"] or "").strip()
    if len(v["prize"]) > 200:
        raise _bad("The prize summary can be at most 200 characters")
    if len(v["description"]) > 4000 or len(v["prize_details"]) > 4000:
        raise _bad("Description and prize details can be at most 4000 characters")
    if not 1 <= v["winners"] <= 50:
        raise _bad("Winners must be between 1 and 50")
    for key in ("min_games", "min_opponents", "min_turns"):
        if v[key] < 0:
            raise _bad("Minimums can't be negative")
    if v["prize_method"] not in ev.PRIZE_METHODS:
        raise _bad("Prizes are awarded by a random draw or to top finishers")
    if v["format"] not in ev.FORMATS:
        raise _bad("Unknown tourney style")
    if v["best_of"] not in ev.BEST_OFS:
        raise _bad("Best of must be 1 or 3")
    if v["format"] == "single_elim":
        if v["bracket_size"] not in ev.BRACKET_SIZES:
            raise _bad("A single-elimination bracket needs a size of 4, 8, 16 or 32")
    else:
        v["bracket_size"] = None
    return v


def _new_rules_version(old: str) -> str:
    version = ev.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    if old.startswith(version):  # two edits in the same second still get different versions
        return f"{version}.{int(old[len(version) + 1:] or 0) + 1}"
    return version


def _slug(db: Session, title: str, starts_at: datetime) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-") or "event"
    base = f"{base}-{starts_at:%Y-%m}"
    slug, n = base, 1
    while db.get(DuelEvent, slug) is not None:
        n += 1
        slug = f"{base}-{n}"
    return slug


@admin_router.post("")
def admin_create_event(body: EventIn, _: Admin, db: DB) -> dict:
    v = _clean(body.model_dump())
    row = DuelEvent(id=_slug(db, v["title"], v["starts_at"]), rules_version=_new_rules_version(""), **v)
    db.add(row)
    db.commit()
    return _admin_state(db, ev.event_from_row(row))


@admin_router.patch("/{event_id}")
def admin_update_event(event_id: str, body: EventPatch, _: Admin, db: DB) -> dict:
    row = db.get(DuelEvent, event_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown event")
    sent = body.model_dump(exclude_unset=True)
    if any(v is None for k, v in sent.items() if k != "bracket_size"):
        raise _bad("Fields can't be empty")
    old = _detail_fields(ev.event_from_row(row)) | {
        "title": row.title, "starts_at": as_utc_or_none(row.starts_at), "ends_at": as_utc_or_none(row.ends_at),
    }
    v = _clean({**old, **sent})
    changed = {k for k, val in v.items() if val != old[k]}
    draw = _draw(db, event_id)
    if draw is not None and draw.drawn_at is not None and changed & set(DRAWN_LOCKED_FIELDS):
        raise HTTPException(status_code=409, detail="The draw already ran, so the dates, winners, minimums and prize method are locked")
    if draw is not None and "prize_method" in changed:
        raise HTTPException(status_code=409, detail="A seed is already committed, so the prize method is locked")
    if draw is not None and "starts_at" in changed and ev.utcnow() >= as_utc_or_none(row.starts_at):
        raise HTTPException(status_code=409, detail="A seed is committed and the event already started, so the start can't move")
    for key in changed:
        setattr(row, key, v[key])
    if changed & set(RULES_FIELDS):
        row.rules_version = _new_rules_version(row.rules_version)
    db.commit()
    return _admin_state(db, ev.event_from_row(row))


@admin_router.delete("/{event_id}")
def admin_delete_event(event_id: str, _: Admin, db: DB) -> dict:
    row = db.get(DuelEvent, event_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown event")
    draw = _draw(db, event_id)
    if draw is not None and draw.drawn_at is not None:
        raise HTTPException(status_code=409, detail="The draw already ran, so this event can't be deleted")
    db.execute(delete(EventEntry).where(EventEntry.event_id == event_id))
    db.execute(delete(EventDraw).where(EventDraw.event_id == event_id))
    db.delete(row)
    db.commit()
    return {"deleted": event_id}


def _require_draw_event(event: ev.Event) -> None:
    if event.prize_method != "draw":
        raise HTTPException(status_code=409, detail="This event awards prizes to top finishers, so there is no draw")


def _csv_cell(value: object) -> str:
    s = str(value)
    # Spreadsheet formula injection: a name like =HYPERLINK(...) must stay text.
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@admin_router.get("/{event_id}/participants.csv")
def admin_event_csv(event_id: str, _: Admin, db: DB) -> Response:
    event = _event_or_404(db, event_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["user_id", "name", "email", "games", "opponents", "eligible", "excluded", "flags"])
    for p in ev.participants(db, event):
        w.writerow([p.user.id, _csv_cell(_name(p.user)), _csv_cell(p.user.email), p.games, p.opponents, "yes" if p.eligible else "no", p.excluded or "", ";".join(p.flags)])
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{event.id}-participants.csv"'},
    )


@admin_router.post("/{event_id}/commit")
def admin_commit(event_id: str, admin: Admin, db: DB) -> dict:
    event = _event_or_404(db, event_id)
    _require_draw_event(event)
    if ev.utcnow() >= event.starts_at:
        raise HTTPException(status_code=409, detail="The seed can only be committed before the event starts")
    if _draw(db, event.id) is not None:
        raise HTTPException(status_code=409, detail="A seed is already committed")
    seed = ev.new_seed()
    db.add(EventDraw(event_id=event.id, seed=seed, seed_hash=ev.seed_hash(seed), committed_by=admin.id))
    db.commit()
    return _admin_state(db, event)


@admin_router.post("/{event_id}/draw")
def admin_draw(event_id: str, admin: Admin, db: DB) -> dict:
    event = _event_or_404(db, event_id)
    _require_draw_event(event)
    now = ev.utcnow()
    if now < event.ends_at:
        raise HTTPException(status_code=409, detail="The draw can only run after the event ends")
    draw = _draw(db, event.id)
    if draw is None:
        raise HTTPException(status_code=409, detail="No seed was committed before the event, so there is nothing to verify the draw against")
    if draw.drawn_at is None:
        eligible = [p.user.id for p in ev.participants(db, event) if p.eligible]
        draw.eligible_ids = json.dumps(sorted(eligible))
        draw.drawn_at = now
        draw.drawn_by = admin.id
        db.commit()
    return _admin_state(db, event)


class ForfeitIn(BaseModel):
    user_id: int


@admin_router.post("/{event_id}/forfeit")
def admin_forfeit(event_id: str, body: ForfeitIn, _: Admin, db: DB) -> dict:
    event = _event_or_404(db, event_id)
    draw = _draw(db, event.id)
    if draw is None or draw.drawn_at is None:
        raise HTTPException(status_code=409, detail="The draw has not run yet")
    if body.user_id not in _ids(draw.eligible_ids):
        raise HTTPException(status_code=404, detail="That player is not in the draw")
    forfeited = _ids(draw.forfeited)
    if body.user_id not in forfeited:
        forfeited.append(body.user_id)
        draw.forfeited = json.dumps(forfeited)
        db.commit()
    return _admin_state(db, event)
