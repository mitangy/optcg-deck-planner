"""Duel-web saved decks, stored per account so they follow a player to every device.

The browser keeps a local cache and syncs it here. Conflicts are last-writer-wins
on the client's ``updatedAt``; a deleted deck stays as a tombstone so other
devices learn it is gone. Guests keep browser-only decks.
"""

from __future__ import annotations

import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import DuelSavedDeck, User
from app.schemas import (
    DuelDeckBody,
    DuelDeckBulkPut,
    DuelDeckOut,
    DuelDecksOut,
    DuelDeckPut,
)

router = APIRouter(prefix="/duel/decks", tags=["duel"])

DECK_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_DECKS = 200
MAX_DECK_CHARS = 16 * 1024
# Live decks plus tombstones; keeps delete-spam from growing a user's rows forever.
MAX_ROWS = 1000


def _check_id(deck_id: str) -> str:
    if not DECK_ID_RE.match(deck_id):
        raise HTTPException(status_code=422, detail="Invalid deck id")
    return deck_id


def _out(row: DuelSavedDeck) -> DuelDeckOut:
    if row.deleted or not row.data:
        return DuelDeckOut(id=row.deck_id, updatedAt=row.updated_at_ms, deleted=True)
    return DuelDeckOut(
        id=row.deck_id,
        updatedAt=row.updated_at_ms,
        deleted=False,
        deck=DuelDeckBody(**json.loads(row.data)),
    )


def _row(db: Session, user_id: int, deck_id: str) -> DuelSavedDeck | None:
    return db.scalar(
        select(DuelSavedDeck).where(
            DuelSavedDeck.user_id == user_id, DuelSavedDeck.deck_id == deck_id
        )
    )


def _live_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(DuelSavedDeck)
            .where(DuelSavedDeck.user_id == user_id, DuelSavedDeck.deleted.is_(False))
        )
        or 0
    )


def _row_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(DuelSavedDeck).where(DuelSavedDeck.user_id == user_id)
        )
        or 0
    )


def _upsert(db: Session, user_id: int, deck_id: str, body: DuelDeckPut) -> DuelSavedDeck:
    data = json.dumps(body.deck.model_dump(exclude_none=True), separators=(",", ":"), sort_keys=True)
    if len(data) > MAX_DECK_CHARS:
        raise HTTPException(status_code=413, detail="Deck is too large")
    row = _row(db, user_id, deck_id)
    if row is not None and row.updated_at_ms > body.updatedAt:
        return row  # the stored copy is newer: the client adopts it
    if (row is None or row.deleted) and _live_count(db, user_id) >= MAX_DECKS:
        raise HTTPException(status_code=413, detail=f"You can save up to {MAX_DECKS} decks")
    if row is None:
        if _row_count(db, user_id) >= MAX_ROWS:
            raise HTTPException(status_code=413, detail="Too many saved decks")
        row = DuelSavedDeck(user_id=user_id, deck_id=deck_id)
        db.add(row)
    row.data = data
    row.updated_at_ms = body.updatedAt
    row.deleted = False
    db.flush()
    return row


@router.get("", response_model=DuelDecksOut)
def list_decks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelDecksOut:
    rows = db.scalars(
        select(DuelSavedDeck)
        .where(DuelSavedDeck.user_id == user.id)
        .order_by(DuelSavedDeck.updated_at_ms.desc(), DuelSavedDeck.id)
    ).all()
    return DuelDecksOut(decks=[_out(r) for r in rows])


@router.put("", response_model=DuelDecksOut)
def put_decks(
    body: DuelDeckBulkPut,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelDecksOut:
    """First-sign-in upload: the same last-writer-wins rule per deck."""
    rows = []
    for item in body.decks:
        rows.append(_upsert(db, user.id, _check_id(item.id), item))
    db.commit()
    return DuelDecksOut(decks=[_out(r) for r in rows])


@router.put("/{deck_id}", response_model=DuelDeckOut)
def put_deck(
    deck_id: str,
    body: DuelDeckPut,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DuelDeckOut:
    row = _upsert(db, user.id, _check_id(deck_id), body)
    db.commit()
    return _out(row)


@router.delete("/{deck_id}", response_model=DuelDeckOut)
def delete_deck(
    deck_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    updated_at: Annotated[int, Query(alias="updatedAt", ge=0)],
) -> DuelDeckOut:
    _check_id(deck_id)
    row = _row(db, user.id, deck_id)
    if row is None:
        if _row_count(db, user.id) >= MAX_ROWS:
            raise HTTPException(status_code=413, detail="Too many saved decks")
        row = DuelSavedDeck(user_id=user.id, deck_id=deck_id)
        db.add(row)
    elif row.updated_at_ms > updated_at:
        return _out(row)  # edited after this delete: keep it
    row.data = ""
    row.deleted = True
    row.updated_at_ms = updated_at
    db.commit()
    return _out(row)
