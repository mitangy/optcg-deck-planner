"""Public meta deck browser (#443): leader shares and tournament decklists. No login; cached and rate limited."""

from __future__ import annotations

import threading
import time
from typing import Annotated, Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app import meta_decks
from app.db import get_db
from app.rate_limit import RateLimiter, client_ip
from app.schemas import CARD_ID_PATTERN

router = APIRouter(prefix="/meta", tags=["meta"])

CACHE_TTL_S = 600
_rate_limiter = RateLimiter(max_calls=60, period_s=60)
_cache: dict[tuple, tuple[float, Any]] = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 500


def reset_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cached(key: tuple, build: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL_S:
            return hit[1]
    value = build()
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            for k in [k for k, (t, _) in _cache.items() if now - t >= CACHE_TTL_S] or [next(iter(_cache))]:
                _cache.pop(k, None)
        _cache[key] = (now, value)
    return value


def _guard(request: Request, response: Response) -> None:
    if not _rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many meta requests")
    response.headers["Cache-Control"] = f"public, max-age={CACHE_TTL_S}"


@router.get("/leaders")
def get_meta_leaders(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    min_players: Annotated[int, Query(ge=1, le=1000)] = 8,
):
    _guard(request, response)
    return _cached(("leaders", days, min_players), lambda: meta_decks.meta_leaders(db, days, min_players))


@router.get("/decks")
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
