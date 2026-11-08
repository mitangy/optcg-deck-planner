"""Player feedback: "Report a problem" (duel-web) and "Send feedback" (planner)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_optional_user
from app.core.config import Settings, get_settings
from app.core.security import OpsToken
from app.core.db import get_db
from app.admin.models import Feedback
from app.core.models import User
from app.core.rate_limit import RateLimiter, client_ip
from app.reporter import identify_reporter
from app.admin.schemas import FeedbackIn, FeedbackOut, FeedbackStatusIn
from app.usernames import duel_display_name

router = APIRouter(prefix="/feedback", tags=["feedback"])

_feedback_rate = RateLimiter(max_calls=10, period_s=600, name="feedback_feedback_rate")
# Feedback is stored forever and the per-IP key can be spoofed (X-Forwarded-For),
# so cap the total too.
_feedback_global_rate = RateLimiter(max_calls=60, period_s=3600, name="feedback_feedback_global_rate")


def _reporter(row: Feedback, user: User | None) -> str:
    if user is not None:
        return duel_display_name(user)
    # Filed by the Discord bot: no account, but the post has an author (#979).
    return f"Discord · {row.discord_author}" if row.discord_author else "anonymous"


def _out(row: Feedback, user: User | None) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        kind=row.kind,
        message=row.message,
        app=row.app,
        page=row.page,
        client_build=row.client_build,
        viewport=row.viewport,
        user_agent=row.user_agent,
        room_id=row.room_id,
        user_id=row.user_id,
        reporter=_reporter(row, user),
        status=row.status,
        created_at=row.created_at.isoformat() if row.created_at else "",
        github_issue=row.github_issue,
    )


@router.post("", response_model=FeedbackOut, status_code=201)
def create_feedback(
    body: FeedbackIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_user: Annotated[User | None, Depends(get_optional_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> FeedbackOut:
    """Record a player's feedback (signed in via cookie or game token, or anonymous)."""
    if not _feedback_rate.allow(f"feedback:{client_ip(request)}") or not _feedback_global_rate.allow("feedback"):
        raise HTTPException(status_code=429, detail="Too much feedback; try again later")
    user = identify_reporter(db, settings, session_user, authorization)
    row = Feedback(
        kind=body.kind,
        message=body.message,
        app=body.app,
        page=body.page,
        client_build=body.client_build,
        viewport=body.viewport,
        user_agent=body.user_agent,
        room_id=body.room_id,
        user_id=user.id if user is not None else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _out(row, user)


@router.get("", response_model=list[FeedbackOut], dependencies=[OpsToken])
def list_feedback(
    db: Annotated[Session, Depends(get_db)],
    status: str | None = "open",
    limit: int = 200,
) -> list[FeedbackOut]:
    """Feedback for triage, newest first (guarded by the ops admin token).

    Pass ``status=all`` to include fixed and won't-fix items.
    """
    query = select(Feedback, User).outerjoin(User, User.id == Feedback.user_id)
    if status and status != "all":
        query = query.where(Feedback.status == status)
    rows = db.execute(query.order_by(Feedback.id.desc()).limit(max(1, min(limit, 1000)))).all()
    return [_out(row, user) for row, user in rows]


@router.patch("/{feedback_id}", response_model=FeedbackOut, dependencies=[OpsToken])
def update_feedback(
    feedback_id: int,
    body: FeedbackStatusIn,
    db: Annotated[Session, Depends(get_db)],
) -> FeedbackOut:
    """Mark feedback open, fixed or won't-fix (ops admin token)."""
    row = db.get(Feedback, feedback_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback not found")
    row.status = body.status
    db.commit()
    db.refresh(row)
    user = db.get(User, row.user_id) if row.user_id is not None else None
    return _out(row, user)
