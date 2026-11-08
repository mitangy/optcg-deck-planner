"""Match helpers the duel routes, the analyst, the report route and the idle-progress sweep share (refactor D-02).

Also a player's match history (also read by the analyst) and the cut-off-game rules behind it.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.core import redis_client
from app.duel import live as duel_live
from app.core.time import as_utc
from app.analyst.models import AnalystMessage, AnalystThread
from app.core.models import User
from app.duel.models import DuelMatch, DuelMatchLog, DuelMatchProgress, DuelMatchSeatLog
from app.duel.schemas import DuelMatchHistoryEntry
from app.usernames import duel_display_name


def lock_match(db: Session, match_id: str) -> None:
    """Serialize every write for one match_id (result and per-turn progress) until commit."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        lock_id = int.from_bytes(
            hashlib.sha256(f"duel-match:{match_id}".encode()).digest()[:8],
            byteorder="big", signed=True,
        )
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_id})


def has_result(db: Session, match_id: str) -> bool:
    return db.scalar(select(DuelMatch.id).where(DuelMatch.match_id == match_id)) is not None


def latest_progress(db: Session, match_id: str) -> DuelMatchProgress | None:
    """The newest snapshot of an unfinished game: Redis's live copy or Postgres's stored one."""
    stored = db.get(DuelMatchProgress, match_id)
    r = redis_client.get_redis()
    if r is None:
        return stored
    try:
        live = duel_live.read_progress(r, match_id)
    except redis_client.RedisError:
        redis_client.report_failure("progress read")
        return stored
    if live is None or (stored is not None and as_utc(stored.updated_at) >= as_utc(live.updated_at)):
        return stored
    return live


# A cut-off game whose room never reported closing (server crash) counts as closed after this long without a snapshot.
PROGRESS_STALE_AFTER = timedelta(hours=24)


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
    entries = history_entries(db, user, rows)
    if not include_unfinished:
        return entries
    unfinished = db.scalars(
        select(DuelMatchProgress)
        .where(or_(DuelMatchProgress.seat0_user_id == user.id, DuelMatchProgress.seat1_user_id == user.id))
        .order_by(DuelMatchProgress.updated_at.desc())
        .limit(limit)
    ).all()
    entries += unfinished_entries(db, user, _with_live_progress(db, user, list(unfinished), limit))
    entries.sort(key=lambda e: _sort_time(e.created_at), reverse=True)
    return entries[:limit]


def _with_live_progress(
    db: Session, user: User, stored: list[DuelMatchProgress], limit: int
) -> list[DuelMatchProgress]:
    """Postgres's unfinished games plus Redis's live ones (newest copy of each), minus finished ones."""
    r = redis_client.get_redis()
    if r is None:
        return stored
    try:
        live = duel_live.user_progress(r, user.id, limit)
    except redis_client.RedisError:
        redis_client.report_failure("progress read")
        return stored
    if not live:
        return stored
    newest: dict[str, DuelMatchProgress] = {}
    for row in [*stored, *live]:
        seen = newest.get(row.match_id)
        if seen is None or as_utc(row.updated_at) > as_utc(seen.updated_at):
            newest[row.match_id] = row
    # A live snapshot can land just after the result (no match lock on the Redis path).
    finished = set(db.scalars(select(DuelMatch.match_id).where(DuelMatch.match_id.in_(list(newest)))))
    return [row for match_id, row in newest.items() if match_id not in finished]


def progress_closed(progress: DuelMatchProgress, now: datetime) -> bool:
    """Nobody is playing this cut-off game any more: its room said so, or it went quiet for a day."""
    if progress.closed:
        return True
    updated = progress.updated_at
    if updated is None:
        return False
    updated = as_utc(updated)
    return now - updated > PROGRESS_STALE_AFTER


def _sort_time(iso: str | None) -> datetime:
    if not iso:
        return datetime.min.replace(tzinfo=timezone.utc)
    return as_utc(datetime.fromisoformat(iso))


def unfinished_entries(db: Session, user: User, rows: list[DuelMatchProgress]) -> list[DuelMatchHistoryEntry]:
    """Games with no result: no winner and no Bounty change, dated by their last saved turn."""
    if not rows:
        return []
    opponent_ids = {r.seat1_user_id if r.seat0_user_id == user.id else r.seat0_user_id for r in rows}
    opponents = {u.id: u for u in db.scalars(select(User).where(User.id.in_(opponent_ids))).all()}
    now = datetime.now(timezone.utc)
    with_chat = _chat_match_ids(db, user, [r.match_id for r in rows])
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
                replay_ready=r.replay is not None and progress_closed(r, now),
                has_chat=r.match_id in with_chat,
            )
        )
    return entries


def _chat_match_ids(db: Session, user: User, match_ids: list[str]) -> set[str]:
    """Which of these games the player has an answered Log Pose chat about (#970)."""
    scopes = {f"match:{m}": m for m in match_ids}
    answered = select(AnalystMessage.id).where(AnalystMessage.thread_id == AnalystThread.id).exists()
    found = db.scalars(
        select(AnalystThread.scope).where(AnalystThread.user_id == user.id, AnalystThread.scope.in_(list(scopes)), answered)
    ).all()
    return {scopes[s] for s in found}


def history_entries(db: Session, user: User, rows: list[DuelMatch]) -> list[DuelMatchHistoryEntry]:
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
    with_chat = _chat_match_ids(db, user, ids)
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
                replay_ready=r.match_id in with_replay,
                has_chat=r.match_id in with_chat,
            )
        )
    return matches
