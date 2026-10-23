"""Player feedback on Log Pose answers: 👍, 👎 and "This is wrong" on a chat answer or a match review (#679).

The panel posts with the player's session cookie (like deleting a thread). The server looks the answer up itself,
so the stored excerpt is what Log Pose really said and a player can only rate their own threads and reviews.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnalystFeedback, AnalystMatchReview, AnalystMessage, AnalystThread, User
from app.rate_limit import RateLimiter
from app.routers.analyst import chat_enabled_for, chat_model
from app.routers.analyst_chat import thread_view

router = APIRouter(prefix="/analyst/feedback", tags=["analyst"])

NOTE_MAX = 1000
EXCERPT_MAX = 4000
QUESTION_MAX = 1000
MAX_ANSWER_INDEX = 1000

_rate = RateLimiter(max_calls=60, period_s=60, name="analyst_feedback_rate")


class FeedbackIn(BaseModel):
    kind: Literal["chat", "review"]
    rating: Literal["up", "down", "wrong"]
    note: str = Field(default="", max_length=NOTE_MAX)
    # chat: the thread and which of its answers (0 = the first assistant answer shown in the panel)
    thread_id: int | None = Field(default=None, ge=1)
    message_index: int | None = Field(default=None, ge=0, le=MAX_ANSWER_INDEX)
    # The first characters of the answer the panel shows. When given, the stored answer at that index must begin with
    # them, so a panel whose list drifted from the thread (an answer that never saved) can't rate a different answer.
    starts_with: str = Field(default="", max_length=80)
    # review: the game
    match_id: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _target(self) -> "FeedbackIn":
        if self.kind == "chat" and (self.thread_id is None or self.message_index is None or self.match_id is not None):
            raise ValueError("A chat answer needs thread_id and message_index")
        if self.kind == "review" and (not self.match_id or self.thread_id is not None or self.message_index is not None):
            raise ValueError("A review needs match_id")
        return self


class FeedbackVote(BaseModel):
    kind: Literal["chat", "review"]
    rating: Literal["up", "down", "wrong"]
    note: str = ""
    thread_id: int | None = None
    message_index: int | None = None
    match_id: str | None = None


class FeedbackMine(BaseModel):
    votes: list[FeedbackVote]


def _vote(row: AnalystFeedback) -> FeedbackVote:
    return FeedbackVote(
        kind=row.kind, rating=row.rating, note=row.note or "", thread_id=row.thread_id, message_index=row.message_index, match_id=row.match_id
    )


def _enabled(db: Session, settings: Settings, user: User) -> None:
    if not chat_enabled_for(settings, user, db):
        raise HTTPException(status_code=403, detail="Log Pose isn't on for you")


def _squash(text: str) -> str:
    """Whitespace runs as one space, trimmed: how the panel and the thread agree on where an answer starts."""
    return " ".join(text.split())


def _thread_answer(db: Session, user: User, thread_id: int, index: int) -> tuple[str, str]:
    """The answer (and the question it replied to) at `index` among the thread's assistant answers, as the panel shows them."""
    thread = db.get(AnalystThread, thread_id)
    if thread is None or thread.user_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    rows = db.scalars(select(AnalystMessage).where(AnalystMessage.thread_id == thread_id).order_by(AnalystMessage.id)).all()
    shown = thread_view([(m.role, json.loads(m.content)) for m in rows])
    seen = -1
    question = ""
    for m in shown:
        if m.role == "user":
            question = m.text
        elif m.text.strip():
            seen += 1
            if seen == index:
                return m.text, question
    raise HTTPException(status_code=404, detail="Answer not found")


@router.post("", response_model=FeedbackVote)
def put_feedback(
    body: FeedbackIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> FeedbackVote:
    """Rate an answer. A second vote on the same answer replaces the first (rating and note)."""
    _enabled(db, settings, user)
    if not _rate.allow(f"user:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many ratings; try again in a minute")
    if body.kind == "chat":
        assert body.thread_id is not None and body.message_index is not None
        answer, question = _thread_answer(db, user, body.thread_id, body.message_index)
        if body.starts_with.strip() and not _squash(answer).startswith(_squash(body.starts_with)):
            raise HTTPException(status_code=409, detail="That answer is out of date; reload the chat")
        target = f"chat:{body.thread_id}:{body.message_index}"
    else:
        assert body.match_id is not None
        review = db.get(AnalystMatchReview, (user.id, body.match_id))
        if review is None:
            raise HTTPException(status_code=404, detail="No analysis to rate")
        answer, question = review.text, ""
        target = f"review:{body.match_id}"
    now = datetime.now(timezone.utc)
    row = db.scalar(select(AnalystFeedback).where(AnalystFeedback.user_id == user.id, AnalystFeedback.target == target))
    if row is None:
        row = AnalystFeedback(user_id=user.id, kind=body.kind, target=target, thread_id=body.thread_id, message_index=body.message_index, match_id=body.match_id, created_at=now)
        db.add(row)
    row.rating = body.rating
    row.note = body.note.strip()
    row.answer_excerpt = answer[:EXCERPT_MAX]
    row.question_excerpt = question[:QUESTION_MAX]
    row.model = chat_model(db)
    row.updated_at = now
    db.commit()
    db.refresh(row)
    return _vote(row)


@router.get("", response_model=FeedbackMine)
def my_feedback(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    thread_id: Annotated[int | None, Query(ge=1)] = None,
    match_id: Annotated[str | None, Query(min_length=1, max_length=64)] = None,
) -> FeedbackMine:
    """The signed-in player's own ratings on one thread's answers, or on one game's analysis, so the panel shows what they chose."""
    _enabled(db, settings, user)
    if (thread_id is None) == (match_id is None):
        raise HTTPException(status_code=422, detail="Give thread_id or match_id")
    q = select(AnalystFeedback).where(AnalystFeedback.user_id == user.id)
    q = q.where(AnalystFeedback.thread_id == thread_id) if thread_id is not None else q.where(AnalystFeedback.match_id == match_id)
    return FeedbackMine(votes=[_vote(r) for r in db.scalars(q.order_by(AnalystFeedback.id)).all()])
