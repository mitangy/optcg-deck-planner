"""Giveaway events (#794): public event info and opt-in, and the admin draw tools."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import events as ev
from app.auth import get_current_user, get_optional_user
from app.db import get_db
from app.models import EventDraw, EventEntry, User
from app.roles import is_staff
from app.routers.admin import Admin
from app.usernames import duel_display_name

router = APIRouter(prefix="/duel/events", tags=["events"])
admin_router = APIRouter(prefix="/admin/events", tags=["admin"])

DB = Annotated[Session, Depends(get_db)]


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    dt = _utc(dt)
    return dt.isoformat() if dt else None


def _event_or_404(event_id: str) -> ev.Event:
    event = ev.get_event(event_id)
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
    now = ev.now_utc()
    event = ev.current_event(now)
    if event is None:
        return {"event": None}
    return {"event": _public_event(db, user, event, now)}


@router.get("/{event_id}")
def by_id(event_id: str, db: DB, user: Annotated[User | None, Depends(get_optional_user)]) -> dict:
    """One event by id at any time, so the rules page keeps the seed and eligible ids through the
    draw and the reply window long after the banner stops advertising it (#795)."""
    return {"event": _public_event(db, user, _event_or_404(event_id), ev.now_utc())}


def _public_event(db: Session, user: User | None, event: ev.Event, now: datetime) -> dict:
    draw = _draw(db, event.id)
    drawn = draw is not None and draw.drawn_at is not None
    can_join, reason = _can_join(event, user, now)
    out = {
        "id": event.id,
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        "prize": event.prize,
        "winners": event.winners,
        "rules_version": event.rules_version,
        "min_games": event.min_games,
        "min_opponents": event.min_opponents,
        "min_turns": event.min_turns,
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
    event = _event_or_404(event_id)
    ok, reason = _can_join(event, user, ev.now_utc())
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
    now = ev.now_utc()
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
        "winners_count": event.winners,
        "min_games": event.min_games,
        "min_opponents": event.min_opponents,
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


@admin_router.get("/latest")
def admin_latest_event(_: Admin, db: DB) -> dict:
    """The newest event whatever the date, so the admin tab can still draw and forfeit weeks after the end (#795)."""
    return _admin_state(db, ev.latest_event())


@admin_router.get("/{event_id}")
def admin_event(event_id: str, _: Admin, db: DB) -> dict:
    return _admin_state(db, _event_or_404(event_id))


def _csv_cell(value: object) -> str:
    s = str(value)
    # Spreadsheet formula injection: a name like =HYPERLINK(...) must stay text.
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@admin_router.get("/{event_id}/participants.csv")
def admin_event_csv(event_id: str, _: Admin, db: DB) -> Response:
    event = _event_or_404(event_id)
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
    event = _event_or_404(event_id)
    if ev.now_utc() >= event.starts_at:
        raise HTTPException(status_code=409, detail="The seed can only be committed before the event starts")
    if _draw(db, event.id) is not None:
        raise HTTPException(status_code=409, detail="A seed is already committed")
    seed = ev.new_seed()
    db.add(EventDraw(event_id=event.id, seed=seed, seed_hash=ev.seed_hash(seed), committed_by=admin.id))
    db.commit()
    return _admin_state(db, event)


@admin_router.post("/{event_id}/draw")
def admin_draw(event_id: str, admin: Admin, db: DB) -> dict:
    event = _event_or_404(event_id)
    now = ev.now_utc()
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
    event = _event_or_404(event_id)
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
