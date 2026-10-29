"""Player reports (#810): "Report player" in matches, spectating, history and the friends list.

A report names a player (a match seat, or a friend), a reason and optionally the image the
reporter saw. Image reports copy the bytes at report time so the evidence survives the owner
deleting or replacing it. Nothing about the reported player is sent back to the reporter.
Staff review reports under /admin/reports (routers/admin.py).
"""

from __future__ import annotations

import base64
import binascii
import hmac
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_optional_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import DuelCosmetic, DuelMatch, DuelUserSettings, PlayerReport, PlayerWarning, User
from app.rate_limit import RateLimiter, client_ip
from app.reporter import identify_reporter
from app.roles import is_banned
from app.routers.duel import _latest_progress
from app.routers.duel_prefs import _active_attr, _sniff_mime, public_sig
from app.routers.friends import _friendship, live_presence

router = APIRouter(prefix="/duel", tags=["duel"])

DUPLICATE_WINDOW = timedelta(hours=24)

_user_rate = RateLimiter(max_calls=10, period_s=3600, name="player_report_user_rate")
_ip_rate = RateLimiter(max_calls=20, period_s=3600, name="player_report_ip_rate")
_global_rate = RateLimiter(max_calls=200, period_s=3600, name="player_report_global_rate")

# "/duel/cosmetics/{id}/public/{sig}", optionally behind an absolute API base URL.
_PUBLIC_RE = re.compile(r"^(?:https?://[^/\s]+)?/duel/cosmetics/(\d+)/public/([A-Za-z0-9_-]+)(?:[?#].*)?$")
_DATA_URL_RE = re.compile(r"^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", re.DOTALL)


class PlayerReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Literal["conduct", "toxic", "image"]
    source: Literal["match", "spectate", "postmatch", "history", "friends"]
    reported_user_id: int | None = None
    match_id: str | None = Field(default=None, max_length=64)
    reported_seat: Literal[0, 1] | None = None
    image_kind: Literal["playmat", "cardBack"] | None = None
    image_src: str | None = Field(default=None, max_length=800_000)
    note: str | None = Field(default=None, max_length=500)


class PlayerReportOut(BaseModel):
    id: int
    duplicate: bool


class PlayerWarningOut(BaseModel):
    id: int
    message: str
    created_at: str


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _seat_users(db: Session, match_id: str) -> tuple[int, int] | None:
    match = db.scalar(select(DuelMatch).where(DuelMatch.match_id == match_id))
    if match is not None:
        return match.seat0_user_id, match.seat1_user_id
    progress = _latest_progress(db, match_id)
    if progress is not None:
        return progress.seat0_user_id, progress.seat1_user_id
    return None


def _in_room_as_spectator(db: Session, user: User, match_id: str, now: datetime) -> bool:
    for row in live_presence(db, [user.id], now).get(user.id, []):
        # A rematch keeps playing under "{match_id}-rN".
        if row.role == "spectator" and (row.room_id == match_id or row.room_id.startswith(f"{match_id}-r")):
            return True
    return False


def _resolve_reported(db: Session, reporter: User, body: PlayerReportIn, now: datetime) -> User:
    if body.reported_user_id is not None:
        if body.reported_user_id == reporter.id:
            raise HTTPException(status_code=400, detail="You cannot report yourself")
        target = db.get(User, body.reported_user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Player not found")
        friendship = _friendship(db, reporter.id, target.id)
        if friendship is None or friendship.status != "accepted":
            raise HTTPException(status_code=403, detail="You can only report your friends this way")
        return target
    seats = _seat_users(db, body.match_id) if body.match_id and body.reported_seat is not None else None
    # A bot or guest seat holds an id no account has, so it is "not found" like an unknown player.
    target = db.get(User, seats[body.reported_seat]) if seats is not None else None
    if target is None:
        raise HTTPException(status_code=404, detail="Player not found")
    if reporter.id not in seats and not _in_room_as_spectator(db, reporter, body.match_id, now):
        raise HTTPException(status_code=403, detail="You were not in that match")
    if target.id == reporter.id:
        raise HTTPException(status_code=400, detail="You cannot report yourself")
    return target


def _snapshot(db: Session, settings: Settings, target: User, body: PlayerReportIn) -> tuple[int | None, str | None, bytes | None]:
    """(cosmetic id, mime, bytes) of the reported image, copied now so it outlives the owner's copy."""
    src = body.image_src or ""
    m = _PUBLIC_RE.match(src)
    if m:
        cid = int(m.group(1))
        if hmac.compare_digest(public_sig(cid, settings).encode(), m.group(2).encode()):
            row = db.get(DuelCosmetic, cid)
            if row is not None and row.user_id == target.id and row.kind == body.image_kind:
                return row.id, row.mime, bytes(row.data)
    d = _DATA_URL_RE.match(src)
    if d:
        try:
            data = base64.b64decode(d.group(1), validate=False)
        except (binascii.Error, ValueError):
            data = b""
        # image_src is capped at 800,000 characters, so the decoded image is at most 600 KB.
        mime = _sniff_mime(data) if data else None
        if mime:
            return None, mime, data
    prefs = db.get(DuelUserSettings, target.id)
    active_id = getattr(prefs, _active_attr(body.image_kind), None) if prefs else None
    row = db.get(DuelCosmetic, active_id) if active_id else None
    if row is not None and row.user_id == target.id:
        return row.id, row.mime, bytes(row.data)
    return None, None, None


@router.post("/reports", response_model=PlayerReportOut, status_code=201)
def create_player_report(
    body: PlayerReportIn,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    session_user: Annotated[User | None, Depends(get_optional_user)],
    authorization: Annotated[str | None, Header()] = None,
) -> PlayerReportOut:
    reporter = identify_reporter(db, settings, session_user, authorization)
    if reporter is None:
        raise HTTPException(status_code=401, detail="Sign in to report a player")
    if is_banned(reporter):
        raise HTTPException(status_code=403, detail="Account banned")
    if body.reason == "image" and body.image_kind is None:
        raise HTTPException(status_code=422, detail="Choose playmat or card back")
    if body.reported_user_id is None and not (body.match_id and body.reported_seat is not None):
        raise HTTPException(status_code=422, detail="Say which player")
    if not (
        _user_rate.allow(f"user:{reporter.id}")
        and _ip_rate.allow(f"ip:{client_ip(request)}")
        and _global_rate.allow("global")
    ):
        raise HTTPException(status_code=429, detail="Too many reports; try again later")

    now = datetime.now(timezone.utc)
    target = _resolve_reported(db, reporter, body, now)
    match_id = body.match_id or ""
    recent = db.scalars(
        select(PlayerReport)
        .where(
            PlayerReport.reporter_id == reporter.id,
            PlayerReport.reported_id == target.id,
            PlayerReport.match_id == match_id,
            PlayerReport.reason == body.reason,
            PlayerReport.status == "open",
            PlayerReport.created_at >= now - DUPLICATE_WINDOW,
        )
        .order_by(PlayerReport.id.desc())
    ).first()
    if recent is not None:
        response.status_code = 200
        return PlayerReportOut(id=recent.id, duplicate=True)

    cosmetic_id = mime = data = None
    if body.reason == "image":
        cosmetic_id, mime, data = _snapshot(db, settings, target, body)
    row = PlayerReport(
        reporter_id=reporter.id,
        reported_id=target.id,
        reason=body.reason,
        image_kind=body.image_kind if body.reason == "image" else None,
        note=(body.note or "").strip(),
        match_id=match_id,
        source=body.source,
        cosmetic_id=cosmetic_id,
        image_mime=mime,
        image_data=data,
        status="open",
        created_at=now,
    )
    db.add(row)
    db.commit()
    return PlayerReportOut(id=row.id, duplicate=False)


@router.get("/warnings", response_model=list[PlayerWarningOut])
def my_warnings(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[PlayerWarningOut]:
    """Warnings from moderators the player has not acknowledged yet, oldest first."""
    rows = db.scalars(
        select(PlayerWarning)
        .where(PlayerWarning.user_id == user.id, PlayerWarning.acknowledged_at.is_(None))
        .order_by(PlayerWarning.id)
    ).all()
    return [PlayerWarningOut(id=w.id, message=w.message, created_at=_utc(w.created_at).isoformat()) for w in rows]


@router.post("/warnings/{warning_id}/ack", status_code=204)
def ack_warning(
    warning_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    row = db.get(PlayerWarning, warning_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Warning not found")
    if row.acknowledged_at is None:
        row.acknowledged_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=204)
