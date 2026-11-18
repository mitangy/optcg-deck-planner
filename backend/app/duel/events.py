
from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass, fields
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.time import as_utc, utcnow
from app.core.models import User
from app.duel.models import DuelEvent, DuelMatch, EventEntry
from app.roles import is_banned, is_staff

GUEST_SUFFIX = "@localhost"
RECENT_DAYS = 7
NEW_ACCOUNT_DAYS = 7
ISOLATED_GROUP_MAX = 4


FORMATS = ("casual", "single_elim", "round_robin", "swiss")
PRIZE_METHODS = ("draw", "placement")
BRACKET_SIZES = (4, 8, 16, 32)
BEST_OFS = (1, 3)


@dataclass(frozen=True)
class Event:
    id: str
    title: str
    starts_at: datetime
    ends_at: datetime
    rules_version: str
    winners: int
    min_games: int
    min_opponents: int
    min_turns: int
    prize: str
    description: str = ""
    prize_details: str = ""
    prize_method: str = "draw"
    format: str = "casual"
    bracket_size: int | None = None
    best_of: int = 1


SEED_EVENT = Event(
    id="stress-test-2026-11",
    title="Stress Test Sunday",
    starts_at=datetime(2026, 11, 22, 17, 0, tzinfo=timezone.utc),
    ends_at=datetime(2026, 11, 22, 21, 0, tzinfo=timezone.utc),
    rules_version="2026-10-28",
    winners=3,
    min_games=3,
    min_opponents=2,
    min_turns=3,
    prize="3 x $20 TCGPlayer gift cards",
    prize_details=(
        "3 winners will each receive one $20 USD TCGPlayer gift card. The approximate total value of all prizes is $60 USD.\n"
        "Each gift card is delivered by email as a code and is subject to TCGPlayer’s own terms."
    ),
)


def event_from_row(row: DuelEvent) -> Event:
    return Event(
        id=row.id,
        title=row.title,
        starts_at=as_utc(row.starts_at),
        ends_at=as_utc(row.ends_at),
        rules_version=row.rules_version,
        winners=row.winners,
        min_games=row.min_games,
        min_opponents=row.min_opponents,
        min_turns=row.min_turns,
        prize=row.prize or "",
        description=row.description or "",
        prize_details=row.prize_details or "",
        prize_method=row.prize_method,
        format=row.format,
        bracket_size=row.bracket_size,
        best_of=row.best_of,
    )


def seed_default_event(db: Session) -> None:
    if db.scalar(select(DuelEvent.id).limit(1)) is not None:
        return
    e = SEED_EVENT
    db.add(DuelEvent(**{f.name: getattr(e, f.name) for f in fields(e)}))
    db.commit()


def list_events(db: Session) -> list[Event]:
    rows = db.scalars(select(DuelEvent).order_by(DuelEvent.starts_at.desc(), DuelEvent.id)).all()
    return [event_from_row(r) for r in rows]


def get_event(db: Session, event_id: str) -> Event | None:
    row = db.get(DuelEvent, event_id)
    return event_from_row(row) if row else None


def current_event(db: Session, now: datetime | None = None) -> Event | None:
    now = now or utcnow()
    events = list_events(db)
    ahead = [e for e in events if now < e.ends_at]
    if ahead:
        return min(ahead, key=lambda e: e.ends_at)
    recent = [e for e in events if now < e.ends_at + timedelta(days=RECENT_DAYS)]
    return max(recent, key=lambda e: e.ends_at) if recent else None


def latest_event(db: Session) -> Event | None:
    events = list_events(db)
    return max(events, key=lambda e: e.ends_at) if events else None


def event_status(event: Event, now: datetime, drawn: bool) -> str:
    if drawn:
        return "drawn"
    if now < event.starts_at:
        return "upcoming"
    if now < event.ends_at:
        return "live"
    return "ended"


def is_guest_email(email: str) -> bool:
    return email.lower().endswith(GUEST_SUFFIX)


def excluded_reason(user: User) -> str | None:
    """Why this account can never win, or None."""
    if is_guest_email(user.email):
        return "guest"
    if is_banned(user):
        return "banned"
    if is_staff(user):
        return "staff"
    return None


def is_eligible(event: Event, *, opted_in: bool, excluded: bool, games: int, opponents: int) -> bool:
    return (
        opted_in
        and not excluded
        and games >= event.min_games
        and opponents >= event.min_opponents
    )


def window_matches(db: Session, event: Event) -> list[DuelMatch]:
    return list(
        db.scalars(
            select(DuelMatch).where(
                and_(DuelMatch.created_at >= event.starts_at, DuelMatch.created_at < event.ends_at)
            )
        ).all()
    )


def _guest_ids(db: Session, matches: list[DuelMatch]) -> set[int]:
    ids = {m.seat0_user_id for m in matches} | {m.seat1_user_id for m in matches}
    if not ids:
        return set()
    return {uid for uid, email in db.execute(select(User.id, User.email).where(User.id.in_(ids))).all() if is_guest_email(email)}


def counted_matches(matches: Iterable[DuelMatch], min_turns: int) -> Iterable[DuelMatch]:
    for m in matches:
        if m.turns is None or m.turns < min_turns:
            continue
        if m.seat0_user_id == m.seat1_user_id:
            continue
        yield m


def player_stats(db: Session, event: Event) -> dict[int, tuple[int, set[int]]]:
    matches = window_matches(db, event)
    guests = _guest_ids(db, matches)
    stats: dict[int, tuple[int, set[int]]] = {}
    for m in counted_matches(matches, event.min_turns):
        a, b = m.seat0_user_id, m.seat1_user_id
        for me, other in ((a, b), (b, a)):
            if other in guests:
                continue
            games, opps = stats.get(me, (0, set()))
            opps.add(other)
            stats[me] = (games + 1, opps)
    return stats


def window_counters(db: Session, event: Event) -> tuple[int, int]:
    matches = window_matches(db, event)
    ids = {m.seat0_user_id for m in matches} | {m.seat1_user_id for m in matches}
    return len(matches), len(ids - _guest_ids(db, matches))


@dataclass(frozen=True)
class Participant:
    user: User
    games: int
    opponents: int
    eligible: bool
    excluded: str | None
    flags: tuple[str, ...] = ()


def compute_flags(db: Session, event: Event, entrant_ids: Iterable[int]) -> dict[int, tuple[str, ...]]:
    matches = window_matches(db, event)
    guests = _guest_ids(db, matches)
    counted = [m for m in counted_matches(matches, event.min_turns) if m.seat0_user_id not in guests and m.seat1_user_id not in guests]
    graph: dict[int, set[int]] = {}
    ranked_players: set[int] = set()
    for m in counted:
        a, b = m.seat0_user_id, m.seat1_user_id
        graph.setdefault(a, set()).add(b)
        graph.setdefault(b, set()).add(a)
        if m.ranked:
            ranked_players.update((a, b))
    entrants = set(entrant_ids)
    created = {
        uid: as_utc(ts)
        for uid, ts in db.execute(select(User.id, User.created_at).where(User.id.in_(entrants | set(graph)))).all()
    }
    cutoff = event.starts_at - timedelta(days=NEW_ACCOUNT_DAYS)

    def is_new(uid: int) -> bool:
        return uid in created and created[uid] >= cutoff

    def component_size(start: int) -> int:
        seen, todo = {start}, [start]
        while todo:
            for nxt in graph.get(todo.pop(), ()):
                if nxt not in seen:
                    seen.add(nxt)
                    todo.append(nxt)
        return len(seen)

    out: dict[int, tuple[str, ...]] = {}
    for uid in entrants:
        flags = []
        opps = graph.get(uid, set())
        if is_new(uid):
            flags.append("new_account")
        if opps and all(is_new(o) for o in opps):
            flags.append("new_opponents")
        if opps and component_size(uid) <= ISOLATED_GROUP_MAX:
            flags.append("isolated_group")
        if opps and uid not in ranked_players:
            flags.append("private_only")
        out[uid] = tuple(flags)
    return out


def participants(db: Session, event: Event) -> list[Participant]:
    stats = player_stats(db, event)
    users = db.scalars(
        select(User).join(EventEntry, EventEntry.user_id == User.id).where(EventEntry.event_id == event.id)
    ).all()
    flags = compute_flags(db, event, [u.id for u in users])
    out = []
    for u in users:
        games, opps = stats.get(u.id, (0, set()))
        reason = excluded_reason(u)
        out.append(
            Participant(u, games, len(opps), is_eligible(event, opted_in=True, excluded=reason is not None, games=games, opponents=len(opps)), reason, flags.get(u.id, ()))
        )
    out.sort(key=lambda p: (not p.eligible, -p.games, p.user.id))
    return out


def user_progress(db: Session, event: Event, user: User) -> dict:
    stats = player_stats(db, event)
    games, opps = stats.get(user.id, (0, set()))
    opted_in = db.scalar(
        select(EventEntry.id).where(EventEntry.event_id == event.id, EventEntry.user_id == user.id)
    ) is not None
    return {
        "opted_in": opted_in,
        "games": games,
        "opponents": len(opps),
        "eligible": is_eligible(
            event, opted_in=opted_in, excluded=excluded_reason(user) is not None, games=games, opponents=len(opps)
        ),
    }


def new_seed() -> str:
    return secrets.token_hex(32)


def seed_hash(seed: str) -> str:
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


def rank_key(seed: str, event_id: str, user_id: int) -> str:
    return hmac.new(seed.encode("utf-8"), f"{event_id}:{user_id}".encode("utf-8"), hashlib.sha256).hexdigest()


def rank_eligible(seed: str, event_id: str, user_ids: Iterable[int]) -> list[int]:
    return sorted(set(user_ids), key=lambda uid: rank_key(seed, event_id, uid))


def pick_winners(ranking: list[int], forfeited: Iterable[int], count: int) -> list[int]:
    gone = set(forfeited)
    return [uid for uid in ranking if uid not in gone][:count]
