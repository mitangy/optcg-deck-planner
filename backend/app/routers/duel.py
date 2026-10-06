"""Duel token mint, match ingest, and ratings (Step 4)."""

from __future__ import annotations

import hmac
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Request
from sqlalchemy import delete, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analyst_stats import seats_for
from app.auth import get_current_user, get_optional_user
from app.config import Settings, get_settings
from app.db import get_db
from app.duel_ratings import INITIAL_RATING, apply_elo
from app.game_tokens import mint_game_token, verify_game_token
from app.models import (
    CardReport,
    DuelMatch,
    DuelMatchLog,
    DuelMatchProgress,
    DuelMatchSeatLog,
    DuelPresence,
    DuelRating,
    User,
)
from app.rate_limit import RateLimiter, client_ip
from app.reporter import identify_reporter
from app.usernames import duel_display_name
from app.routers.api import _require_catalog_token
from app.schemas import (
    CardReportIn,
    CardReportOut,
    CardReportStatusIn,
    DuelDevTokenIn,
    DuelGuestTokenIn,
    DuelLeaderboardEntryOut,
    DuelLeaderboardOut,
    DuelMatchDetailOut,
    DuelMatchHistoryEntry,
    DuelMatchHistoryOut,
    DuelMatchIngest,
    DuelMatchProgressIngest,
    DuelMatchOut,
    DuelPresenceSnapshot,
    DuelRatingOut,
    DuelTokenOut,
)

router = APIRouter(prefix="/duel", tags=["duel"])
log = logging.getLogger(__name__)

# A long game is a few hundred intents (tens of KB). Anything far larger is dropped, not the result.
MAX_REPLAY_BYTES = 1_000_000

_token_rate = RateLimiter(max_calls=30, period_s=60, name="duel_token_rate")
_ingest_rate = RateLimiter(max_calls=120, period_s=60, name="duel_ingest_rate")
_presence_rate = RateLimiter(max_calls=120, period_s=60, name="duel_presence_rate")
# One snapshot per turn per live game, all from the game server's address.
_progress_rate = RateLimiter(max_calls=1200, period_s=60, name="duel_progress_rate")
_report_rate = RateLimiter(max_calls=10, period_s=600, name="duel_report_rate")
# Reports are stored forever and the per-IP key can be spoofed (X-Forwarded-For),
# so cap the total too.
_report_global_rate = RateLimiter(max_calls=60, period_s=3600, name="duel_report_global_rate")
# Guest and dev ids are client-chosen, so a fresh id per request would create a
# User + DuelRating row every time. New accounts are capped per IP and in total.
_new_account_ip_rate = RateLimiter(max_calls=20, period_s=3600, name="duel_new_account_ip_rate")
_new_account_global_rate = RateLimiter(max_calls=600, period_s=3600, name="duel_new_account_global_rate")

_USER_KEY_RE = re.compile(r"^[a-zA-Z0-9_.:-]{1,64}$")
_GUEST_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")


def _allow_new_account(request: Request) -> None:
    """Spend one new-account slot, or refuse with 429 (re-minting an existing id never needs one)."""
    if not _new_account_ip_rate.allow(f"new-account:{client_ip(request)}") or not _new_account_global_rate.allow(
        "new-account"
    ):
        raise HTTPException(status_code=429, detail="Too many new players right now; try again later")


def _get_or_create_rating(db: Session, user_id: int) -> DuelRating:
    # Token minting and the first result can race to initialize a rating. Keep
    # initialization atomic without rolling back the surrounding match transaction.
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    db.execute(
        insert(DuelRating)
        .values(user_id=user_id, rating=INITIAL_RATING, games_played=0)
        .on_conflict_do_nothing(index_elements=[DuelRating.user_id])
    )
    row = db.get(DuelRating, user_id)
    assert row is not None
    return row


def _token_out(db: Session, user: User, settings: Settings) -> DuelTokenOut:
    display_name = duel_display_name(user)
    minted = mint_game_token(
        user_id=user.id, email=user.email, name=display_name, settings=settings
    )
    rating = _get_or_create_rating(db, user.id)
    db.commit()
    return DuelTokenOut(
        token=minted["token"],
        expires_at=minted["expires_at"],
        user_id=user.id,
        email=user.email,
        display_name=display_name,
        rating=rating.rating,
        games_played=rating.games_played,
    )


@router.post("/token", response_model=DuelTokenOut)
def mint_token_for_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelTokenOut:
    if not _token_rate.allow(f"duel-token:{client_ip(request)}:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many token requests")
    return _token_out(db, user, settings)


@router.post("/dev-token", response_model=DuelTokenOut)
def mint_dev_token(
    body: DuelDevTokenIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelTokenOut:
    """Cookie-free token mint for Expo / duel-web when ENABLE_DEV_LOGIN or ENABLE_DUEL_DEV_TOKEN."""
    if not settings.enable_dev_login and not settings.enable_duel_dev_token:
        raise HTTPException(status_code=404, detail="Not found")
    if not _USER_KEY_RE.match(body.user_key):
        raise HTTPException(status_code=400, detail="Invalid user_key")
    if not _token_rate.allow(f"duel-dev-token:{client_ip(request)}:{body.user_key}"):
        raise HTTPException(status_code=429, detail="Too many token requests")

    email = f"duel-{body.user_key.lower()}@localhost"
    sub = f"duel-dev-{body.user_key.lower()}"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        _allow_new_account(request)
        user = User(email=email, name=body.user_key, google_sub=sub)
        db.add(user)
        db.flush()
    return _token_out(db, user, settings)


@router.post("/guest-token", response_model=DuelTokenOut)
def mint_guest_token(
    body: DuelGuestTokenIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelTokenOut:
    """Always-on cookie-free mint keyed by a stable browser guest id (rating continuity)."""
    if not _GUEST_ID_RE.match(body.guest_id):
        raise HTTPException(status_code=400, detail="Invalid guest_id")
    if not _token_rate.allow(f"duel-guest-token:{client_ip(request)}:{body.guest_id}"):
        raise HTTPException(status_code=429, detail="Too many token requests")

    email = f"guest-{body.guest_id.lower()}@localhost"
    sub = f"duel-guest-{body.guest_id.lower()}"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        _allow_new_account(request)
        user = User(email=email, name=f"Guest {body.guest_id[:8]}", google_sub=sub)
        db.add(user)
        try:
            db.flush()
            # Commit early so a concurrent mint that hits IntegrityError can
            # re-select this row (SQLite won't expose an uncommitted insert).
            db.commit()
            db.refresh(user)
        except IntegrityError:
            # Concurrent StrictMode / double-mount mints for the same guest id.
            db.rollback()
            user = None
            for _ in range(20):
                user = db.scalar(select(User).where(User.email == email))
                if user is not None:
                    break
                time.sleep(0.01)
            if user is None:
                raise HTTPException(
                    status_code=503,
                    detail="Guest mint race; retry",
                ) from None
    return _token_out(db, user, settings)


def _require_ingest_secret(
    settings: Settings,
    x_duel_ingest_token: str | None,
) -> None:
    expected = settings.duel_ingest_secret or ""
    provided = x_duel_ingest_token or ""
    if not expected or not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/matches", response_model=DuelMatchOut)
def ingest_match(
    body: DuelMatchIngest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_duel_ingest_token: Annotated[str | None, Header()] = None,
) -> DuelMatchOut:
    _require_ingest_secret(settings, x_duel_ingest_token)
    if not _ingest_rate.allow(f"duel-ingest:{client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many ingest requests")
    if body.seat0_user_id == body.seat1_user_id:
        raise HTTPException(status_code=400, detail="Seats must be different users")

    # Acquire locks before any result/rating read. The match lock serializes
    # retries even when a conflicting submission names completely different users.
    # Sorted user locks serialize different matches involving the same players
    # without deadlocking when the players occupy opposite seats.
    _lock_match(db, body.match_id)

    existing = db.scalar(select(DuelMatch).where(DuelMatch.match_id == body.match_id))
    if existing is not None:
        if any(
            getattr(existing, field) != getattr(body, field)
            for field in ("seat0_user_id", "seat1_user_id", "winner_seat", "reason", "ranked")
        ):
            raise HTTPException(status_code=409, detail="Conflicting result for match_id")
        return DuelMatchOut(
            match_id=existing.match_id,
            created=False,
            winner_seat=existing.winner_seat,
            seat0_rating_before=existing.seat0_rating_before,
            seat1_rating_before=existing.seat1_rating_before,
            seat0_rating_after=existing.seat0_rating_after,
            seat1_rating_after=existing.seat1_rating_after,
        )

    for uid in sorted((body.seat0_user_id, body.seat1_user_id)):
        if db.scalar(select(User.id).where(User.id == uid).with_for_update()) is None:
            raise HTTPException(status_code=400, detail=f"Unknown user_id {uid}")

    r0 = _get_or_create_rating(db, body.seat0_user_id)
    r1 = _get_or_create_rating(db, body.seat1_user_id)
    before0, before1 = r0.rating, r1.rating
    after0, after1 = before0, before1

    if body.ranked:
        score0 = 1.0 if body.winner_seat == 0 else 0.0
        after0, after1 = apply_elo(
            before0,
            before1,
            score_a=score0,
            games_a=r0.games_played,
            games_b=r1.games_played,
        )
        r0.rating = after0
        r1.rating = after1
        r0.games_played += 1
        r1.games_played += 1

    row = DuelMatch(
        match_id=body.match_id,
        seat0_user_id=body.seat0_user_id,
        seat1_user_id=body.seat1_user_id,
        winner_seat=body.winner_seat,
        reason=body.reason,
        ranked=body.ranked,
        seat0_rating_before=before0,
        seat1_rating_before=before1,
        seat0_rating_after=after0,
        seat1_rating_after=after1,
        seat0_leader_id=body.seat0_leader_id,
        seat1_leader_id=body.seat1_leader_id,
        turns=body.turns,
    )
    db.add(row)
    db.flush()
    if body.replay is not None:
        replay_text = json.dumps(body.replay, separators=(",", ":"))
        if len(replay_text) <= MAX_REPLAY_BYTES:
            db.add(DuelMatchLog(match_id=body.match_id, replay=replay_text))
        else:
            log.warning("duel replay for %s dropped: %d bytes", body.match_id, len(replay_text))
    for seat, seat_log in enumerate(body.seat_logs or []):
        log_text = json.dumps(seat_log, separators=(",", ":"))
        if len(log_text) <= MAX_REPLAY_BYTES:
            db.add(DuelMatchSeatLog(match_id=body.match_id, seat=seat, log=log_text))
        else:
            log.warning("duel seat %d log for %s dropped: %d bytes", seat, body.match_id, len(log_text))
    # Leaders, decks and who went first, for Log Pose matchup stats.
    db.add_all(seats_for(row, body.replay))
    # The finished logs replace the per-turn snapshot.
    db.execute(delete(DuelMatchProgress).where(DuelMatchProgress.match_id == body.match_id))
    db.commit()
    return DuelMatchOut(
        match_id=row.match_id,
        created=True,
        winner_seat=row.winner_seat,
        seat0_rating_before=before0,
        seat1_rating_before=before1,
        seat0_rating_after=after0,
        seat1_rating_after=after1,
    )


def _lock_match(db: Session, match_id: str) -> None:
    """Serialize every write for one match_id (result and per-turn progress) until commit."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        lock_id = int.from_bytes(
            hashlib.sha256(f"duel-match:{match_id}".encode()).digest()[:8],
            byteorder="big", signed=True,
        )
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})


def _capped_json(value: dict | None, what: str, match_id: str) -> str | None:
    if value is None:
        return None
    value_text = json.dumps(value, separators=(",", ":"))
    if len(value_text) <= MAX_REPLAY_BYTES:
        return value_text
    log.warning("duel %s for %s dropped: %d bytes", what, match_id, len(value_text))
    return None


@router.put("/matches/{match_id}/progress", status_code=204)
def ingest_match_progress(
    body: DuelMatchProgressIngest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    match_id: Annotated[str, Path(min_length=1, max_length=64)],
    x_duel_ingest_token: Annotated[str | None, Header()] = None,
) -> None:
    """Keep the latest log of a game that has no result yet, so a game cut short still has one."""
    _require_ingest_secret(settings, x_duel_ingest_token)
    if not _progress_rate.allow(f"duel-progress:{client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many progress updates")
    if body.seat0_user_id == body.seat1_user_id:
        raise HTTPException(status_code=400, detail="Seats must be different users")
    _lock_match(db, match_id)
    if db.scalar(select(DuelMatch.id).where(DuelMatch.match_id == match_id)) is not None:
        # The result is in; a snapshot that lost the race must not bring the game back.
        db.rollback()
        return
    known = set(db.scalars(select(User.id).where(User.id.in_((body.seat0_user_id, body.seat1_user_id)))))
    if len(known) != 2:
        raise HTTPException(status_code=400, detail="Unknown user_id")
    row = db.get(DuelMatchProgress, match_id)
    if row is None:
        row = DuelMatchProgress(match_id=match_id, seat0_user_id=body.seat0_user_id, seat1_user_id=body.seat1_user_id)
        db.add(row)
    elif (row.seat0_user_id, row.seat1_user_id) != (body.seat0_user_id, body.seat1_user_id):
        raise HTTPException(status_code=409, detail="Conflicting players for match_id")
    seat_logs = body.seat_logs or [None, None]
    row.ranked = body.ranked
    row.seat0_leader_id = body.seat0_leader_id
    row.seat1_leader_id = body.seat1_leader_id
    row.turns = body.turns
    row.replay = _capped_json(body.replay, "progress replay", match_id)
    row.seat0_log = _capped_json(seat_logs[0], "progress seat 0 log", match_id)
    row.seat1_log = _capped_json(seat_logs[1], "progress seat 1 log", match_id)
    row.updated_at = datetime.now(timezone.utc)
    db.commit()


@router.put("/presence", status_code=204)
def ingest_presence(
    body: DuelPresenceSnapshot,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_duel_ingest_token: Annotated[str | None, Header()] = None,
) -> None:
    """Replace one game-server process's presence rows with its latest snapshot."""
    _require_ingest_secret(settings, x_duel_ingest_token)
    if not _presence_rate.allow(f"duel-presence:{body.instance_id}"):
        raise HTTPException(status_code=429, detail="Too many presence updates")
    now = datetime.now(timezone.utc)
    known = set(
        db.scalars(
            select(User.id).where(User.id.in_({e.user_id for e in body.entries if e.user_id > 0}))
        )
    )
    db.execute(delete(DuelPresence).where(DuelPresence.instance_id == body.instance_id))
    seen: set[tuple[int, str]] = set()
    for e in body.entries:
        key = (e.user_id, e.room_id)
        if e.user_id not in known or key in seen:
            continue
        seen.add(key)
        # merge: a room that moved between processes keeps one row per (user, room).
        db.merge(
            DuelPresence(
                user_id=e.user_id,
                room_id=e.room_id,
                instance_id=body.instance_id,
                role=e.role,
                phase=e.phase,
                ranked=e.ranked,
                updated_at=now,
            )
        )
    db.commit()


@router.get("/rating/me", response_model=DuelRatingOut)
def my_rating(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DuelRatingOut:
    rating = _get_or_create_rating(db, user.id)
    db.commit()
    return DuelRatingOut(
        user_id=user.id,
        email=user.email,
        name=duel_display_name(user),
        username=user.username,
        rating=rating.rating,
        games_played=rating.games_played,
    )


@router.get("/matches/me", response_model=DuelMatchHistoryOut)
def my_matches(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = 20,
) -> DuelMatchHistoryOut:
    """The signed-in player's recent duels, newest first, with games that never finished."""
    return DuelMatchHistoryOut(matches=match_history(db, user, limit, include_unfinished=True))


def match_history(
    db: Session, user: User, limit: int, include_unfinished: bool = False
) -> list[DuelMatchHistoryEntry]:
    """A player's recent duels from their own seat, newest first (also read by the analyst)."""
    limit = max(1, min(limit, 100))
    rows = db.scalars(
        select(DuelMatch)
        .where(or_(DuelMatch.seat0_user_id == user.id, DuelMatch.seat1_user_id == user.id))
        .order_by(DuelMatch.created_at.desc(), DuelMatch.id.desc())
        .limit(limit)
    ).all()
    entries = _history_entries(db, user, rows)
    if not include_unfinished:
        return entries
    unfinished = db.scalars(
        select(DuelMatchProgress)
        .where(or_(DuelMatchProgress.seat0_user_id == user.id, DuelMatchProgress.seat1_user_id == user.id))
        .order_by(DuelMatchProgress.updated_at.desc())
        .limit(limit)
    ).all()
    entries += _unfinished_entries(db, user, unfinished)
    entries.sort(key=lambda e: _sort_time(e.created_at), reverse=True)
    return entries[:limit]


def _sort_time(iso: str | None) -> datetime:
    if not iso:
        return datetime.min.replace(tzinfo=timezone.utc)
    when = datetime.fromisoformat(iso)
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _unfinished_entries(db: Session, user: User, rows: list[DuelMatchProgress]) -> list[DuelMatchHistoryEntry]:
    """Games with no result: no winner and no Bounty change, dated by their last saved turn."""
    if not rows:
        return []
    opponent_ids = {r.seat1_user_id if r.seat0_user_id == user.id else r.seat0_user_id for r in rows}
    opponents = {u.id: u for u in db.scalars(select(User).where(User.id.in_(opponent_ids))).all()}
    entries = []
    for r in rows:
        seat = 0 if r.seat0_user_id == user.id else 1
        opponent = opponents.get(r.seat1_user_id if seat == 0 else r.seat0_user_id)
        entries.append(
            DuelMatchHistoryEntry(
                match_id=r.match_id,
                created_at=r.updated_at.isoformat() if r.updated_at else None,
                ranked=r.ranked,
                your_seat=seat,
                won=False,
                reason="unfinished",
                turns=r.turns,
                your_leader_id=r.seat0_leader_id if seat == 0 else r.seat1_leader_id,
                opponent_leader_id=r.seat1_leader_id if seat == 0 else r.seat0_leader_id,
                opponent_name=duel_display_name(opponent) if opponent else "Player",
                rating_before=0,
                rating_after=0,
                has_replay=r.replay is not None,
                has_log=(r.seat0_log if seat == 0 else r.seat1_log) is not None,
                finished=False,
            )
        )
    return entries


def _history_entries(db: Session, user: User, rows: list[DuelMatch]) -> list[DuelMatchHistoryEntry]:
    if not rows:
        return []
    ids = [r.match_id for r in rows]
    opponent_ids = {r.seat1_user_id if r.seat0_user_id == user.id else r.seat0_user_id for r in rows}
    opponents = {u.id: u for u in db.scalars(select(User).where(User.id.in_(opponent_ids))).all()}
    with_replay = set(db.scalars(select(DuelMatchLog.match_id).where(DuelMatchLog.match_id.in_(ids))).all())
    with_log = {
        (match_id, seat)
        for match_id, seat in db.execute(
            select(DuelMatchSeatLog.match_id, DuelMatchSeatLog.seat).where(DuelMatchSeatLog.match_id.in_(ids))
        ).all()
    }
    matches = []
    for r in rows:
        seat = 0 if r.seat0_user_id == user.id else 1
        opponent = opponents.get(r.seat1_user_id if seat == 0 else r.seat0_user_id)
        matches.append(
            DuelMatchHistoryEntry(
                match_id=r.match_id,
                created_at=r.created_at.isoformat() if r.created_at else None,
                ranked=r.ranked,
                your_seat=seat,
                won=r.winner_seat == seat,
                reason=r.reason,
                turns=r.turns,
                your_leader_id=r.seat0_leader_id if seat == 0 else r.seat1_leader_id,
                opponent_leader_id=r.seat1_leader_id if seat == 0 else r.seat0_leader_id,
                opponent_name=duel_display_name(opponent) if opponent else "Player",
                rating_before=r.seat0_rating_before if seat == 0 else r.seat1_rating_before,
                rating_after=r.seat0_rating_after if seat == 0 else r.seat1_rating_after,
                has_replay=r.match_id in with_replay,
                has_log=(r.match_id, seat) in with_log,
            )
        )
    return matches


@router.get("/matches/me/{match_id}", response_model=DuelMatchDetailOut)
def my_match(
    match_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DuelMatchDetailOut:
    """One of the signed-in player's duels with their own turn-by-turn log (never the opponent's)."""
    row = db.scalar(select(DuelMatch).where(DuelMatch.match_id == match_id))
    if row is None:
        progress = db.get(DuelMatchProgress, match_id)
        if progress is None or user.id not in (progress.seat0_user_id, progress.seat1_user_id):
            raise HTTPException(status_code=404, detail="Match not found")
        log_text = progress.seat0_log if progress.seat0_user_id == user.id else progress.seat1_log
        return DuelMatchDetailOut(
            match=_unfinished_entries(db, user, [progress])[0],
            log=json.loads(log_text) if log_text else None,
        )
    if user.id not in (row.seat0_user_id, row.seat1_user_id):
        raise HTTPException(status_code=404, detail="Match not found")
    seat = 0 if row.seat0_user_id == user.id else 1
    seat_log = db.get(DuelMatchSeatLog, (match_id, seat))
    return DuelMatchDetailOut(
        match=_history_entries(db, user, [row])[0],
        log=json.loads(seat_log.log) if seat_log else None,
    )


@router.get("/leaderboard", response_model=DuelLeaderboardOut)
def leaderboard(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 20,
) -> DuelLeaderboardOut:
    limit = max(1, min(limit, 100))
    rows = db.execute(
        select(DuelRating, User)
        .join(User, User.id == DuelRating.user_id)
        .order_by(DuelRating.rating.desc(), DuelRating.games_played.desc())
        .limit(limit)
    ).all()
    entries = [
        DuelLeaderboardEntryOut(
            user_id=user.id,
            name=duel_display_name(user),
            username=user.username,
            rating=rating.rating,
            games_played=rating.games_played,
        )
        for rating, user in rows
    ]
    return DuelLeaderboardOut(entries=entries)


def _report_out(row: CardReport, user: User | None) -> CardReportOut:
    return CardReportOut(
        id=row.id,
        card_id=row.card_id,
        description=row.description,
        user_id=row.user_id,
        reporter=duel_display_name(user) if user is not None else "anonymous",
        source=row.source,
        room_id=row.room_id,
        client_build=row.client_build,
        status=row.status,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.post("/card-reports", response_model=CardReportOut, status_code=201)
def create_card_report(
    body: CardReportIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_user: Annotated[User | None, Depends(get_optional_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> CardReportOut:
    """Record a tester's report that a card does not play as printed."""
    if not _report_rate.allow(f"card-report:{client_ip(request)}") or not _report_global_rate.allow("card-report"):
        raise HTTPException(status_code=429, detail="Too many reports; try again later")
    user = identify_reporter(db, settings, session_user, authorization)
    row = CardReport(
        card_id=body.card_id.upper(),
        description=body.description,
        user_id=user.id if user is not None else None,
        source=body.source,
        room_id=body.room_id,
        client_build=body.client_build,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _report_out(row, user)


@router.get("/card-reports", response_model=list[CardReportOut])
def list_card_reports(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
    status: str | None = "open",
    card_id: str | None = None,
    limit: int = 200,
) -> list[CardReportOut]:
    """Reports for triage, newest first (guarded by the admin catalog token).

    Pass ``status=all`` to include fixed and won't-fix reports.
    """
    _require_catalog_token(x_catalog_token, settings)
    query = select(CardReport, User).outerjoin(User, User.id == CardReport.user_id)
    if status and status != "all":
        query = query.where(CardReport.status == status)
    if card_id:
        query = query.where(CardReport.card_id == card_id.upper())
    rows = db.execute(
        query.order_by(CardReport.id.desc()).limit(max(1, min(limit, 1000)))
    ).all()
    return [_report_out(row, user) for row, user in rows]


@router.patch("/card-reports/{report_id}", response_model=CardReportOut)
def update_card_report(
    report_id: int,
    body: CardReportStatusIn,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
) -> CardReportOut:
    """Mark a report open, fixed or won't-fix (admin catalog token)."""
    _require_catalog_token(x_catalog_token, settings)
    row = db.get(CardReport, report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    row.status = body.status
    db.commit()
    db.refresh(row)
    user = db.get(User, row.user_id) if row.user_id is not None else None
    return _report_out(row, user)
