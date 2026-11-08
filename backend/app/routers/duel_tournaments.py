"""Duel tournaments among friends: single elimination or round robin, every match one game."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.duel import tournaments as logic
from app.core.statuses import FriendshipStatus, TournamentMatchStatus, TournamentPlayerStatus, TournamentStatus
from app.core.time import as_utc, utcnow
from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.models import User
from app.duel.models import DuelTournament, DuelTournamentMatch, DuelTournamentPlayer
from app.core.rate_limit import RateLimiter
from app.duel.server_urls import known_game_server_urls
from app.social.presence import friendship, live_presence, room_server_url
from app.duel.server_urls import normalize_server_url

router = APIRouter(prefix="/tournaments", tags=["tournaments"])

MAX_ORGANIZED = 5
FINISHED_VISIBLE = timedelta(days=14)
# A room the host just reported counts as open this long even before presence shows it.
ROOM_FRESH = timedelta(seconds=30)
# While one player is opening the room the other waits this long before taking over.
HOST_LOCK = timedelta(seconds=45)

_create_rate = RateLimiter(max_calls=10, period_s=60, name="tournament_create_rate")

TIMERS = ("off", "turn_30", "seat_15m", "turn_30_seat_15m")


class TournamentIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    format: Literal["single_elim", "round_robin"]
    size: int
    timer: Literal["off", "turn_30", "seat_15m", "turn_30_seat_15m"] = "seat_15m"

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v


class InviteIn(BaseModel):
    user_id: int


class PlayIn(BaseModel):
    room_id: str | None = Field(default=None, min_length=1, max_length=64)
    server_url: str | None = Field(default=None, max_length=255)


class AwardIn(BaseModel):
    winner_id: int


class PersonOut(BaseModel):
    user_id: int
    username: str


class PlayerOut(PersonOut):
    status: str
    seed: int | None


class MatchOut(BaseModel):
    id: int
    round: int
    slot: int
    a: PersonOut | None
    b: PersonOut | None
    winner_id: int | None
    status: str
    decided_by: str | None
    room_open: bool
    host_id: int | None
    result_match_id: str | None


class StandingOut(PersonOut):
    wins: int
    losses: int
    played: int
    rank: int


class MeOut(BaseModel):
    user_id: int
    role: str | None
    can_join: bool
    can_start: bool


class TournamentOut(BaseModel):
    id: int
    code: str
    name: str
    format: str
    size: int
    timer: str
    status: str
    created_at: str
    started_at: str | None
    finished_at: str | None
    organizer: PersonOut
    winner: PersonOut | None
    players: list[PlayerOut]
    matches: list[MatchOut]
    standings: list[StandingOut]
    rounds: int
    me: MeOut


class SummaryOut(BaseModel):
    id: int
    code: str
    name: str
    format: str
    size: int
    status: str
    players_joined: int
    my_role: str
    my_match_ready: bool


class SummariesOut(BaseModel):
    tournaments: list[SummaryOut]


class PlayOut(BaseModel):
    action: Literal["join", "host", "wait", "hosted"]
    room_id: str | None = None
    server_url: str | None = None


def current_player(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.username:
        raise HTTPException(status_code=403, detail="Pick a username first.")
    return user


Me = Annotated[User, Depends(current_player)]
DB = Annotated[Session, Depends(get_db)]


def _iso(dt: datetime | None) -> str | None:
    return as_utc(dt).isoformat() if dt else None


def _get(db: Session, code: str, *, lock: bool = False) -> DuelTournament:
    q = select(DuelTournament).where(DuelTournament.code == code)
    if lock:
        q = q.with_for_update()
    t = db.scalar(q)
    if t is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    return t


def _player(db: Session, t: DuelTournament, user_id: int) -> DuelTournamentPlayer | None:
    return db.scalar(
        select(DuelTournamentPlayer).where(
            DuelTournamentPlayer.tournament_id == t.id, DuelTournamentPlayer.user_id == user_id
        )
    )


def _joined_count(db: Session, t: DuelTournament) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(DuelTournamentPlayer)
            .where(DuelTournamentPlayer.tournament_id == t.id, DuelTournamentPlayer.status == TournamentPlayerStatus.JOINED)
        )
        or 0
    )


def _require_organizer(t: DuelTournament, user: User) -> None:
    if t.organizer_id != user.id:
        raise HTTPException(status_code=403, detail="Only the organizer can do that.")


def _require_open(t: DuelTournament) -> None:
    if t.status != TournamentStatus.OPEN:
        raise HTTPException(status_code=400, detail="This tournament has already started.")


def _room_live(m: DuelTournamentMatch, presence: dict, now: datetime) -> bool:
    if not m.room_id:
        return False
    if m.room_set_at is not None and now - as_utc(m.room_set_at) <= ROOM_FRESH:
        return True
    return any(
        r.room_id == m.room_id and r.role == "player" and r.phase != "finished"
        for r in presence.get(m.host_id, [])
    )


def _out(db: Session, t: DuelTournament, me: User) -> TournamentOut:
    players = list(db.scalars(select(DuelTournamentPlayer).where(DuelTournamentPlayer.tournament_id == t.id)))
    matches = list(
        db.scalars(
            select(DuelTournamentMatch)
            .where(DuelTournamentMatch.tournament_id == t.id)
            .order_by(DuelTournamentMatch.round, DuelTournamentMatch.slot)
        )
    )
    ids = {t.organizer_id, t.winner_id, *(p.user_id for p in players)}
    for m in matches:
        ids.update((m.player_a_id, m.player_b_id))
    ids.discard(None)
    names = {u.id: u.username or "Player" for u in db.scalars(select(User).where(User.id.in_(ids)))}

    def person(uid: int | None) -> PersonOut | None:
        return PersonOut(user_id=uid, username=names.get(uid, "Player")) if uid else None

    joined = [p for p in players if p.status == TournamentPlayerStatus.JOINED]
    mine = next((p for p in players if p.user_id == me.id), None)
    role = "organizer" if t.organizer_id == me.id else (mine.status if mine else None)
    lo, hi = logic.player_limits(t.format, t.size)

    now = utcnow()
    hosts = [m.host_id for m in matches if m.status == TournamentMatchStatus.READY and m.room_id and m.host_id]
    presence = live_presence(db, list(set(hosts)), now)

    standings: list[StandingOut] = []
    if t.format == "round_robin":
        by_seed = [p.user_id for p in sorted(joined, key=lambda p: (p.seed is None, p.seed or 0, p.id))]
        for row in logic.standings(by_seed, matches):
            standings.append(
                StandingOut(
                    user_id=row.user_id,
                    username=names.get(row.user_id, "Player"),
                    wins=row.wins,
                    losses=row.losses,
                    played=row.played,
                    rank=row.rank,
                )
            )

    return TournamentOut(
        id=t.id,
        code=t.code,
        name=t.name,
        format=t.format,
        size=t.size,
        timer=t.timer,
        status=t.status,
        created_at=_iso(t.created_at) or "",
        started_at=_iso(t.started_at),
        finished_at=_iso(t.finished_at),
        organizer=person(t.organizer_id),  # type: ignore[arg-type]
        winner=person(t.winner_id),
        players=[
            PlayerOut(user_id=p.user_id, username=names.get(p.user_id, "Player"), status=p.status, seed=p.seed)
            for p in sorted(players, key=lambda p: (p.status != TournamentPlayerStatus.JOINED, p.seed or 0, p.id))
        ],
        matches=[
            MatchOut(
                id=m.id,
                round=m.round,
                slot=m.slot,
                a=person(m.player_a_id),
                b=person(m.player_b_id),
                winner_id=m.winner_id,
                status=m.status,
                decided_by=m.decided_by,
                room_open=m.status == TournamentMatchStatus.READY and _room_live(m, presence, now),
                host_id=m.host_id if m.status == TournamentMatchStatus.READY else None,
                result_match_id=m.result_match_id,
            )
            for m in matches
        ],
        standings=standings,
        rounds=logic.total_rounds(t, len(joined)),
        me=MeOut(
            user_id=me.id,
            role=role,
            can_join=t.status == TournamentStatus.OPEN and not (mine and mine.status == TournamentPlayerStatus.JOINED) and len(joined) < t.size,
            can_start=t.status == TournamentStatus.OPEN and t.organizer_id == me.id and lo <= len(joined) <= hi,
        ),
    )


@router.get("", response_model=SummariesOut)
def list_tournaments(db: DB, user: Me) -> SummariesOut:
    mine = (
        select(DuelTournamentPlayer.tournament_id).where(DuelTournamentPlayer.user_id == user.id)
    )
    rows = db.scalars(
        select(DuelTournament).where(
            or_(DuelTournament.organizer_id == user.id, DuelTournament.id.in_(mine)),
            DuelTournament.status != TournamentStatus.CANCELLED,
        )
    ).all()
    cutoff = utcnow() - FINISHED_VISIBLE
    rows = [t for t in rows if t.status != TournamentStatus.FINISHED or (t.finished_at and as_utc(t.finished_at) >= cutoff)]
    order = {TournamentStatus.RUNNING: 0, TournamentStatus.OPEN: 1, TournamentStatus.FINISHED: 2}
    rows.sort(key=lambda t: (order.get(t.status, 3), -as_utc(t.created_at).timestamp(), -t.id))

    ids = [t.id for t in rows]
    players = list(db.scalars(select(DuelTournamentPlayer).where(DuelTournamentPlayer.tournament_id.in_(ids))))
    ready = set(
        db.scalars(
            select(DuelTournamentMatch.tournament_id).where(
                DuelTournamentMatch.tournament_id.in_(ids),
                DuelTournamentMatch.status == TournamentMatchStatus.READY,
                or_(DuelTournamentMatch.player_a_id == user.id, DuelTournamentMatch.player_b_id == user.id),
            )
        )
    )
    out: list[SummaryOut] = []
    for t in rows:
        mine_row = next((p for p in players if p.tournament_id == t.id and p.user_id == user.id), None)
        out.append(
            SummaryOut(
                id=t.id,
                code=t.code,
                name=t.name,
                format=t.format,
                size=t.size,
                status=t.status,
                players_joined=sum(1 for p in players if p.tournament_id == t.id and p.status == TournamentPlayerStatus.JOINED),
                my_role="organizer" if t.organizer_id == user.id else (mine_row.status if mine_row else TournamentPlayerStatus.JOINED),
                my_match_ready=t.id in ready and t.status == TournamentStatus.RUNNING,
            )
        )
    return SummariesOut(tournaments=out)


@router.post("", response_model=TournamentOut, status_code=201)
def create_tournament(body: TournamentIn, db: DB, user: Me) -> TournamentOut:
    if not _create_rate.allow(f"tournament-create:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many tournaments. Try again in a minute.")
    if body.format == "single_elim":
        if body.size not in logic.SIZES:
            raise HTTPException(status_code=400, detail="A bracket has 4, 8 or 16 players.")
    elif not logic.RR_MIN <= body.size <= logic.RR_MAX:
        raise HTTPException(status_code=400, detail=f"Round robin takes {logic.RR_MIN} to {logic.RR_MAX} players.")
    active = db.scalar(
        select(func.count())
        .select_from(DuelTournament)
        .where(DuelTournament.organizer_id == user.id, DuelTournament.status.in_((TournamentStatus.OPEN, TournamentStatus.RUNNING)))
    )
    if (active or 0) >= MAX_ORGANIZED:
        raise HTTPException(status_code=400, detail="You already have 5 tournaments going.")
    t = DuelTournament(
        code=secrets.token_urlsafe(9)[:12],
        name=body.name,
        format=body.format,
        size=body.size,
        timer=body.timer,
        status=TournamentStatus.OPEN,
        organizer_id=user.id,
    )
    db.add(t)
    for _ in range(3):
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            t.code = secrets.token_urlsafe(9)[:12]
            db.add(t)
    db.add(DuelTournamentPlayer(tournament_id=t.id, user_id=user.id, status=TournamentPlayerStatus.JOINED))
    db.commit()
    return _out(db, t, user)


@router.get("/{code}", response_model=TournamentOut)
def get_tournament(code: str, db: DB, user: Me) -> TournamentOut:
    return _out(db, _get(db, code), user)


@router.post("/{code}/join", response_model=TournamentOut)
def join(code: str, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    p = _player(db, t, user.id)
    if p is not None and p.status == TournamentPlayerStatus.JOINED:
        return _out(db, t, user)
    _require_open(t)
    if _joined_count(db, t) >= t.size:
        raise HTTPException(status_code=400, detail="This tournament is full.")
    if p is None:
        db.add(DuelTournamentPlayer(tournament_id=t.id, user_id=user.id, status=TournamentPlayerStatus.JOINED))
    else:
        p.status = TournamentPlayerStatus.JOINED
    db.commit()
    return _out(db, t, user)


@router.post("/{code}/leave", response_model=TournamentOut)
def leave(code: str, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    if t.organizer_id == user.id:
        raise HTTPException(status_code=400, detail="The organizer can't leave. Cancel the tournament instead.")
    _require_open(t)
    p = _player(db, t, user.id)
    if p is not None:
        db.delete(p)
        db.commit()
    return _out(db, t, user)


@router.post("/{code}/invite", response_model=TournamentOut)
def invite(code: str, body: InviteIn, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    _require_organizer(t, user)
    _require_open(t)
    f = friendship(db, user.id, body.user_id)
    if f is None or f.status != FriendshipStatus.ACCEPTED:
        raise HTTPException(status_code=403, detail="You can only invite friends.")
    if _player(db, t, body.user_id) is None:
        db.add(DuelTournamentPlayer(tournament_id=t.id, user_id=body.user_id, status=TournamentPlayerStatus.INVITED))
        db.commit()
    return _out(db, t, user)


@router.delete("/{code}/players/{user_id}", response_model=TournamentOut)
def remove_player(code: str, user_id: int, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    _require_organizer(t, user)
    _require_open(t)
    if user_id == t.organizer_id:
        raise HTTPException(status_code=400, detail="You can't remove yourself. Cancel the tournament instead.")
    p = _player(db, t, user_id)
    if p is not None:
        db.delete(p)
        db.commit()
    return _out(db, t, user)


@router.post("/{code}/start", response_model=TournamentOut)
def start(code: str, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    _require_organizer(t, user)
    _require_open(t)
    lo, _hi = logic.player_limits(t.format, t.size)
    if _joined_count(db, t) < lo:
        raise HTTPException(status_code=400, detail=f"Need at least {lo} players.")
    logic.start(db, t)
    db.commit()
    return _out(db, t, user)


@router.post("/{code}/cancel", response_model=TournamentOut)
def cancel(code: str, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    _require_organizer(t, user)
    if t.status == TournamentStatus.FINISHED:
        raise HTTPException(status_code=400, detail="This tournament is already finished.")
    t.status = TournamentStatus.CANCELLED
    db.commit()
    return _out(db, t, user)


def _match(db: Session, t: DuelTournament, match_id: int) -> DuelTournamentMatch:
    m = db.scalar(
        select(DuelTournamentMatch)
        .where(DuelTournamentMatch.id == match_id, DuelTournamentMatch.tournament_id == t.id)
        .with_for_update()
    )
    if m is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    return m


def _require_ready(t: DuelTournament, m: DuelTournamentMatch) -> None:
    if t.status != TournamentStatus.RUNNING or m.status != TournamentMatchStatus.READY:
        raise HTTPException(status_code=409, detail="This match is not ready.")


@router.post("/{code}/matches/{match_id}/play", response_model=PlayOut)
def play(
    code: str,
    match_id: int,
    body: PlayIn,
    db: DB,
    user: Me,
    settings: Annotated[Settings, Depends(get_settings)],
) -> PlayOut:
    t = _get(db, code)
    m = _match(db, t, match_id)
    if user.id not in (m.player_a_id, m.player_b_id):
        raise HTTPException(status_code=403, detail="You are not in this match.")
    _require_ready(t, m)
    now = utcnow()

    if body.room_id is not None:
        if m.host_id != user.id:
            raise HTTPException(status_code=409, detail="You are not opening this room.")
        server_url = normalize_server_url(body.server_url)
        if server_url not in known_game_server_urls(settings):
            server_url = None
        m.room_id = body.room_id.strip()
        m.server_url = server_url
        m.room_set_at = now
        db.commit()
        return PlayOut(action="hosted")

    presence = live_presence(db, [m.host_id] if m.host_id else [], now)
    if m.host_id != user.id and _room_live(m, presence, now):
        server_url = m.server_url or room_server_url(presence.get(m.host_id, []), m.room_id)
        return PlayOut(action="join", room_id=m.room_id, server_url=server_url)
    if (
        m.host_id is not None
        and m.host_id != user.id
        and m.room_id is None
        and m.host_claimed_at is not None
        and now - as_utc(m.host_claimed_at) <= HOST_LOCK
    ):
        return PlayOut(action="wait")
    m.host_id = user.id
    m.host_claimed_at = now
    m.room_id = None
    m.server_url = None
    m.room_set_at = None
    db.commit()
    return PlayOut(action="host")


@router.post("/{code}/matches/{match_id}/award", response_model=TournamentOut)
def award(code: str, match_id: int, body: AwardIn, db: DB, user: Me) -> TournamentOut:
    t = _get(db, code, lock=True)
    _require_organizer(t, user)
    m = _match(db, t, match_id)
    _require_ready(t, m)
    if body.winner_id not in (m.player_a_id, m.player_b_id):
        raise HTTPException(status_code=400, detail="The winner must be one of the two players.")
    logic.decide(db, t, m, body.winner_id, "walkover")
    db.commit()
    return _out(db, t, user)
