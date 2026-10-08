"""Log Pose analyst: personal connector tokens and the reads the analyst service makes for a player."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.analyst_stats import matchup_stats
from app.tournament_stats import tournament_stats
from app.tournament_sync import sync_status
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnalystAccess, AnalystLesson, AnalystPrefs, AnalystToken, Deck, DuelMatch, DuelMatchLog, User
from app.routers.duel import match_history
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
)
from app.usernames import duel_display_name

router = APIRouter(prefix="/analyst", tags=["analyst"])


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


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
    db.add(AnalystToken(user_id=user.id, token_hash=_hash(token)))
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


CHAT_TOKEN_SECONDS = 30 * 60


def _chat_sig(settings: Settings, uid: int, exp: int) -> str:
    return hmac.new(settings.analyst_service_secret.encode(), f"chat.{uid}.{exp}".encode(), hashlib.sha256).hexdigest()


def is_chat_owner(settings: Settings, user: User) -> bool:
    """Owners are everyone on ANALYST_CHAT_EMAILS: they always have the chat and answer access requests."""
    return user.email.strip().lower() in settings.analyst_chat_email_set


def _service_configured(settings: Settings) -> bool:
    return bool(settings.analyst_service_secret and settings.analyst_public_url)


def access_status(db: Session, user: User) -> str | None:
    row = db.scalar(select(AnalystAccess.status).where(AnalystAccess.user_id == user.id))
    return row


def chat_enabled_for(settings: Settings, user: User, db: Session) -> bool:
    """The in-app chat panel is on for owners, and for players an owner approved, once the analyst service is configured."""
    if not _service_configured(settings):
        return False
    return is_chat_owner(settings, user) or access_status(db, user) == "approved"


def requests_open(settings: Settings) -> bool:
    """Players can ask for access only when the service is on and someone is there to approve."""
    return _service_configured(settings) and bool(settings.analyst_chat_email_set)


def mint_chat_token(settings: Settings, user: User, now: int) -> tuple[str, int]:
    """A short-lived token the browser hands the analyst's /chat; signed with the service secret."""
    exp = now + CHAT_TOKEN_SECONDS
    return f"chat.{user.id}.{exp}.{_chat_sig(settings, user.id, exp)}", exp


def _chat_token_user(db: Session, settings: Settings, token: str) -> User | None:
    parts = token.split(".")
    if len(parts) != 4 or not settings.analyst_service_secret:
        return None
    _, uid, exp, sig = parts
    if not (uid.isdigit() and exp.isdigit()):
        return None
    if not hmac.compare_digest(sig, _chat_sig(settings, int(uid), int(exp))):
        return None
    if int(exp) < int(datetime.now(timezone.utc).timestamp()):
        return None
    user = db.get(User, int(uid))
    return user if user is not None and chat_enabled_for(settings, user, db) else None


def analyst_user(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_token: Annotated[str | None, Header()] = None,
) -> User:
    """The player whose personal connector token (or in-app chat token) is in X-Analyst-Token."""
    if not x_analyst_token:
        raise HTTPException(status_code=401, detail="Missing analyst token")
    if x_analyst_token.startswith("chat."):
        user = _chat_token_user(db, settings, x_analyst_token)
        if user is None:
            raise HTTPException(status_code=401, detail="Expired or invalid chat token")
        return user
    row = db.scalar(select(AnalystToken).where(AnalystToken.token_hash == _hash(x_analyst_token)))
    user = db.get(User, row.user_id) if row else None
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown or revoked analyst token")
    return user


def require_service(settings: Settings, given: str | None) -> None:
    expected = settings.analyst_service_secret
    if not expected:
        raise HTTPException(status_code=503, detail="Replays are not enabled")
    if not given or not hmac.compare_digest(given, expected):
        raise HTTPException(status_code=403, detail="Analyst service only")


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


MAX_DRAFT_LESSONS = 100


def _lesson_out(row: AnalystLesson) -> AnalystLessonOut:
    return AnalystLessonOut(
        id=row.id,
        status=row.status,
        text=row.text,
        leader_id=row.leader_id,
        opponent_id=row.opponent_id,
        cards=[c for c in row.cards.split(",") if c],
        match_ids=json.loads(row.evidence or "[]"),
        created_at=row.created_at.isoformat() if row.created_at else None,
        reviewed_at=row.reviewed_at.isoformat() if row.reviewed_at else None,
    )


def _lessons(db: Session, user: User, status: str, leader: str | None) -> list[AnalystLessonOut]:
    q = select(AnalystLesson).where(AnalystLesson.user_id == user.id)
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
        select(func.count()).select_from(AnalystLesson).where(AnalystLesson.user_id == user.id, AnalystLesson.status == "draft")
    )
    if waiting >= MAX_DRAFT_LESSONS:
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
        status="draft",
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
    """The link owner's lessons for Claude; approved ones unless asked otherwise."""
    return AnalystLessonsOut(lessons=_lessons(db, user, status, leader))


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
        row.reviewed_at = None if body.status == "draft" else datetime.now(timezone.utc)
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
