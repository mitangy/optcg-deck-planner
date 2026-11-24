
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.duel.models import DuelSavedDeck

MAX_DECKS = 200
MAX_DECK_CHARS = 16 * 1024
MAX_ROWS = 1000


def find_row(db: Session, user_id: int, deck_id: str) -> DuelSavedDeck | None:
    return db.scalar(
        select(DuelSavedDeck).where(
            DuelSavedDeck.user_id == user_id, DuelSavedDeck.deck_id == deck_id
        )
    )


def live_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(DuelSavedDeck)
            .where(DuelSavedDeck.user_id == user_id, DuelSavedDeck.deleted.is_(False))
        )
        or 0
    )


def row_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(DuelSavedDeck).where(DuelSavedDeck.user_id == user_id)
        )
        or 0
    )
