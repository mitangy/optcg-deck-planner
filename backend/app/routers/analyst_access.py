"""Asking for the Log Pose chat panel: players request, owners (ANALYST_CHAT_EMAILS) approve or deny (#393)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.statuses import AccessStatus
from app.core.time import as_utc
from app.analyst.credit import TOPUP_USD, credit_for, month_key, month_start, spent_since
from app.analyst.access import FREE_SPOTS_KEY, free_spots, is_chat_owner, requests_open, spots_used
from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.analyst.models import AnalystAccess, AnalystSetting
from app.core.models import User
from app.core.rate_limit import RateLimiter, client_ip
from app.analyst.schemas import (
    AnalystAccessDecisionIn,
    AnalystAccessList,
    AnalystAccessRequestIn,
    AnalystAccessRequested,
    AnalystAccessRow,
    AnalystFreeSpots,
    AnalystFreeSpotsIn,
    AnalystTopupDecisionIn,
)
from app.usernames import duel_display_name

router = APIRouter(prefix="/analyst/access", tags=["analyst"])

# A denied player may ask again after this long.
REREQUEST_AFTER = timedelta(hours=24)
MAX_LISTED = 200

_request_rate = RateLimiter(max_calls=5, period_s=3600, name="analyst_access_request_rate")
# Rows are stored until an owner answers and the per-IP key can be spoofed, so cap the total too.
_request_global_rate = RateLimiter(max_calls=100, period_s=3600, name="analyst_access_request_global_rate")

_ORDER = {AccessStatus.PENDING: 0, AccessStatus.APPROVED: 1, AccessStatus.DENIED: 2}


def _owner_only(settings: Settings, user: User) -> None:
    if not is_chat_owner(settings, user):
        raise HTTPException(status_code=403, detail="Only Log Pose owners can answer requests")


# A row that only exists to be locked while free spots are counted and handed out.
SPOTS_LOCK_KEY = "spots_lock"


def _lock_spots(db: Session) -> None:
    """Hold the spots lock until commit, so two players can't both take the last spot (a no-op on SQLite)."""
    q = select(AnalystSetting).where(AnalystSetting.key == SPOTS_LOCK_KEY).with_for_update()
    if db.scalar(q) is not None:
        return
    try:
        db.add(AnalystSetting(key=SPOTS_LOCK_KEY, value=""))
        db.flush()
    except IntegrityError:
        db.rollback()
        db.scalar(q)


def _row_out(row: AnalystAccess, user: User | None, settings: Settings | None = None, db: Session | None = None) -> AnalystAccessRow:
    credit = spent = None
    if settings is not None and db is not None and user is not None:
        now = datetime.now(timezone.utc)
        credit = credit_for(settings, user, row, now)
        spent = spent_since(db, month_start(now), user.id)
    return AnalystAccessRow(
        auto_approved=bool(row.auto_approved),
        credit_usd=credit,
        credit_spent_usd=round(spent or 0.0, 4),
        topup_requested_at=row.topup_requested_at.isoformat() if row.topup_requested_at else None,
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
    if is_chat_owner(settings, user) or (row is not None and row.status == AccessStatus.APPROVED):
        raise HTTPException(status_code=409, detail="You already have Log Pose")
    now = datetime.now(timezone.utc)
    if row is None:
        # Only a first request can take a free spot; a player an owner already answered waits for an owner.
        _lock_spots(db)
        row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user.id))
        if row is not None:
            raise HTTPException(status_code=409, detail="Your request is already waiting")
        free = spots_used(db) < free_spots(db, settings)
        db.add(
            AnalystAccess(
                user_id=user.id,
                status=AccessStatus.APPROVED if free else AccessStatus.PENDING,
                note=body.note,
                auto_approved=free,
                decided_at=now if free else None,
            )
        )
        db.commit()
        return AnalystAccessRequested(access=AccessStatus.APPROVED if free else AccessStatus.PENDING)
    elif row.status == AccessStatus.PENDING:
        raise HTTPException(status_code=409, detail="Your request is already waiting")
    else:
        if row.decided_at is not None and now - as_utc(row.decided_at) < REREQUEST_AFTER:
            raise HTTPException(status_code=429, detail="Your last request was answered less than a day ago; you can ask again tomorrow")
        row.status = AccessStatus.PENDING
        row.note = body.note
        row.decided_at = None
        row.created_at = now
    db.commit()
    return AnalystAccessRequested(access=AccessStatus.PENDING)


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
    return AnalystAccessList(
        requests=[_row_out(r, db.get(User, r.user_id), settings, db) for r in rows[:MAX_LISTED]],
        free_spots=free_spots(db, settings),
        spots_used=spots_used(db),
    )


@router.put("/free-spots", response_model=AnalystFreeSpots)
def put_free_spots(
    body: AnalystFreeSpotsIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystFreeSpots:
    """Owners change how many players are approved at once; spots already taken stay taken."""
    _owner_only(settings, user)
    row = db.get(AnalystSetting, FREE_SPOTS_KEY)
    if row is None:
        db.add(AnalystSetting(key=FREE_SPOTS_KEY, value=str(body.free_spots)))
    else:
        row.value = str(body.free_spots)
    db.commit()
    return AnalystFreeSpots(free_spots=body.free_spots, spots_used=spots_used(db))


@router.post("/topup", status_code=204)
def request_topup(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """A player out of credit asks owners for more. Asking again while it waits changes nothing."""
    row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user.id))
    if row is None or row.status != AccessStatus.APPROVED or is_chat_owner(settings, user):
        raise HTTPException(status_code=403, detail="Only players with Log Pose credit can ask for more")
    now = datetime.now(timezone.utc)
    credit = credit_for(settings, user, row, now)
    if credit is not None and spent_since(db, month_start(now), user.id) < credit:
        raise HTTPException(status_code=409, detail="You still have credit left this month")
    if row.topup_requested_at is None:
        row.topup_requested_at = now
        db.commit()


@router.post("/requests/{user_id}/topup", response_model=AnalystAccessRow)
def answer_topup(
    user_id: int,
    body: AnalystTopupDecisionIn,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AnalystAccessRow:
    """Owners grant a waiting top-up (+$5 for this month only) or dismiss it."""
    _owner_only(settings, user)
    row = db.scalar(select(AnalystAccess).where(AnalystAccess.user_id == user_id))
    if row is None or row.topup_requested_at is None:
        raise HTTPException(status_code=404, detail="No top-up request from that player")
    if body.action == "add":
        now = datetime.now(timezone.utc)
        # A top-up from an earlier month is gone; this month's stack.
        row.topup_usd = (row.topup_usd or 0.0) + TOPUP_USD if row.topup_month == month_key(now) else TOPUP_USD
        row.topup_month = month_key(now)
    row.topup_requested_at = None
    db.commit()
    db.refresh(row)
    return _row_out(row, db.get(User, row.user_id), settings, db)


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
    return _row_out(row, db.get(User, row.user_id), settings, db)
