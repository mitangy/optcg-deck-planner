from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.catalog_sync import sync_catalog
from app.config import Settings, get_settings
from app.db import get_db
from app.models import CatalogMeta, User
from app.schemas import (
    CatalogStatus,
    DeckCreate,
    DeckDetail,
    DeckSummary,
    DeckUpdate,
    OwnedUpdate,
    PublicShoppingResponse,
    ShareCreate,
    ShareInfo,
    ShoppingResponse,
)
from app import services

router = APIRouter(tags=["api"])


@router.get("/decks", response_model=list[DeckSummary])
def get_decks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return services.list_decks(db, user)


@router.post("/decks", response_model=DeckSummary)
def post_deck(
    body: DeckCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        deck = services.create_deck(db, user, body.name, body.decklist)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    summaries = {d.id: d for d in services.list_decks(db, user)}
    return summaries[deck.id]


@router.patch("/decks/{deck_id}", response_model=DeckSummary)
def patch_deck(
    deck_id: int,
    body: DeckUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        deck = services.update_deck(db, user, deck_id, body.name, body.decklist)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    summaries = {d.id: d for d in services.list_decks(db, user)}
    return summaries[deck.id]


@router.delete("/decks/{deck_id}")
def remove_deck(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        services.delete_deck(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/decks/{deck_id}", response_model=DeckDetail)
def get_deck(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return services.get_deck_detail(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/shopping", response_model=ShoppingResponse)
def get_shopping(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    deck_ids: Annotated[list[int] | None, Query()] = None,
):
    """Optional deck_ids filters Need/Still Need to only the selected decks."""
    return services.shopping_list(db, user, deck_ids=deck_ids)


@router.put("/owned/{card_id}")
def put_owned(
    card_id: str,
    body: OwnedUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    qty = services.set_owned(db, user, card_id, body.qty)
    return {"card_id": card_id.upper(), "qty": qty}


@router.get("/share/shopping", response_model=ShareInfo | None)
def get_shopping_share(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return services.get_active_shopping_share(db, user)


@router.post("/share", response_model=ShareInfo)
def post_share(
    body: ShareCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return services.create_or_update_share(
            db, user, body.kind, deck_id=body.deck_id, deck_ids=body.deck_ids
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/share/{token}")
def delete_share(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        services.revoke_share(db, user, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/public/share/{token}", response_model=PublicShoppingResponse)
def get_public_share(
    token: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Unauthenticated read-only shopping/deck view for a share token."""
    try:
        return services.public_share_view(db, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/catalog/status", response_model=CatalogStatus)
def catalog_status(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _ = user
    meta = db.scalar(select(CatalogMeta).limit(1))
    if meta is None:
        return CatalogStatus(card_count=0, last_synced_at=None)
    return CatalogStatus(
        card_count=meta.card_count,
        last_synced_at=meta.last_synced_at.isoformat() if meta.last_synced_at else None,
        notes=meta.notes or "",
    )


@router.post("/admin/sync-catalog")
def admin_sync_catalog(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
):
    if not x_catalog_token or x_catalog_token != settings.catalog_sync_token:
        raise HTTPException(status_code=401, detail="Invalid catalog sync token")
    result = sync_catalog(db)
    return result
