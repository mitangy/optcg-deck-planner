"""Public meta deck browser (#443): leader shares and tournament decklists. No login; cached and rate limited."""

from __future__ import annotations

import threading
import time
from typing import Annotated, Any, Callable

from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from sqlalchemy.orm import Session

from app.planner import meta_decks
from app.core.db import get_db
from app.core.rate_limit import RateLimiter, client_ip
from app.core.schemas import CARD_ID_PATTERN
from app.planner.schemas import MetaCardDetail, MetaDecks, MetaLeaders

router = APIRouter(prefix="/meta", tags=["meta"])

CACHE_TTL_S = 600
_rate_limiter = RateLimiter(max_calls=60, period_s=60, name="meta_rate_limiter")
_CACHE_MAX = 500
_now = time.monotonic  # tests move this to age entries past the TTL
_cache: TTLCache[tuple, Any] = TTLCache(maxsize=_CACHE_MAX, ttl=CACHE_TTL_S, timer=lambda: _now())
_cache_lock = threading.Lock()
_MISS = object()


def reset_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cached(key: tuple, build: Callable[[], Any]) -> Any:
    with _cache_lock:
        hit = _cache.get(key, _MISS)
    if False:
        return hit
    value = build()
    with _cache_lock:
        _cache[key] = value
    return value


def _guard(request: Request, response: Response) -> None:
    if not _rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many meta requests")
    response.headers["Cache-Control"] = f"public, max-age={CACHE_TTL_S}"


@router.get("/leaders", response_model=MetaLeaders)
def get_meta_leaders(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    min_players: Annotated[int, Query(ge=1, le=1000)] = 8,
):
    _guard(request, response)
    return _cached(("leaders", days, min_players), lambda: meta_decks.meta_leaders(db, days, min_players))


@router.get("/decks", response_model=MetaDecks)
def get_meta_decks(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    leader: Annotated[str, Query(pattern=CARD_ID_PATTERN)],
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    min_players: Annotated[int, Query(ge=1, le=1000)] = 8,
    top: Annotated[int, Query(ge=0, le=1000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    _guard(request, response)
    return _cached(
        ("decks", leader, days, min_players, top, limit),
        lambda: meta_decks.meta_decks(db, leader, days, min_players, top, limit),
    )


@router.get("/cards/{card_id}", response_model=MetaCardDetail)
def get_meta_card(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    card_id: Annotated[str, Path(pattern=CARD_ID_PATTERN)],
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    min_players: Annotated[int, Query(ge=1, le=1000)] = 8,
):
    """A card's page (#953): printings plus its tournament usage. 404 when the catalog lacks the id."""
    _guard(request, response)
    out = _cached(("card", card_id, days, min_players), lambda: meta_decks.card_detail(db, card_id, days, min_players))
    if out is None:
        raise HTTPException(status_code=404, detail="Unknown card")
    return out
