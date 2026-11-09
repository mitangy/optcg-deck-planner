"""Log Pose (analyst) request/response models."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.schemas import CARD_ID_PATTERN


class AnalystTokenStatus(BaseModel):
    has_token: bool
    created_at: str | None
    name: str | None = None


class AnalystTokenCreated(BaseModel):
    token: str
    # Full URL to add in Claude as a custom connector; null when ANALYST_PUBLIC_URL is unset.
    connector_url: str | None


class AnalystReplayOut(BaseModel):
    match_id: str
    your_seat: int
    replay: dict


class AnalystDeckCard(BaseModel):
    id: str
    copies: int


class AnalystDeckOut(BaseModel):
    id: int
    name: str
    leader_id: str | None
    cards: list[AnalystDeckCard]


class AnalystDecksOut(BaseModel):
    decks: list[AnalystDeckOut]


class AnalystSharing(BaseModel):
    share_matches: bool


class AnalystLessonIn(BaseModel):
    text: str = Field(min_length=10, max_length=1000)
    leader_id: str | None = Field(default=None, pattern=CARD_ID_PATTERN)
    opponent_id: str | None = Field(default=None, pattern=CARD_ID_PATTERN)
    cards: list[Annotated[str, Field(pattern=CARD_ID_PATTERN)]] = Field(default_factory=list, max_length=10)
    match_ids: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(default_factory=list, max_length=10)


class BotLessonIn(BaseModel):
    text: str = Field(min_length=10, max_length=1000)
    leader_id: str = Field(pattern=CARD_ID_PATTERN)
    opponent_id: str | None = Field(default=None, pattern=CARD_ID_PATTERN)
    cards: list[Annotated[str, Field(pattern=CARD_ID_PATTERN)]] = Field(default_factory=list, max_length=10)
    evidence: str = Field(default="", max_length=500)


class AnalystLessonOut(BaseModel):
    id: int
    status: str
    text: str
    leader_id: str | None
    opponent_id: str | None
    cards: list[str]
    match_ids: list[str]
    source: str = "player"
    created_at: str | None
    reviewed_at: str | None


class AnalystLessonsOut(BaseModel):
    lessons: list[AnalystLessonOut]


class AnalystLessonReview(BaseModel):
    status: Literal["draft", "approved", "rejected"] | None = None
    text: str | None = Field(default=None, min_length=10, max_length=1000)


class AnalystChatSession(BaseModel):
    enabled: bool
    # A short-lived token for the analyst's /chat and /review-match (Authorization: Bearer).
    token: str | None = None
    expires_at: str | None = None  # ISO 8601, UTC
    chat_url: str | None = None
    # Signed-in player who is not enabled but may ask: "none" | "pending" | "denied" (null when requests are closed).
    access: Literal["none", "pending", "denied"] | None = None
    # Only when enabled: whether this player can answer requests, and how many are waiting.
    owner: bool | None = None
    pending_requests: int | None = None
    # Only when not enabled but able to ask: the free spots (how many in all and how many are left) and the monthly credit a spot brings.
    free_spots: int | None = None
    spots_left: int | None = None
    free_credit_usd: float | None = None


class AnalystAccessRequestIn(BaseModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


class AnalystAccessRequested(BaseModel):
    # "approved" when a free spot was left, "pending" when the player is on the waitlist.
    access: Literal["pending", "approved"]


class AnalystAccessDecisionIn(BaseModel):
    status: Literal["approved", "denied"]


class AnalystAccessRow(BaseModel):
    user_id: int
    name: str
    note: str
    status: Literal["pending", "approved", "denied"]
    created_at: str | None = None
    decided_at: str | None = None
    auto_approved: bool = False
    # This month's credit and how much of it the player has used (credit_usd is null for owners).
    credit_usd: float | None = None
    credit_spent_usd: float = 0.0
    # When a player out of credit asked for more.
    topup_requested_at: str | None = None


class AnalystAccessList(BaseModel):
    requests: list[AnalystAccessRow]
    free_spots: int
    spots_used: int


class AnalystFreeSpotsIn(BaseModel):
    free_spots: int = Field(ge=0, le=10_000)


class AnalystFreeSpots(BaseModel):
    free_spots: int
    spots_used: int


class AnalystTopupDecisionIn(BaseModel):
    action: Literal["add", "dismiss"]


class AnalystChatBudget(BaseModel):
    spent_today_usd: float
    daily_cap_usd: float
    spent_month_usd: float
    monthly_cap_usd: float
    allowed: bool
    model: str
    # This month's credit (null for owners, who have none to run out of), how much of it the player has used, and when it refills.
    credit_usd: float | None = None
    credit_spent_usd: float = 0.0
    credit_resets_at: str = ""
    # Why the player can't ask right now: monthly (everyone's cap), credit (their own), daily (their day's cap); precedence in that order.
    refusal: Literal["credit", "daily", "monthly"] | None = None
    # The player's own average chat cost, to say how many questions are left.
    avg_chat_cost_usd: float | None = None
    topup_requested: bool = False


class AnalystModelSetting(BaseModel):
    model: str
    options: list[str]
    can_edit: bool


class AnalystModelIn(BaseModel):
    model: str


class AnalystUsageIn(BaseModel):
    kind: Literal["chat", "review", "brief"]
    model: str = Field(default="", max_length=64)
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cache_read_tokens: int = Field(default=0, ge=0)
    cache_write_tokens: int = Field(default=0, ge=0)
    cost_usd: float = Field(ge=0)
    thread_id: int | None = Field(default=None, ge=1)
    outcome: Literal["ok", "error", "aborted", "refused"] = "ok"
    refusal: Literal["credit", "daily", "monthly", "busy"] | None = None
    tool_calls: int = Field(default=0, ge=0, le=1000)
    duration_ms: int = Field(default=0, ge=0, le=3_600_000)


class AnalystUsagePlayer(BaseModel):
    user_id: int
    name: str
    spent_usd: float
    credit_usd: float | None = None
    credit_spent_usd: float = 0.0
    threads: int
    questions: int
    refused: int
    last_used: str | None = None


class AnalystUsageGroup(BaseModel):
    kind: str
    model: str
    requests: int
    cost_usd: float


class AnalystUsageSummary(BaseModel):
    today_usd: float
    month_usd: float
    total_usd: float
    players: list[AnalystUsagePlayer]
    groups: list[AnalystUsageGroup]


# general | match:<id> | deck:planner:<digits> | deck:duel:<id> (#970).
ANALYST_SCOPE_PATTERN = r"^(general|match:[A-Za-z0-9_-]{1,64}|deck:planner:[0-9]{1,12}|deck:duel:[A-Za-z0-9_-]{1,64})$"


class AnalystThreadIn(BaseModel):
    title: str = Field(default="", max_length=120)
    scope: str = Field(default="general", pattern=ANALYST_SCOPE_PATTERN)


class AnalystThreadSummary(BaseModel):
    id: int
    title: str
    scope: str
    updated_at: str | None


class AnalystThreadsOut(BaseModel):
    threads: list[AnalystThreadSummary]


class AnalystStoredMessage(BaseModel):
    role: Literal["user", "assistant"]
    # Claude API content: a string or a list of content blocks.
    content: str | list[dict]


class AnalystThreadContent(BaseModel):
    id: int
    title: str
    messages: list[AnalystStoredMessage]


class AnalystAppendIn(BaseModel):
    messages: list[AnalystStoredMessage] = Field(min_length=1, max_length=40)


class AnalystCitation(BaseModel):
    """A source cited in an answer: `at` is the UTF-16 offset in the answer's text the citation follows."""

    at: int = Field(ge=0)
    source: str = Field(min_length=1, max_length=200)
    title: str = Field(default="", max_length=200)
    cited_text: str = Field(default="", max_length=1000)


class AnalystDeckEditLine(BaseModel):
    id: str = Field(pattern=CARD_ID_PATTERN)
    name: str = Field(max_length=120)
    before: int = Field(ge=0, le=50)
    after: int = Field(ge=0, le=50)
    reason: str = Field(max_length=300)


class AnalystDeckEditTarget(BaseModel):
    ref: str = Field(max_length=80)
    name: str = Field(max_length=200)
    leader_id: str | None = None


class AnalystDraftLegality(BaseModel):
    legal: bool
    problems: list[str] = Field(default_factory=list, max_length=20)
    upcoming: list[str] = Field(default_factory=list, max_length=20)
    ban_list_checked: bool

    @field_validator("problems", "upcoming")
    @classmethod
    def _short(cls, v: list[str]) -> list[str]:
        if any(len(x) > 300 for x in v):
            raise ValueError("too long")
        return v


class AnalystDeckEditLegality(AnalystDraftLegality):
    count: int = Field(ge=0, le=500)


class AnalystDeckEdit(BaseModel):
    """A deck change Log Pose suggests for the deck open in an app, shown as an Apply card (#400)."""

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    version: Literal[1]
    target: AnalystDeckEditTarget
    summary: str = Field(max_length=300)
    # True when the player asked Log Pose to make this change: the app applies it once to the open deck (#726).
    apply: bool = False
    lines: list[AnalystDeckEditLine] = Field(min_length=1, max_length=12)
    base: list[AnalystDeckCard] = Field(default_factory=list, max_length=80)
    legality: AnalystDeckEditLegality


class AnalystProposalsIn(BaseModel):
    proposals: list[AnalystDeckEdit] = Field(min_length=1, max_length=4)


class AnalystDraftCard(BaseModel):
    id: str = Field(pattern=CARD_ID_PATTERN)
    name: str = Field(max_length=120)
    copies: int = Field(ge=1, le=50)


class AnalystDeckDraft(BaseModel):
    """A new deck Log Pose built for the player: the app opens its create-deck page with it filled in (#726)."""

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    version: Literal[1]
    name: str = Field(min_length=1, max_length=60)
    leader_id: str = Field(pattern=CARD_ID_PATTERN)
    leader_name: str = Field(max_length=120)
    summary: str = Field(max_length=300)
    cards: list[AnalystDraftCard] = Field(min_length=1, max_length=50)
    count: int = Field(ge=0, le=500)
    legality: AnalystDraftLegality


class AnalystDraftsIn(BaseModel):
    drafts: list[AnalystDeckDraft] = Field(min_length=1, max_length=2)


class AnalystDisplayMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    citations: list[AnalystCitation] = Field(default_factory=list)
    proposals: list[AnalystDeckEdit] = Field(default_factory=list)
    drafts: list[AnalystDeckDraft] = Field(default_factory=list)


class AnalystThreadView(BaseModel):
    id: int
    title: str
    scope: str
    messages: list[AnalystDisplayMessage]


class AnalystReviewIn(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    citations: list[AnalystCitation] = Field(default_factory=list, max_length=200)


class AnalystBriefLookupIn(BaseModel):
    ticket: str = Field(min_length=10, max_length=4000)
    variant: str = Field(min_length=1, max_length=32)


class AnalystBriefIn(AnalystBriefLookupIn):
    text: str = Field(min_length=1, max_length=8000)
    citations: list[AnalystCitation] = Field(default_factory=list, max_length=100)


class AnalystBriefOut(BaseModel):
    text: str
    citations: list[AnalystCitation] = Field(default_factory=list)
    created_at: str | None


class AnalystBriefDeckLine(BaseModel):
    id: str
    copies: int


class AnalystBriefLookupOut(BaseModel):
    leader_id: str
    opponent_id: str
    deck: list[AnalystBriefDeckLine]
    key: str
    # The game the ticket was minted for ("" when it names none); the chat scopes its thread to it (#970).
    match_id: str = ""
    brief: AnalystBriefOut | None = None


class AnalystReviewOut(BaseModel):
    match_id: str
    text: str
    citations: list[AnalystCitation] = Field(default_factory=list)
    created_at: str | None


# ---------------------------------------------------------------- bot self-play corpus (refactor 2.1c)
# Field order follows app/analyst/bots.py, so the JSON is unchanged.

class BotRejected(BaseModel):
    index: int
    reason: str


class BotBatchOut(BaseModel):
    accepted: int
    duplicates: int
    rejected: list[BotRejected]


class BotGameSide(BaseModel):
    leader: str
    won: bool | None
    went_first: bool | None


class BotSideSeats(BaseModel):
    A: int
    B: int


class BotGameSummary(BaseModel):
    game_id: str
    source: str
    date: str | None
    levels: str
    rules_version: str
    turns: int | None
    has_replay: bool
    A: BotGameSide
    B: BotGameSide
    sides: BotSideSeats


class BotGameSearchOut(BaseModel):
    total: int
    offset: int
    games: list[BotGameSummary]
    source: str


class BotReplayOut(BaseModel):
    game_id: str
    source: str
    date: str | None
    levels: str
    rules_version: str
    sides: BotSideSeats
    replay: dict[str, Any]


class HumanBotGameOut(BaseModel):
    """One Play vs Bot game for training: no player identifiers, only the bot's level and the replay."""

    id: int
    created_at: datetime
    bot_level: str | None
    replay: dict[str, Any]


class HumanBotGamesOut(BaseModel):
    games: list[HumanBotGameOut]
    # Pass as after_id for the next page; unchanged (the given after_id) when nothing is left.
    next_after_id: int


class BotSimStatsOut(BaseModel):
    """One of four shapes (all leaders, a mirror, a matchup, one leader); served with exclude_unset so a shape keeps only its own keys."""

    source: str | None = None
    label: str | None = None
    days: int | None = None
    levels: str | None = None
    rules_versions: dict[str, int] | None = None
    min_games: int | None = None
    total_games: int | None = None
    leaders: list[dict[str, Any]] | None = None
    leader: str | None = None
    opponent: str | None = None
    mirror: bool | None = None
    games: int | None = None
    wins: int | None = None
    win_rate: float | None = None
    interval: Any = None
    too_few_games: bool | None = None
    going_first: dict[str, Any] | None = None
    going_second: dict[str, Any] | None = None
    average_turns: float | None = None
    overall: dict[str, Any] | None = None
    opponents: list[dict[str, Any]] | None = None
    lines: list[dict[str, Any]] | None = None
    lessons: list[dict[str, Any]] | None = None


class BotLessonSavedOut(BaseModel):
    """`id` is only there for a lesson that was saved, not for a skipped duplicate."""

    skipped: bool
    id: int | None = None
