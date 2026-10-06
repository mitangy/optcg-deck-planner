"""Log Pose in the app: chat sessions, threads, spend caps, post-game reviews and the game corpus.

The browser gets a short-lived chat token from /analyst/chat/session and talks to the analyst
service, which reads and writes everything here with that token plus the service secret.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.analyst_corpus import MAX_GAMES, game_replay, search_games
from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnalystMatchReview, AnalystMessage, AnalystThread, AnalystUsage, DuelMatch, User
from app.routers.analyst import analyst_user, chat_enabled_for, mint_chat_token, require_service
from app.schemas import (
    CARD_ID_PATTERN,
    AnalystAppendIn,
    AnalystChatBudget,
    AnalystChatSession,
    AnalystDisplayMessage,
    AnalystReviewIn,
    AnalystReviewOut,
    AnalystStoredMessage,
    AnalystThreadContent,
    AnalystThreadIn,
    AnalystThreadsOut,
    AnalystThreadSummary,
    AnalystThreadView,
    AnalystUsageIn,
)

router = APIRouter(prefix="/analyst", tags=["analyst"])

# The analyst puts page/deck context in a user text block starting with this; the panel hides it.
CONTEXT_PREFIX = "<context>"
MAX_MESSAGE_BYTES = 400_000
MAX_THREAD_MESSAGES = 400


def _service(settings: Annotated[Settings, Depends(get_settings)], x_analyst_service: Annotated[str | None, Header()] = None) -> None:
    require_service(settings, x_analyst_service)


Service = Annotated[None, Depends(_service)]


@router.post("/chat/session", response_model=AnalystChatSession)
def chat_session(
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystChatSession:
    """Whether the Log Pose panel is on for this player, and a fresh token for it when it is."""
    if not chat_enabled_for(settings, user):
        return AnalystChatSession(enabled=False)
    token, exp = mint_chat_token(settings, user, int(datetime.now(timezone.utc).timestamp()))
    expires_at = datetime.fromtimestamp(exp, timezone.utc).isoformat()
    return AnalystChatSession(enabled=True, token=token, expires_at=expires_at, chat_url=settings.analyst_public_url.rstrip("/"))


def _spent(db: Session, since: datetime, user_id: int | None = None) -> float:
    q = select(func.coalesce(func.sum(AnalystUsage.cost_usd), 0.0)).where(AnalystUsage.created_at >= since)
    if user_id is not None:
        q = q.where(AnalystUsage.user_id == user_id)
    return float(db.scalar(q) or 0.0)


@router.get("/chat/budget", response_model=AnalystChatBudget)
def chat_budget(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystChatBudget:
    """This player's spend today and everyone's this month, against the caps."""
    now = datetime.now(timezone.utc)
    today = _spent(db, now.replace(hour=0, minute=0, second=0, microsecond=0), user.id)
    month = _spent(db, now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))
    return AnalystChatBudget(
        spent_today_usd=round(today, 4),
        daily_cap_usd=settings.analyst_chat_daily_usd,
        spent_month_usd=round(month, 4),
        monthly_cap_usd=settings.analyst_chat_monthly_usd,
        allowed=today < settings.analyst_chat_daily_usd and month < settings.analyst_chat_monthly_usd,
    )


@router.post("/chat/usage", status_code=204)
def record_usage(
    body: AnalystUsageIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> None:
    db.add(AnalystUsage(user_id=user.id, **body.model_dump()))
    db.commit()


def _own_thread(db: Session, user: User, thread_id: int) -> AnalystThread:
    row = db.get(AnalystThread, thread_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    return row


@router.post("/chat/threads", response_model=AnalystThreadSummary, status_code=201)
def create_thread(
    body: AnalystThreadIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystThreadSummary:
    row = AnalystThread(user_id=user.id, title=body.title.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    return AnalystThreadSummary(id=row.id, title=row.title, updated_at=row.updated_at.isoformat() if row.updated_at else None)


def _messages(db: Session, thread_id: int) -> list[AnalystMessage]:
    return list(db.scalars(select(AnalystMessage).where(AnalystMessage.thread_id == thread_id).order_by(AnalystMessage.id)).all())


@router.get("/chat/threads/{thread_id}/content", response_model=AnalystThreadContent)
def thread_content(
    thread_id: int,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystThreadContent:
    """The thread exactly as stored, for the analyst to resend to the model."""
    row = _own_thread(db, user, thread_id)
    return AnalystThreadContent(
        id=row.id,
        title=row.title,
        messages=[AnalystStoredMessage(role=m.role, content=json.loads(m.content)) for m in _messages(db, row.id)],
    )


@router.post("/chat/threads/{thread_id}/messages", status_code=204)
def append_messages(
    thread_id: int,
    body: AnalystAppendIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> None:
    """Add messages to the end of a thread. Stored messages are never changed."""
    row = _own_thread(db, user, thread_id)
    have = db.scalar(select(func.count()).select_from(AnalystMessage).where(AnalystMessage.thread_id == row.id)) or 0
    if have + len(body.messages) > MAX_THREAD_MESSAGES:
        raise HTTPException(status_code=409, detail="This thread is full; start a new one")
    for m in body.messages:
        content = json.dumps(m.content)
        if len(content) > MAX_MESSAGE_BYTES:
            raise HTTPException(status_code=413, detail="Message too large")
        db.add(AnalystMessage(thread_id=row.id, role=m.role, content=content))
    row.updated_at = datetime.now(timezone.utc)
    db.commit()


def _display_text(role: str, content: str | list[dict]) -> str:
    """What the panel shows for a stored message: its text, without tool calls, tool results or page context."""
    if isinstance(content, str):
        return "" if content.startswith(CONTEXT_PREFIX) else content
    texts = [
        b.get("text", "")
        for b in content
        if b.get("type") == "text" and not (role == "user" and b.get("text", "").startswith(CONTEXT_PREFIX))
    ]
    return "\n\n".join(t for t in texts if t.strip())


def thread_view(messages: list[tuple[str, str | list[dict]]]) -> list[AnalystDisplayMessage]:
    """Stored messages as chat bubbles: tool-result-only turns drop out and one answer's pieces join up."""
    out: list[AnalystDisplayMessage] = []
    for role, content in messages:
        text = _display_text(role, content)
        if not text:
            continue
        if out and out[-1].role == role == "assistant":
            out[-1].text += "\n\n" + text
        else:
            out.append(AnalystDisplayMessage(role=role, text=text))
    return out


@router.get("/chat/threads", response_model=AnalystThreadsOut)
def list_threads(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystThreadsOut:
    rows = db.scalars(
        select(AnalystThread).where(AnalystThread.user_id == user.id).order_by(AnalystThread.updated_at.desc(), AnalystThread.id.desc()).limit(50)
    ).all()
    return AnalystThreadsOut(
        threads=[AnalystThreadSummary(id=r.id, title=r.title, updated_at=r.updated_at.isoformat() if r.updated_at else None) for r in rows]
    )


@router.get("/chat/threads/{thread_id}", response_model=AnalystThreadView)
def view_thread(
    thread_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystThreadView:
    """One of the signed-in player's threads as the panel shows it."""
    row = _own_thread(db, user, thread_id)
    return AnalystThreadView(
        id=row.id, title=row.title, messages=thread_view([(m.role, json.loads(m.content)) for m in _messages(db, row.id)])
    )


def _review_out(row: AnalystMatchReview) -> AnalystReviewOut:
    return AnalystReviewOut(match_id=row.match_id, text=row.text, created_at=row.created_at.isoformat() if row.created_at else None)


@router.get("/reviews/{match_id}", response_model=AnalystReviewOut)
def get_review(
    match_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> AnalystReviewOut:
    """The saved post-game analysis of one of the signed-in player's games."""
    row = db.get(AnalystMatchReview, (user.id, match_id))
    if row is None:
        raise HTTPException(status_code=404, detail="No analysis yet")
    return _review_out(row)


@router.put("/reviews/{match_id}", response_model=AnalystReviewOut)
def put_review(
    match_id: str,
    body: AnalystReviewIn,
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(analyst_user)],
) -> AnalystReviewOut:
    """The analyst saves a post-game analysis for a finished game the player was in."""
    played = db.scalar(
        select(DuelMatch.id).where(
            DuelMatch.match_id == match_id, or_(DuelMatch.seat0_user_id == user.id, DuelMatch.seat1_user_id == user.id)
        )
    )
    if played is None:
        raise HTTPException(status_code=404, detail="Match not found")
    row = db.get(AnalystMatchReview, (user.id, match_id))
    if row is None:
        row = AnalystMatchReview(user_id=user.id, match_id=match_id, text=body.text)
        db.add(row)
    else:
        row.text = body.text
        row.created_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _review_out(row)


@router.get("/corpus/games")
def corpus_games(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    card: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    result: Literal["won", "lost"] | None = None,
    went_first: bool | None = None,
    ranked_only: bool = False,
    days: Annotated[int, Query(ge=1, le=365)] = 90,
    min_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    max_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_GAMES)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> dict:
    """Search every shared game (anonymized) for the analyst service."""
    if result is not None and not (leader or opponent):
        raise HTTPException(status_code=400, detail="Give a leader or opponent with the result")
    return search_games(
        db, leader=leader, opponent=opponent, card=card, result=result, went_first=went_first,
        ranked_only=ranked_only, days=days, min_turns=min_turns, max_turns=max_turns, limit=limit, offset=offset,
    )


@router.get("/corpus/games/{game_id}/replay")
def corpus_replay(game_id: str, _: Service, db: Annotated[Session, Depends(get_db)]) -> dict:
    out = game_replay(db, game_id)
    if out is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return out
