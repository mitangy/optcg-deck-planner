"""Duel token mint, match ingest, and ratings (Step 4)."""

from __future__ import annotations

import hmac
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.duel_ratings import INITIAL_RATING, apply_elo
from app.game_tokens import mint_game_token
from app.models import DuelMatch, DuelRating, User
from app.rate_limit import RateLimiter, client_ip
from app.schemas import (
    DuelDevTokenIn,
    DuelLeaderboardOut,
    DuelMatchIngest,
    DuelMatchOut,
    DuelRatingOut,
    DuelTokenOut,
)

router = APIRouter(prefix="/duel", tags=["duel"])

_token_rate = RateLimiter(max_calls=30, period_s=60)
_ingest_rate = RateLimiter(max_calls=120, period_s=60)

_USER_KEY_RE = re.compile(r"^[a-zA-Z0-9_.:-]{1,64}$")


def _get_or_create_rating(db: Session, user_id: int) -> DuelRating:
    row = db.get(DuelRating, user_id)
    if row is None:
        row = DuelRating(user_id=user_id, rating=INITIAL_RATING, games_played=0)
        db.add(row)
        db.flush()
    return row


def _token_out(db: Session, user: User, settings: Settings) -> DuelTokenOut:
    minted = mint_game_token(user_id=user.id, email=user.email, settings=settings)
    rating = _get_or_create_rating(db, user.id)
    db.commit()
    return DuelTokenOut(
        token=minted["token"],
        expires_at=minted["expires_at"],
        user_id=user.id,
        email=user.email,
        rating=rating.rating,
        games_played=rating.games_played,
    )


@router.post("/token", response_model=DuelTokenOut)
def mint_token_for_session(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelTokenOut:
    if not _token_rate.allow(f"duel-token:{client_ip(request)}:{user.id}"):
        raise HTTPException(status_code=429, detail="Too many token requests")
    return _token_out(db, user, settings)


@router.post("/dev-token", response_model=DuelTokenOut)
def mint_dev_token(
    body: DuelDevTokenIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DuelTokenOut:
    """Cookie-free token mint for Expo / local browsers when ENABLE_DEV_LOGIN."""
    if not settings.enable_dev_login:
        raise HTTPException(status_code=404, detail="Not found")
    if not _USER_KEY_RE.match(body.user_key):
        raise HTTPException(status_code=400, detail="Invalid user_key")
    if not _token_rate.allow(f"duel-dev-token:{client_ip(request)}:{body.user_key}"):
        raise HTTPException(status_code=429, detail="Too many token requests")

    email = f"duel-{body.user_key.lower()}@localhost"
    sub = f"duel-dev-{body.user_key.lower()}"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=body.user_key, google_sub=sub)
        db.add(user)
        db.flush()
    return _token_out(db, user, settings)


def _require_ingest_secret(
    settings: Settings,
    x_duel_ingest_token: str | None,
) -> None:
    expected = settings.duel_ingest_secret or ""
    provided = x_duel_ingest_token or ""
    if not expected or not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/matches", response_model=DuelMatchOut)
def ingest_match(
    body: DuelMatchIngest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_duel_ingest_token: Annotated[str | None, Header()] = None,
) -> DuelMatchOut:
    _require_ingest_secret(settings, x_duel_ingest_token)
    if not _ingest_rate.allow(f"duel-ingest:{client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many ingest requests")
    if body.seat0_user_id == body.seat1_user_id:
        raise HTTPException(status_code=400, detail="Seats must be different users")

    existing = db.scalar(select(DuelMatch).where(DuelMatch.match_id == body.match_id))
    if existing is not None:
        return DuelMatchOut(
            match_id=existing.match_id,
            created=False,
            winner_seat=existing.winner_seat,
            seat0_rating_before=existing.seat0_rating_before,
            seat1_rating_before=existing.seat1_rating_before,
            seat0_rating_after=existing.seat0_rating_after,
            seat1_rating_after=existing.seat1_rating_after,
        )

    for uid in (body.seat0_user_id, body.seat1_user_id):
        if db.get(User, uid) is None:
            raise HTTPException(status_code=400, detail=f"Unknown user_id {uid}")

    r0 = _get_or_create_rating(db, body.seat0_user_id)
    r1 = _get_or_create_rating(db, body.seat1_user_id)
    before0, before1 = r0.rating, r1.rating
    after0, after1 = before0, before1

    if body.ranked:
        score0 = 1.0 if body.winner_seat == 0 else 0.0
        after0, after1 = apply_elo(
            before0,
            before1,
            score_a=score0,
            games_a=r0.games_played,
            games_b=r1.games_played,
        )
        r0.rating = after0
        r1.rating = after1
        r0.games_played += 1
        r1.games_played += 1

    row = DuelMatch(
        match_id=body.match_id,
        seat0_user_id=body.seat0_user_id,
        seat1_user_id=body.seat1_user_id,
        winner_seat=body.winner_seat,
        reason=body.reason,
        ranked=body.ranked,
        seat0_rating_before=before0,
        seat1_rating_before=before1,
        seat0_rating_after=after0,
        seat1_rating_after=after1,
    )
    db.add(row)
    db.commit()
    return DuelMatchOut(
        match_id=row.match_id,
        created=True,
        winner_seat=row.winner_seat,
        seat0_rating_before=before0,
        seat1_rating_before=before1,
        seat0_rating_after=after0,
        seat1_rating_after=after1,
    )


@router.get("/rating/me", response_model=DuelRatingOut)
def my_rating(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DuelRatingOut:
    rating = _get_or_create_rating(db, user.id)
    db.commit()
    return DuelRatingOut(
        user_id=user.id,
        email=user.email,
        name=user.name,
        rating=rating.rating,
        games_played=rating.games_played,
    )


@router.get("/leaderboard", response_model=DuelLeaderboardOut)
def leaderboard(
    db: Annotated[Session, Depends(get_db)],
    limit: int = 20,
) -> DuelLeaderboardOut:
    limit = max(1, min(limit, 100))
    rows = db.execute(
        select(DuelRating, User)
        .join(User, User.id == DuelRating.user_id)
        .order_by(DuelRating.rating.desc(), DuelRating.games_played.desc())
        .limit(limit)
    ).all()
    entries = [
        DuelRatingOut(
            user_id=user.id,
            email=user.email,
            name=user.name,
            rating=rating.rating,
            games_played=rating.games_played,
        )
        for rating, user in rows
    ]
    return DuelLeaderboardOut(entries=entries)
