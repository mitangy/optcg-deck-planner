"""Bot self-play corpus for Log Pose (#635): batch ingest and the reads the analyst service makes.

Every route needs the service secret. Bot games never enter duel_matches or any real-player stat.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.analyst.bots import (
    MAX_BATCH_GAMES,
    MAX_GAMES,
    BotLessonError,
    bot_game_replay,
    clean_levels,
    ingest_batch,
    save_bot_lesson,
    search_bot_games,
    shared_bot_lessons,
    sim_stats,
)
from app.analyst.corpus import HUMAN_BOT_MAX_LIMIT, human_bot_games
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.security import require_service
from app.analyst.schemas import (
    BotBatchOut,
    BotGameSearchOut,
    BotLessonIn,
    BotLessonSavedOut,
    BotReplayOut,
    BotSimStatsOut,
    HumanBotGamesOut,
)
from app.core.schemas import CARD_ID_PATTERN

router = APIRouter(prefix="/analyst", tags=["analyst"])


def _service(settings: Annotated[Settings, Depends(get_settings)], x_analyst_service: Annotated[str | None, Header()] = None) -> None:
    require_service(settings, x_analyst_service)


Service = Annotated[None, Depends(_service)]
LEVELS_PATTERN = r"^[a-z]{3,12}/[a-z]{3,12}$"


class BotGameIn(BaseModel):
    index: int = Field(ge=0, le=1_000_000)
    replay: dict[str, Any]
    # selfPlay.ts tallies by seat: [seat 0, seat 1] or {"A", "B"}.
    tallies: list[dict[str, Any]] | dict[str, Any] | None = None
    turns: int | None = Field(default=None, ge=0, le=500)
    levels: str | None = Field(default=None, max_length=32)


class BotGamesIn(BaseModel):
    batch_id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,64}$")
    levels: str = Field(default="", max_length=32)
    games: list[BotGameIn] = Field(min_length=1, max_length=MAX_BATCH_GAMES)


@router.post("/bot-games", response_model=BotBatchOut)
def ingest_bot_games(body: BotGamesIn, _: Service, db: Annotated[Session, Depends(get_db)]) -> dict:
    """Store a batch of self-play games. Sending the same batch id and indexes again adds nothing."""
    return ingest_batch(db, body.batch_id, clean_levels(body.levels), [g.model_dump() for g in body.games])


@router.get("/bot-games", response_model=BotGameSearchOut)
def search_bot_games_route(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    card: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    result: Literal["won", "lost"] | None = None,
    went_first: bool | None = None,
    levels: Annotated[str | None, Query(pattern=LEVELS_PATTERN)] = None,
    min_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    max_turns: Annotated[int | None, Query(ge=0, le=100)] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_GAMES)] = 20,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> dict:
    if result is not None and not (leader or opponent):
        raise HTTPException(status_code=400, detail="Give a leader or opponent with the result")
    return search_bot_games(
        db, leader=leader, opponent=opponent, card=card, result=result, went_first=went_first,
        levels=levels, min_turns=min_turns, max_turns=max_turns, limit=limit, offset=offset,
    )


@router.get("/human-bot-games", response_model=HumanBotGamesOut)
def human_bot_games_route(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    after_id: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=HUMAN_BOT_MAX_LIMIT)] = 200,
) -> dict:
    """Play vs Bot replays for the weekly value-model refit (#1202): paged by id, no player identifiers, opted-out players left out."""
    return human_bot_games(db, after_id, limit)


@router.get("/bot-games/{game_id}/replay", response_model=BotReplayOut)
def bot_replay(game_id: str, _: Service, db: Annotated[Session, Depends(get_db)]) -> dict:
    out = bot_game_replay(db, game_id)
    if out is None:
        raise HTTPException(status_code=404, detail="Bot game not found")
    return out


@router.get("/stats/sim", response_model=BotSimStatsOut, response_model_exclude_unset=True)
def analyst_sim_stats(
    _: Service,
    db: Annotated[Session, Depends(get_db)],
    leader: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    opponent: Annotated[str | None, Query(pattern=CARD_ID_PATTERN)] = None,
    levels: Annotated[str | None, Query(pattern=LEVELS_PATTERN)] = "hard/hard",
    days: Annotated[int, Query(ge=1, le=3650)] = 90,
    rules_version: Annotated[str | None, Query(max_length=32)] = None,
) -> dict:
    """Simulated matchup win rates and line stats from bot self-play (aggregates only)."""
    if opponent and not leader:
        raise HTTPException(status_code=400, detail="Give a leader with the opponent")
    out = sim_stats(db, leader, opponent, levels, days, rules_version)
    if leader:
        out["lessons"] = shared_bot_lessons(db, leader, opponent)
    return out


@router.post("/bot-lessons", response_model=BotLessonSavedOut, response_model_exclude_unset=True)
def post_bot_lesson(body: BotLessonIn, _: Service, db: Annotated[Session, Depends(get_db)]) -> dict:
    """A line bot games and real games agree on, saved as a draft for the admin. Once approved it reaches every player's Log Pose."""
    try:
        return save_bot_lesson(db, body.text, body.leader_id, body.opponent_id, body.cards, body.evidence)
    except BotLessonError as e:
        raise HTTPException(status_code=e.status, detail=e.detail) from e
