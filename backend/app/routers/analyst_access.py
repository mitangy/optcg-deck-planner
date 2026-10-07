"""Asking for the Log Pose chat panel: players request, owners (ANALYST_CHAT_EMAILS) approve or deny (#393)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnalystAccess, User
from app.rate_limit import RateLimiter, client_ip
from app.routers.analyst import is_chat_owner, requests_open
from app.schemas import (
    AnalystAccessDecisionIn,
    AnalystAccessList,
    AnalystAccessRequested,
    AnalystAccessRequestIn,
    AnalystAccessRow,
)
from app.usernames import duel_display_name

router = APIRouter(prefix="/analyst/access", tags=["analyst"])

# A denied player may ask again after this long.
REREQUEST_AFTER = timedelta(hours=24)
MAX_LISTED = 200

_request_rate = RateLimiter(max_calls=5, period_s=3600)
# Rows are stored until an owner answers and the per-IP key can be spoofed, so cap the total too.
_request_global_rate = RateLimiter(max_calls=100, period_s=3600)

_ORDER = {"pending": 0, "approved": 1, "denied": 2}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _owner_only(settings: Settings, user: User) -> None:
    if not is_chat_owner(settings, user):
        raise HTTPException(status_code=403, detail="Only Log Pose owners can answer requests")


def _row_out(row: AnalystAccess, user: User | None) -> AnalystAccessRow:
    return AnalystAccessRow(
        user_id=row.user_id,
        name=duel_display_name(user) if user is not None else "Unknown player",
        note=row.note,
        status=row.status,  # type: ignore[arg-type]
        created_at=row.created_at.isoformat() if row.created_at else None,
        decided_at=row.decided_at.isoformat() if row.decided_at else None,
    )


@router.post("/request", response_model=AnalystAccessRequested, status_code=201)
def request_access(
    body: AnalystAccessRequestIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystAccessRequested:
    if not _request_rate.allow(f"analyst-access:{client_ip(request)}") or not _request_global_rate.allow("analyst-access"):
        raise HTTPException(status_code=429, detail="Too many requests; try again later")
    if not requests_open(settings):
        raise HTTPException(status_code=403, detail="Log Pose isn't taking access requests right now")
    row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user.id))
    if is_chat_owner(settings, user) or (row is not None and row.status == "approved"):
        raise HTTPException(status_code=409, detail="You already have Log Pose")
    now = datetime.now(timezone.utc)
    if row is None:
        db.add(AnalystAccess(user_id=user.id, status="pending", note=body.note))
    elif row.status == "pending":
        raise HTTPException(status_code=409, detail="Your request is already waiting")
    else:
        if row.decided_at is not None and now - _aware(row.decided_at) < REREQUEST_AFTER:
            raise HTTPException(status_code=429, detail="Your last request was answered less than a day ago; you can ask again tomorrow")
        row.status = "pending"
        row.note = body.note
        row.decided_at = None
        row.created_at = now
    db.commit()
    return AnalystAccessRequested(access="pending")


@router.get("/requests", response_model=AnalystAccessList)
def list_requests(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystAccessList:
    """Every request, pending first, then approved, then denied; newest first within each."""
    _owner_only(settings, user)
    rows = list(db.scalars(select(AnalystAccess).order_by(AnalystAccess.created_at.desc(), AnalystAccess.id.desc())).all())
    rows.sort(key=lambda r: _ORDER.get(r.status, 3))  # stable: newest stays first within a status
    return AnalystAccessList(requests=[_row_out(r, db.get(User, r.user_id)) for r in rows[:MAX_LISTED]])


@router.post("/requests/{user_id}", response_model=AnalystAccessRow)
def decide_request(
    user_id: int,
    body: AnalystAccessDecisionIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystAccessRow:
    _owner_only(settings, user)
    row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user_id))
    if row is None:
        raise HTTPException(status_code=404, detail="No request from that player")
    row.status = body.status
    row.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _row_out(row, db.get(User, row.user_id))
