"""Log Pose analyst: personal connector tokens and the reads the analyst service makes for a player."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.analyst.stats import matchup_stats
from app.analyst.tournament_stats import tournament_stats
from app.analyst.tournament_sync import sync_status
from app.analyst import access
from app.analyst.auth import analyst_user, hash_token
from app.core.security import require_service
from app.core.auth import get_current_user
from app.duel.sim_games import MAX_IMPORT_GAMES, clear_games, import_games
from app.core.config import Settings, get_settings
from app.core.statuses import LessonStatus
from app.core.db import get_db
from app.models import AnalystLesson, AnalystPrefs, AnalystToken, Deck, DuelMatch, DuelMatchLog, SimGame, User
from app.duel.matches import match_history
from app.schemas import (
    CARD_ID_PATTERN,
    AnalystDeckOut,
    AnalystDecksOut,
    AnalystLessonIn,
    AnalystLessonOut,
    AnalystLessonReview,
    AnalystLessonsOut,
    AnalystReplayOut,
    AnalystSharing,
    AnalystTokenCreated,
    AnalystTokenStatus,
    DuelMatchHistoryOut,
    SimGameDetailOut,
    SimGameOut,
    SimGamesClearedOut,
    SimGamesImportIn,
    SimGamesImportOut,
    SimGamesOut,
    SimMatchupOut,
    SimMatchupsOut,
)
from app.usernames import duel_display_name

router = APIRouter(prefix="/analyst", tags=["analyst"])


def _connector_url(settings: Settings, token: str) -> str | None:
    base = settings.analyst_public_url.rstrip("/")
    return f"{base}/mcp/u/{token}" if base else None


@router.get("/token", response_model=AnalystTokenStatus)
def token_status(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystTokenStatus:
    row = db.get(AnalystToken, user.id)
    return AnalystTokenStatus(
        has_token=row is not None,
        created_at=row.created_at.isoformat() if row and row.created_at else None,
    )


@router.post("/token", response_model=AnalystTokenCreated)
def create_token(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystTokenCreated:
    """Make a new personal connector link. Any earlier link stops working."""
    token = secrets.token_urlsafe(24)
    db.execute(delete(AnalystToken).where(AnalystToken.user_id == user.id))
    db.add(AnalystToken(user_id=user.id, token_hash=hash_token(token)))
    db.commit()
    return AnalystTokenCreated(token=token, connector_url=_connector_url(settings, token))


@router.delete("/token", status_code=204)
def revoke_token(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    db.execute(delete(AnalystToken).where(AnalystToken.user_id == user.id))
    db.commit()
    return Response(status_code=204)


@router.get("/me", response_model=AnalystTokenStatus)
def whoami(user: Annotated[User, Depends(analyst_user)]) -> AnalystTokenStatus:
    """Lets the analyst check a personal link before serving it."""
    return AnalystTokenStatus(has_token=True, created_at=None, name=duel_display_name(user))


@router.get("/matches", response_model=DuelMatchHistoryOut)
def analyst_matches(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
    limit: int = 20,
) -> DuelMatchHistoryOut:
    return DuelMatchHistoryOut(matches=match_history(db, user, limit))


@router.get("/matches/{match_id}/replay", response_model=AnalystReplayOut)
def analyst_replay(
    match_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_service: Annotated[str | None, Header()] = None,
) -> AnalystReplayOut:
    """The full replay of one of the player's games. Only the analyst service may read it:
    it holds the opponent's hand and deck, and the analyst narrates it from the player's seat."""
    require_service(settings, x_analyst_service)
    match = db.scalar(select(DuelMatch).where(DuelMatch.match_id == match_id))
    if match is None or user.id not in (match.seat0_user_id, match.seat1_user_id):
        raise HTTPException(status_code=404, detail="Match not found")
    log = db.get(DuelMatchLog, match_id)
    if log is None:
        raise HTTPException(status_code=404, detail="No replay was kept for this match")
    seat = 0 if match.seat0_user_id == user.id else 1
    return AnalystReplayOut(match_id=match_id, your_seat=seat, replay=json.loads(log.replay))


@router.get("/decks", response_model=AnalystDecksOut)
def analyst_decks(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystDecksOut:
    """The player's deck planner decks."""
    decks = db.scalars(select(Deck).where(Deck.user_id == user.id).order_by(Deck.sort_order, Deck.id)).all()
    return AnalystDecksOut(
        decks=[
            AnalystDeckOut(
                id=d.id,
                name=d.name,
                leader_id=d.leader_card_id,
                cards=[{"id": c.card_id, "copies": c.needed} for c in d.cards if c.needed > 0],
            )
            for d in decks
        ]
    )


@router.get("/stats/matchups")
def analyst_matchup_stats(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    days: Annotated[int, Query(ge=1, le=3650)] = 90,
    ranked_only: bool = False,
    x_analyst_service: Annotated[str | None, Header()] = None,
) -> dict:
    """Leader and matchup win rates from recorded duels (aggregates only), for the analyst service."""
    require_service(settings, x_analyst_service)
    if opponent and not leader:
        raise HTTPException(status_code=400, detail="Give a leader with the opponent")
    return matchup_stats(db, leader, opponent, days, ranked_only)


@router.get("/tournaments/stats")
def analyst_tournament_stats(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    min_players: Annotated[int, Query(ge=1, le=1000)] = 8,
    x_analyst_service: Annotated[str | None, Header()] = None,
) -> dict:
    """Leader and matchup results from Limitless TCG tournaments (no player names), for the analyst service."""
    require_service(settings, x_analyst_service)
    if opponent and not leader:
        raise HTTPException(status_code=400, detail="Give a leader with the opponent")
    return tournament_stats(db, leader, opponent, days, min_players)


@router.get("/tournaments/sync-status")
def analyst_tournament_sync_status(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_service: Annotated[str | None, Header()] = None,
) -> dict:
    """What the Limitless sync has stored, and how its last run went."""
    require_service(settings, x_analyst_service)
    return sync_status(db)


@router.get("/sharing", response_model=AnalystSharing)
def get_sharing(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystSharing:
    row = db.get(AnalystPrefs, user.id)
    return AnalystSharing(share_matches=row.share_matches if row else True)


@router.put("/sharing", response_model=AnalystSharing)
def put_sharing(
    body: AnalystSharing,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystSharing:
    """Whether this player's games count toward Log Pose stats. Turning it off removes them from every aggregate."""
    row = db.get(AnalystPrefs, user.id)
    if row is None:
        db.add(AnalystPrefs(user_id=user.id, share_matches=body.share_matches))
    else:
        row.share_matches = body.share_matches
    db.commit()
    return body


def _match_ids(evidence: str | None) -> list[str]:
    """Player lessons keep a JSON list of match ids; bot lessons keep a JSON object with a summary instead."""
    try:
        value = json.loads(evidence or "[]")
    except ValueError:
        return []
    return [m for m in value if isinstance(m, str)] if isinstance(value, list) else []


def _lesson_out(row: AnalystLesson) -> AnalystLessonOut:
    return AnalystLessonOut(
        id=row.id,
        status=row.status,
        text=row.text,
        leader_id=row.leader_id,
        opponent_id=row.opponent_id,
        cards=[c for c in row.cards.split(",") if c],
        match_ids=_match_ids(row.evidence),
        source=row.source or "player",
        created_at=row.created_at.isoformat() if row.created_at else None,
        reviewed_at=row.reviewed_at.isoformat() if row.reviewed_at else None,
    )


def _lessons(db: Session, user: User, status: str, leader: str | None, player_only: bool = False) -> list[AnalystLessonOut]:
    q = select(AnalystLesson).where(AnalystLesson.user_id == user.id)
    if player_only:  # bot lessons are owned by the admin but are not their own (#916)
        q = q.where(AnalystLesson.source == "player")
    if status != "all":
        q = q.where(AnalystLesson.status == status)
    if leader:
        q = q.where(or_(AnalystLesson.leader_id == leader, AnalystLesson.opponent_id == leader))
    rows = db.scalars(q.order_by(AnalystLesson.created_at.desc(), AnalystLesson.id.desc()).limit(200)).all()
    return [_lesson_out(r) for r in rows]


@router.post("/lessons", response_model=AnalystLessonOut, status_code=201)
def draft_lesson(
    body: AnalystLessonIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystLessonOut:
    """Claude saves a lesson as a draft for the link owner to review. Evidence must be the owner's own games."""
    waiting = db.scalar(
        select(func.count()).select_from(AnalystLesson).where(AnalystLesson.user_id == user.id, AnalystLesson.status == LessonStatus.DRAFT)
    )
    if waiting >= access.MAX_DRAFT_LESSONS:
        raise HTTPException(status_code=409, detail="Too many lessons are waiting for review")
    match_ids = list(dict.fromkeys(body.match_ids))
    if match_ids:
        own = set(
            db.scalars(
                select(DuelMatch.match_id).where(
                    DuelMatch.match_id.in_(match_ids),
                    or_(DuelMatch.seat0_user_id == user.id, DuelMatch.seat1_user_id == user.id),
                )
            ).all()
        )
        unknown = [m for m in match_ids if m not in own]
        if unknown:
            raise HTTPException(status_code=400, detail=f"Not your matches: {', '.join(unknown)}")
    row = AnalystLesson(
        user_id=user.id,
        status=LessonStatus.DRAFT,
        text=body.text.strip(),
        leader_id=body.leader_id,
        opponent_id=body.opponent_id,
        cards=",".join(dict.fromkeys(body.cards)),
        evidence=json.dumps(match_ids),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _lesson_out(row)


@router.get("/lessons", response_model=AnalystLessonsOut)
def analyst_lessons(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
    status: Literal["draft", "approved", "rejected", "all"] = "approved",
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
) -> AnalystLessonsOut:
    """The link owner's lessons for Claude; approved ones unless asked otherwise. Bot lessons reach Claude through the sim stats instead."""
    return AnalystLessonsOut(lessons=_lessons(db, user, status, leader, player_only=True))


@router.get("/lessons/review", response_model=AnalystLessonsOut)
def review_lessons(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status: Literal["draft", "approved", "rejected", "all"] = "all",
) -> AnalystLessonsOut:
    """The signed-in player's lessons, for the review list in duel-web Settings."""
    return AnalystLessonsOut(lessons=_lessons(db, user, status, None))


def _own_lesson(db: Session, user: User, lesson_id: int) -> AnalystLesson:
    row = db.get(AnalystLesson, lesson_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return row


@router.patch("/lessons/review/{lesson_id}", response_model=AnalystLessonOut)
def review_lesson(
    lesson_id: int,
    body: AnalystLessonReview,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystLessonOut:
    """Approve, reject or edit one of the player's own lessons."""
    row = _own_lesson(db, user, lesson_id)
    if body.text is not None:
        row.text = body.text.strip()
    if body.status is not None and body.status != row.status:
        row.status = body.status
        row.reviewed_at = None if body.status == LessonStatus.DRAFT else datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _lesson_out(row)


@router.delete("/lessons/review/{lesson_id}", status_code=204)
def delete_lesson(
    lesson_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    db.delete(_own_lesson(db, user, lesson_id))
    db.commit()
    return Response(status_code=204)


# --- Imported OPTCGSim games (#1030) -------------------------------------------------------------
# Every query filters on user_id: a player only ever reads or deletes their own rows.


def sim_games_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_token: Annotated[str | None, Header()] = None,
) -> User:
    """The Log Pose link owner (X-Analyst-Token) for the analyst, or the signed-in player for duel-web."""
    if x_analyst_token:
        return analyst_user(db, settings, x_analyst_token)
    return get_current_user(request, db, settings)


def _sim_out(row: SimGame) -> dict:
    return {
        "id": row.id,
        "played_at": row.played_at.isoformat() if row.played_at else None,
        "my_leader": row.my_leader,
        "opp_leader": row.opp_leader,
        "my_deck": row.my_deck,
        "opp_deck": row.opp_deck,
        "result": row.result,
        "turns": row.turns,
        "went_first": row.went_first,
        "has_log": row.has_log,
        "source": row.source,
    }


@router.post("/sim-games/import", response_model=SimGamesImportOut)
def import_sim_games(
    body: SimGamesImportIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
) -> SimGamesImportOut:
    """Store the player's OPTCGSim games. Names are dropped; games already imported are skipped."""
    if len(body.games) > MAX_IMPORT_GAMES:
        raise HTTPException(status_code=413, detail=f"At most {MAX_IMPORT_GAMES} games per import")
    return SimGamesImportOut(**import_games(db, user.id, body.games))


@router.get("/sim-games", response_model=SimGamesOut)
def list_sim_games(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> SimGamesOut:
    """The player's imported games, newest first, without the combat logs."""
    rows = db.scalars(
        select(SimGame)
        .where(SimGame.user_id == user.id)
        .order_by(SimGame.played_at.desc(), SimGame.created_at.desc(), SimGame.id)
        .limit(limit)
    ).all()
    total = db.scalar(select(func.count()).select_from(SimGame).where(SimGame.user_id == user.id)) or 0
    return SimGamesOut(games=[SimGameOut(**_sim_out(r)) for r in rows], total=total)


@router.get("/sim-games/matchups", response_model=SimMatchupsOut)
def sim_game_matchups(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
) -> SimMatchupsOut:
    won = func.sum(case((SimGame.result == "Won", 1), else_=0))
    rows = db.execute(
        select(SimGame.my_leader, SimGame.opp_leader, func.count(), won)
        .where(SimGame.user_id == user.id)
        .group_by(SimGame.my_leader, SimGame.opp_leader)
        .order_by(func.count().desc(), SimGame.my_leader, SimGame.opp_leader)
    ).all()
    return SimMatchupsOut(
        matchups=[
            SimMatchupOut(my_leader=m, opp_leader=o, games=n, wins=int(w or 0), losses=n - int(w or 0)) for m, o, n, w in rows
        ]
    )


@router.get("/sim-games/{game_id}", response_model=SimGameDetailOut)
def get_sim_game(
    game_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
) -> SimGameDetailOut:
    """One imported game with its combat log. Someone else's game is a 404, same as a missing one."""
    row = db.scalar(select(SimGame).where(SimGame.id == game_id, SimGame.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return SimGameDetailOut(**_sim_out(row), combat_log=row.combat_log)


@router.delete("/sim-games/{game_id}", status_code=204)
def delete_sim_game(
    game_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
) -> Response:
    row = db.scalar(select(SimGame).where(SimGame.id == game_id, SimGame.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail="Game not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.delete("/sim-games", response_model=SimGamesClearedOut)
def clear_sim_games(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(sim_games_user)],
) -> SimGamesClearedOut:
    """Remove every game the player imported."""
    return SimGamesClearedOut(deleted=clear_games(db, user.id))
