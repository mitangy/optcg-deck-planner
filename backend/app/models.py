from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    # Public duel handle (3–20 chars, see app/usernames.py). Unique case-insensitively
    # via ix_users_username_lower; NULL until the user picks one.
    username: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Bumped on logout so stolen cookies stop working before natural expiry.
    session_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Shopping Need: sum copies across distinct leaders instead of max across decks.
    sum_across_leaders: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    decks: Mapped[list[Deck]] = relationship(back_populates="user", cascade="all, delete-orphan")
    owned: Mapped[list[Owned]] = relationship(back_populates="user", cascade="all, delete-orphan")


# Case-insensitive uniqueness for usernames (NULLs allowed on SQLite + Postgres).
# Existing databases get this via app.db._ensure_user_username().
Index("ix_users_username_lower", func.lower(User.username), unique=True)


class LoginTicket(Base):
    """Single-use OAuth login tickets (claimed once via POST /auth/claim)."""

    __tablename__ = "login_tickets"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    leader_card_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Baseline for Additional Cards among decks that share leader_card_id.
    # At most one True per (user, leader); unset falls back to earliest sort_order.
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="decks")
    cards: Mapped[list[DeckCard]] = relationship(
        back_populates="deck", cascade="all, delete-orphan", order_by="DeckCard.id"
    )


class DeckCard(Base):
    __tablename__ = "deck_cards"
    __table_args__ = (UniqueConstraint("deck_id", "card_id", name="uq_deck_card"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    needed: Mapped[int] = mapped_column(Integer)

    deck: Mapped[Deck] = relationship(back_populates="cards")


class DeckCardPrinting(Base):
    """Per-deck alt-art want counts (play allocation of DeckCard.needed)."""

    __tablename__ = "deck_card_printings"
    __table_args__ = (
        UniqueConstraint("deck_id", "card_id", "product_id", name="uq_deck_card_printing"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)


class Owned(Base):
    __tablename__ = "owned"
    __table_args__ = (UniqueConstraint("user_id", "card_id", name="uq_user_owned"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship(back_populates="owned")


class ShareLink(Base):
    """Public read-only link to a user's shopping list (or a deck)."""

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), default="shopping")  # shopping | deck
    deck_id: Mapped[int | None] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # JSON list of deck ids for shopping shares; null/empty = all decks
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()


class CatalogCard(Base):
    __tablename__ = "catalog_cards"

    card_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    rarity: Mapped[str] = mapped_column(String(32), default="")
    color: Mapped[str] = mapped_column(String(64), default="")
    card_type: Mapped[str] = mapped_column(String(64), default="")
    cost: Mapped[str | None] = mapped_column(String(16), nullable=True)
    market_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    tcgplayer_url: Mapped[str] = mapped_column(Text, default="")
    group_name: Mapped[str] = mapped_column(String(255), default="")
    is_special: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CatalogPrinting(Base):
    """All TCGPlayer products for a card number (standard + alt arts)."""

    __tablename__ = "catalog_printings"
    __table_args__ = (UniqueConstraint("card_id", "product_id", name="uq_card_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    market_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    low_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, default="")
    tcgplayer_url: Mapped[str] = mapped_column(Text, default="")
    group_name: Mapped[str] = mapped_column(String(255), default="")
    is_special: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CatalogMeta(Base):
    __tablename__ = "catalog_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    card_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")


class GroupBuy(Base):
    """Collaborative shopping pool (group buy) with invite link."""

    __tablename__ = "group_buys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Group buy")
    # open | locked | ordered | completed
    status: Mapped[str] = mapped_column(String(32), default="open")
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    external_order_id: Mapped[str] = mapped_column(String(200), default="")
    order_notes: Mapped[str] = mapped_column(Text, default="")
    shipping_cost: Mapped[float] = mapped_column(Float, default=0.0)
    # equal | by_cost | by_copies
    shipping_split: Mapped[str] = mapped_column(String(32), default="equal")
    # Sales tax / fees — always split by card cost in settlement.
    tax_cost: Mapped[float] = mapped_column(Float, default=0.0)
    # Last TCGPlayer receipt paste (host); survives refresh so Mark purchased can rematch.
    receipt_text: Mapped[str] = mapped_column(Text, default="")
    # When True, anyone with the invite token can view the pool read-only (no mutations).
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    host: Mapped[User] = relationship()
    members: Mapped[list[GroupBuyMember]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    snapshot_lines: Mapped[list[GroupBuySnapshotLine]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    line_overrides: Mapped[list[GroupBuyLineOverride]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    qty_overrides: Mapped[list[GroupBuyQtyOverride]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )
    receipt_applies: Mapped[list[GroupBuyReceiptApply]] = relationship(
        back_populates="group_buy", cascade="all, delete-orphan"
    )


class GroupBuyMember(Base):
    __tablename__ = "group_buy_members"
    __table_args__ = (UniqueConstraint("group_buy_id", "user_id", name="uq_group_buy_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")  # host | member
    # JSON list of deck ids for this member's contribution; null/empty = all decks
    deck_ids_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class GroupBuySnapshotLine(Base):
    """Frozen per-member qty at lock time."""

    __tablename__ = "group_buy_snapshot_lines"
    __table_args__ = (
        UniqueConstraint(
            "group_buy_id", "user_id", "card_id", name="uq_group_buy_snapshot_line"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="snapshot_lines")


class GroupBuyLineOverride(Base):
    """Host-chosen TCGPlayer product/printing for a merged card line."""

    __tablename__ = "group_buy_line_overrides"
    __table_args__ = (
        UniqueConstraint("group_buy_id", "card_id", name="uq_group_buy_line_override"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int] = mapped_column(Integer)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="line_overrides")


class GroupBuyQtyOverride(Base):
    """Per-member buy quantity override (defaults otherwise come from shopping still-need)."""

    __tablename__ = "group_buy_qty_overrides"
    __table_args__ = (
        UniqueConstraint(
            "group_buy_id", "user_id", "card_id", name="uq_group_buy_qty_override"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    group_buy: Mapped[GroupBuy] = relationship(back_populates="qty_overrides")


class GroupBuyReceiptApply(Base):
    """One Mark purchased action — ledger so the host can undo Owned + snapshot changes."""

    __tablename__ = "group_buy_receipt_applies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_buy_id: Mapped[int] = mapped_column(
        ForeignKey("group_buys.id", ondelete="CASCADE"), index=True
    )
    applied_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # locked | ordered — status immediately before this apply mutated the pool
    status_before: Mapped[str] = mapped_column(String(32), default="ordered")
    # True when this apply set ordered_at (auto-order from locked)
    set_ordered_at: Mapped[int] = mapped_column(Integer, default=0)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="receipt_applies")
    lines: Mapped[list[GroupBuyReceiptApplyLine]] = relationship(
        back_populates="apply", cascade="all, delete-orphan"
    )


class GroupBuyReceiptApplyLine(Base):
    """Per-member Owned / snapshot allocation recorded for one receipt apply."""

    __tablename__ = "group_buy_receipt_apply_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apply_id: Mapped[int] = mapped_column(
        ForeignKey("group_buy_receipt_applies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)

    apply: Mapped[GroupBuyReceiptApply] = relationship(back_populates="lines")


class DuelRating(Base):
    """Per-user ranked duel rating (Elo)."""

    __tablename__ = "duel_ratings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rating: Mapped[int] = mapped_column(Integer, default=1000, server_default="1000")
    games_played: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelMatch(Base):
    """Completed duel result (idempotent on match_id)."""

    __tablename__ = "duel_matches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    winner_seat: Mapped[int] = mapped_column(Integer)  # 0 or 1
    reason: Mapped[str] = mapped_column(String(64), default="unknown")
    ranked: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    seat0_rating_before: Mapped[int] = mapped_column(Integer)
    seat1_rating_before: Mapped[int] = mapped_column(Integer)
    seat0_rating_after: Mapped[int] = mapped_column(Integer)
    seat1_rating_after: Mapped[int] = mapped_column(Integer)
    # Added with match replays; null on older rows.
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeatLog(Base):
    """One player's turn-by-turn log of a duel, as the game server saw it from their seat.

    Built from the replay with the opponent's hidden cards hidden, so it is safe to
    show that player (and only that player) in their match history.
    """

    __tablename__ = "duel_match_seat_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    seat: Mapped[int] = mapped_column(Integer, primary_key=True)
    log: Mapped[str] = mapped_column(Text)


class DuelMatchProgress(Base):
    """The latest turn-by-turn snapshot of a duel that has no result yet.

    The game server sends one at the start of every turn and when a room closes
    without a result, so a game cut short (server restart, both players gone)
    still has its log up to that point. Deleted once the real result arrives.
    """

    __tablename__ = "duel_match_progress"

    match_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    seat0_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seat1_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=False)
    seat0_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    seat1_leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Same shapes as DuelMatchLog.replay and DuelMatchSeatLog.log; null when over the size cap.
    replay: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat0_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    seat1_log: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelMatchLog(Base):
    """Full replay of one duel: seed, decks and every accepted intent, as JSON text.

    The engine is deterministic, so this replays the whole game. It holds both
    hands and decks, so it is never sent to players as-is.
    """

    __tablename__ = "duel_match_logs"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    replay: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelMatchSeat(Base):
    """One side of a finished duel, kept for Log Pose matchup stats.

    Built from the result and its replay at ingest (and backfilled for older
    replays): the leader, the deck as {card id: copies}, who went first and
    who won. Stats only ever report aggregates of these rows.
    """

    __tablename__ = "duel_match_seats"
    __table_args__ = (UniqueConstraint("match_id", "seat", name="uq_duel_match_seat"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), index=True
    )
    seat: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    leader_id: Mapped[str] = mapped_column(String(32), index=True)
    won: Mapped[bool] = mapped_column(Boolean)
    went_first: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    ranked: Mapped[bool] = mapped_column(Boolean, default=True)
    turns: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deck: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Tournament(Base):
    """A Limitless TCG event whose results feed Log Pose tournament stats. No player data is kept."""

    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(300))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    players: Mapped[int] = mapped_column(Integer)
    set_label: Mapped[str | None] = mapped_column(String(16), nullable=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    platform: Mapped[str | None] = mapped_column(String(40), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TournamentDeck(Base):
    """One entrant's deck at an event: leader, list as {card id: copies}, final record and placing. No names."""

    __tablename__ = "tournament_decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[str] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    leader_id: Mapped[str] = mapped_column(String(32), index=True)
    decklist: Mapped[str] = mapped_column(Text, default="{}")
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    ties: Mapped[int] = mapped_column(Integer, default=0)
    placing: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TournamentGame(Base):
    """One finished pairing: the two leaders and who won (A, B or tie). Byes and unfinished pairings are not kept."""

    __tablename__ = "tournament_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tournament_id: Mapped[str] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    round: Mapped[int] = mapped_column(Integer)
    leader_a: Mapped[str] = mapped_column(String(32), index=True)
    leader_b: Mapped[str] = mapped_column(String(32), index=True)
    winner: Mapped[str] = mapped_column(String(3))


class AnalystPrefs(Base):
    """Whether a player's games count toward Log Pose stats (on unless they turn it off)."""

    __tablename__ = "analyst_prefs"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    share_matches: Mapped[bool] = mapped_column(Boolean, default=True)


class AnalystAccess(Base):
    """A player's request to use the Log Pose chat panel, and the owner's answer.

    Holds no email or name: the owner list shows the player's display name, looked up live.
    """

    __tablename__ = "analyst_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    # "pending" | "approved" | "denied"
    status: Mapped[str] = mapped_column(String(16), default="pending")
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalystSetting(Base):
    """One global Log Pose setting (today only the chat model), the same for every player and both apps."""

    __tablename__ = "analyst_settings"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    value: Mapped[str] = mapped_column(String(64))


class AnalystLesson(Base):
    """A short strategy lesson Claude drafted through a player's personal link.

    Drafts wait for that player to approve or reject them in duel-web; only
    approved lessons are read back to Claude alongside the playbook.
    """

    __tablename__ = "analyst_lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft | approved | rejected
    leader_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    opponent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cards: Mapped[str] = mapped_column(String(400), default="")
    text: Mapped[str] = mapped_column(Text)
    evidence: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AnalystCorpusId(Base):
    """An opaque id for a duel in Log Pose's anonymized game corpus.

    Corpus searches return these instead of match ids, so a game found there can't be
    matched to anyone's match history.
    """

    __tablename__ = "analyst_corpus_ids"

    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    game_id: Mapped[str] = mapped_column(String(24), unique=True, index=True)


class AnalystThread(Base):
    """A Log Pose chat thread in the in-app panel."""

    __tablename__ = "analyst_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystMessage(Base):
    """One message of a chat thread, as the Claude API saw it (content blocks as JSON).

    Append-only: the analyst resends the thread as stored, so rows are never edited.
    """

    __tablename__ = "analyst_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("analyst_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystProposal(Base):
    """A deck edit Log Pose suggested in a thread (an Apply card), kept so the card comes back after a reload (#400).

    `id` is the model's tool_use id; `payload` is the proposal as JSON.
    """

    __tablename__ = "analyst_proposals"

    thread_id: Mapped[int] = mapped_column(ForeignKey("analyst_threads.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AnalystUsage(Base):
    """What one Log Pose model call cost, for the daily and monthly spend caps."""

    __tablename__ = "analyst_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # chat | review
    model: Mapped[str] = mapped_column(String(64), default="")
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AnalystMatchBrief(Base):
    """Log Pose's matchup brief for a casual or practice game, written once per (variant, leaders, deck) and shared."""

    __tablename__ = "analyst_match_briefs"

    # sha256 of variant|leader|opponent|sorted deck counts (see brief_tickets.brief_key).
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    variant: Mapped[str] = mapped_column(String(32))
    leader_id: Mapped[str] = mapped_column(String(32))
    opponent_id: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(Text)
    # JSON list of the citations placed in the text; NULL when there were none.
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystMatchReview(Base):
    """Log Pose's post-game analysis of one duel for one of its players, kept so it's written once."""

    __tablename__ = "analyst_match_reviews"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    match_id: Mapped[str] = mapped_column(
        ForeignKey("duel_matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    text: Mapped[str] = mapped_column(Text)
    # JSON list of the citations placed in the text (offset, source id, title, quote); NULL on reviews written before sources.
    citations: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AnalystToken(Base):
    """A player's personal Log Pose connector token (stored hashed, one per user)."""

    __tablename__ = "analyst_tokens"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Friendship(Base):
    """A friend request or accepted friendship between two users.

    One row per unordered pair: ``user_low_id < user_high_id`` keeps (A, B) and
    (B, A) from coexisting. ``requester_id`` is whoever sent the request.
    """

    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_low_id", "user_high_id", name="uq_friendship_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | accepted
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DuelPresence(Base):
    """Who is in which game-server room, as last reported by that game-server.

    Each game-server process replaces all of its own rows (``instance_id``) with
    a full snapshot every few seconds; rows older than the presence TTL are
    ignored, so a crashed process's rows age out on their own.
    """

    __tablename__ = "duel_presence"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    room_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    instance_id: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(16), default="player")  # player | spectator
    phase: Mapped[str] = mapped_column(String(16), default="playing")  # waiting | playing | finished
    ranked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DuelLobbySeen(Base):
    """Last time a signed-in user's duel lobby polled the friends list (\"online\")."""

    __tablename__ = "duel_lobby_seen"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DuelInvite(Base):
    """An invite from one friend to another to join a private duel room."""

    __tablename__ = "duel_invites"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_duel_invite_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    room_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CardReport(Base):
    """A tester's report that a duel card does not play as printed."""

    __tablename__ = "card_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_id: Mapped[str] = mapped_column(String(32), index=True)
    description: Mapped[str] = mapped_column(Text)
    # Null for anonymous reporters (no session cookie and no game token).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Where the card was inspected: match, practice, hotseat, deck.
    source: Mapped[str] = mapped_column(String(32), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Feedback(Base):
    """A "Report a problem" / "Send feedback" message from the planner or duel-web."""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # bug | idea | other
    kind: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    # duel | planner
    app: Mapped[str] = mapped_column(String(16))
    # Path only (no query string), e.g. /demo.
    page: Mapped[str] = mapped_column(String(200), default="")
    client_build: Mapped[str] = mapped_column(String(40), default="")
    viewport: Mapped[str] = mapped_column(String(32), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    room_id: Mapped[str] = mapped_column(String(64), default="")
    # Null for anonymous senders (no session cookie and no game token).
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DuelUserSettings(Base):
    """A signed-in player's duel-web settings, shared by every device they use.

    ``data`` is the client's JSON settings object (device-only fields such as
    the game server URL stay in the browser). The active playmat / card back
    point at that user's own ``DuelCosmetic`` rows; null means the default.
    """

    __tablename__ = "duel_user_settings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[str] = mapped_column(Text, default="")
    active_playmat_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    active_card_back_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DuelCosmetic(Base):
    """An image a player uploaded as a playmat or card back (kept as history)."""

    __tablename__ = "duel_cosmetics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # playmat | cardBack
    mime: Mapped[str] = mapped_column(String(32))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
