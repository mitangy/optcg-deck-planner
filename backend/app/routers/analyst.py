"""Log Pose analyst: personal connector tokens and the reads the analyst service makes for a player."""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.models import AnalystToken, Deck, DuelMatch, DuelMatchLog, User
from app.routers.duel import match_history
from app.schemas import (
    AnalystDeckOut,
    AnalystDecksOut,
    AnalystReplayOut,
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


def analyst_user(
    db: Annotated[Session, Depends(get_db)],
    x_analyst_token: Annotated[str | None, Header()] = None,
) -> User:
    """The player whose personal connector token is in X-Analyst-Token."""
    if not x_analyst_token:
        raise HTTPException(status_code=401, detail="Missing analyst token")
    row = db.scalar(select(AnalystToken).where(AnalystToken.token_hash == _hash(x_analyst_token)))
    user = db.get(User, row.user_id) if row else None
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown or revoked analyst token")
    return user


def _require_service(settings: Settings, given: str | None) -> None:
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
    _require_service(settings, x_analyst_service)
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
