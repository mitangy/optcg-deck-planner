from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.planner.catalog_sync import run_catalog_sync_job, sync_status, try_claim_sync_slot
from app.core.security import CatalogToken
from app.core.db import get_db
from app.models import CatalogCard, CatalogMeta, CatalogPrinting, User
from app.core.rate_limit import RateLimiter, client_ip
from app.planner.recent_sales import fetch_recent_sales, is_cached
from app.schemas import (
    UserOut,
    UserPreferencesUpdate,
    CatalogCardResult,
    CatalogStatus,
    CardPrintingResult,
    CardPrintingUpdate,
    DeckCardPrintingUpdate,
    DeckCardUpsert,
    DeckCreate,
    DeckListReplace,
    DeckRename,
    DeckDetail,
    DeckOwnedResetResult,
    DeckSummary,
    OwnedCollectionResponse,
    DisplayArtResult,
    DisplayArtUpdate,
    CollectorWantResult,
    CollectorWantUpdate,
    OwnedPrintingResult,
    OwnedPrintingUpdate,
    OwnedAddRequest,
    OwnedAddResponse,
    OwnedAddResult,
    OwnedUpdate,
    ShoppingExtraUpdate,
    PrintingView,
    PublicShoppingResponse,
    PriceHistoryImport,
    PriceHistoryImportResult,
    PriceHistoryResponse,
    RecentSalesResponse,
    ShareCreate,
    ShareInfo,
    ShoppingResponse,
)
from app.planner import deck_link, price_history
from app.planner import catalog_search as search_svc
from app.planner import decks as deck_svc
from app.planner import owned as owned_svc
from app.planner import share as share_svc
from app.planner import shopping as shopping_svc
from app.planner.decks import DeckOversizeError

router = APIRouter(tags=["api"])

# Public TCGPlayer proxy — keep abuse cost bounded per client IP.
_sales_rate_limiter = RateLimiter(max_calls=30, period_s=60, name="api_sales_rate_limiter")
# Uncached lookups each hold a worker thread on a TCGPlayer call; cap them in
# total, since the per-IP key above can be spoofed.
_sales_upstream_limiter = RateLimiter(max_calls=60, period_s=60, name="api_sales_upstream_limiter")


@router.get("/decks", response_model=list[DeckSummary])
def get_decks(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    deck_link.reconcile_user(db, user)
    return deck_svc.list_decks(db, user)


@router.post("/decks", response_model=DeckSummary)
def post_deck(
    body: DeckCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        deck = deck_svc.create_deck(db, user, body.name, body.decklist)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return deck_svc.deck_summary(db, user, deck)


@router.delete("/decks/{deck_id}")
def remove_deck(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        deck_svc.delete_deck(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.patch("/decks/{deck_id}", response_model=DeckDetail)
def rename_deck(
    deck_id: int,
    body: DeckRename,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return deck_svc.update_deck(
            db, user, deck_id, body.name, body.hidden_from_friends
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/decks/{deck_id}/set-main", response_model=DeckDetail)
def set_deck_main(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark this deck as Main for its leader; variants compare Additional Cards against it."""
    try:
        return deck_svc.set_deck_as_main(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/decks/{deck_id}", response_model=DeckDetail)
def get_deck(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    deck_ids: Annotated[list[int] | None, Query()] = None,
):
    """Optional deck_ids limits which other decks claim owned copies first (Separate per leader)."""
    try:
        return deck_svc.get_deck_detail(db, user, deck_id, deck_ids=deck_ids)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/decks/{deck_id}/decklist", response_model=DeckDetail)
def put_deck_decklist(
    deck_id: int,
    body: DeckListReplace,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return deck_svc.replace_deck_list(db, user, deck_id, body.decklist)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/decks/{deck_id}/cards/{card_id}", response_model=DeckDetail)
def put_deck_card(
    deck_id: int,
    card_id: str,
    body: DeckCardUpsert,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return deck_svc.upsert_deck_card(
            db,
            user,
            deck_id,
            card_id,
            body.needed,
            confirm_oversize=body.confirm_oversize,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeckOversizeError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "deck_oversize",
                "message": str(exc),
                "current": exc.current,
                "projected": exc.projected,
                "limit": exc.limit,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/decks/{deck_id}/cards/{card_id}", response_model=DeckDetail)
def delete_deck_card(
    deck_id: int,
    card_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return deck_svc.upsert_deck_card(
            db, user, deck_id, card_id, 0, confirm_oversize=True
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put(
    "/decks/{deck_id}/cards/{card_id}/printings/{product_id}",
    response_model=DeckDetail,
)
def put_deck_card_printing(
    deck_id: int,
    card_id: str,
    product_id: int,
    body: DeckCardPrintingUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set how many copies of an alt printing are wanted in this deck (≤ Need)."""
    try:
        return deck_svc.set_deck_card_printing(
            db, user, deck_id, card_id, product_id, body.qty
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put(
    "/cards/{card_id}/printings/{product_id}",
    response_model=CardPrintingResult,
)
def put_card_printing(
    card_id: str,
    product_id: int,
    body: CardPrintingUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set alt-art want across decks that include the card (shopping / group-buy sync)."""
    try:
        qty, decks_updated = owned_svc.set_user_card_printing(
            db,
            user,
            card_id,
            product_id,
            body.qty,
            deck_ids=body.deck_ids,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CardPrintingResult(
        card_id=card_id.upper(),
        product_id=product_id,
        qty=qty,
        decks_updated=decks_updated,
    )


@router.post("/decks/{deck_id}/reset-owned", response_model=DeckOwnedResetResult)
def reset_deck_owned(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Zero Owned counts for every card that appears in this deck."""
    try:
        reset_count, detail = owned_svc.reset_deck_owned(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeckOwnedResetResult(deck_id=deck_id, reset_count=reset_count, deck=detail)


@router.get("/shopping", response_model=ShoppingResponse)
def get_shopping(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    deck_ids: Annotated[list[int] | None, Query()] = None,
    extras: Annotated[bool, Query()] = True,
):
    """Optional deck_ids filters Need/Still Need to only the selected decks.

    Cards added directly (no deck) are included whatever deck_ids selects;
    pass extras=false to leave them out.
    """
    return shopping_svc.shopping_list(db, user, deck_ids=deck_ids, include_extras=extras)


@router.put("/shopping/extras/{card_id}")
def put_shopping_extra(
    card_id: str,
    body: ShoppingExtraUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set the target copies to own for a card added straight to Master Shopping."""
    try:
        qty = shopping_svc.set_shopping_extra(db, user, card_id, body.qty)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"card_id": card_id.upper().strip(), "qty": qty}


@router.patch("/preferences", response_model=UserOut)
def patch_preferences(
    body: UserPreferencesUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update per-user settings (e.g. how shopping Need combines decks)."""
    if body.sum_across_leaders is not None:
        user.sum_across_leaders = body.sum_across_leaders
    if body.share_scans is not None:
        user.share_scans = body.share_scans
    db.commit()
    db.refresh(user)
    return user


@router.get("/owned", response_model=OwnedCollectionResponse)
def get_owned(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    deck_ids: Annotated[list[int] | None, Query()] = None,
):
    """Cards the user owns, with estimated market value. deck_ids filters the Buying counts."""
    return owned_svc.owned_collection(db, user, deck_ids=deck_ids)


@router.post("/owned/add", response_model=OwnedAddResponse)
def post_owned_add(
    body: OwnedAddRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Add copies to several cards at once (the Collection photo scan)."""
    try:
        rows = owned_svc.add_owned(db, user, [(i.card_id, i.add) for i in body.items])
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return OwnedAddResponse(items=[OwnedAddResult(card_id=c, owned=n) for c, n in rows])


@router.put("/owned/{card_id}")
def put_owned(
    card_id: str,
    body: OwnedUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    qty = owned_svc.set_owned(db, user, card_id, body.qty)
    return {"card_id": card_id.upper(), "qty": qty}


@router.put(
    "/owned/{card_id}/printings/{product_id}",
    response_model=OwnedPrintingResult,
)
def put_owned_printing(
    card_id: str,
    product_id: int,
    body: OwnedPrintingUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set how many copies of an alt printing the user owns."""
    try:
        qty = owned_svc.set_alt_owned(db, user, card_id, product_id, body.qty)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OwnedPrintingResult(card_id=card_id.upper().strip(), product_id=product_id, qty=qty)


@router.put(
    "/cards/{card_id}/collector/{product_id}",
    response_model=CollectorWantResult,
)
def put_collector_want(
    card_id: str,
    product_id: int,
    body: CollectorWantUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set how many collector copies of an alt printing the user wants (0 removes)."""
    try:
        qty = owned_svc.set_collector_want(db, user, card_id, product_id, body.qty)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CollectorWantResult(card_id=card_id.upper().strip(), product_id=product_id, qty=qty)


@router.put("/owned/{card_id}/display", response_model=DisplayArtResult)
def put_display_art(
    card_id: str,
    body: DisplayArtUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Choose which art the card shows (null = automatic, 0 = base art)."""
    try:
        product_id = owned_svc.set_display_art(db, user, card_id, body.product_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DisplayArtResult(card_id=card_id.upper().strip(), product_id=product_id)


@router.get("/share/shopping", response_model=ShareInfo | None)
def get_shopping_share(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return share_svc.get_active_shopping_share(db, user)


@router.post("/share", response_model=ShareInfo)
def post_share(
    body: ShareCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return share_svc.create_or_update_share(
            db,
            user,
            body.kind,
            deck_id=body.deck_id,
            deck_ids=body.deck_ids,
            include_extras=body.include_extras,
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
        share_svc.revoke_share(db, user, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/public/share/{token}", response_model=PublicShoppingResponse)
def get_public_share(
    token: str,
    db: Annotated[Session, Depends(get_db)],
    viewer: Annotated[User | None, Depends(get_optional_user)],
):
    """Read-only shopping/deck view for a share token; no sign-in needed.

    A deck share shows owned counts from the viewer's collection when signed in (#741).
    """
    try:
        return share_svc.public_share_view(db, token, viewer)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/public/share/{token}/copy", response_model=DeckDetail)
def post_copy_shared_deck(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Copy a shared deck into the signed-in viewer's decks (#741)."""
    try:
        new = share_svc.copy_shared_deck(db, user, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return deck_svc.get_deck_detail(db, user, new.id)


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


@router.get("/catalog/cards", response_model=list[CatalogCardResult])
def catalog_cards(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query()] = "",
    color: Annotated[str, Query()] = "",
    card_type: Annotated[str, Query()] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
    alts: Annotated[bool, Query()] = False,
):
    """Search the card catalog by name, id, color, type, rarity, or set name.

    With alts=true, alt-art printings are returned as their own rows.
    """
    return search_svc.search_catalog(
        db, q=q, color=color, card_type=card_type, limit=limit, alts=alts, user_id=user.id
    )


@router.get("/catalog/cards/{card_id}/printings", response_model=list[PrintingView])
def catalog_card_printings(
    card_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """All printings of a card number, so a scan can price the exact treatment."""
    _ = user
    return search_svc.card_printings(db, card_id)


@router.get("/catalog/sales/{product_id}", response_model=RecentSalesResponse)
def catalog_recent_sales(
    request: Request,
    product_id: Annotated[int, Path(ge=1, le=2_147_483_647)],
    db: Annotated[Session, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=10)] = 3,
):
    """Public proxy for TCGPlayer latest sales (cached). Used by price expand UI."""
    if not _sales_rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many sales requests")
    # Only products in our catalog: arbitrary ids would each cost an upstream call
    # and a cache entry that is never reused.
    if db.scalar(select(CatalogPrinting.id).where(CatalogPrinting.product_id == product_id).limit(1)) is None:
        raise HTTPException(status_code=404, detail="Unknown product")
    if not is_cached(product_id) and not _sales_upstream_limiter.allow("sales-upstream"):
        raise HTTPException(status_code=429, detail="Too many sales requests")
    try:
        sales = fetch_recent_sales(product_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not load recent sales") from exc
    return RecentSalesResponse(product_id=product_id, sales=sales)


# History is read from our own DB (no upstream call), so a looser cap than sales.
_history_rate_limiter = RateLimiter(max_calls=120, period_s=60, name="api_price_history_rate_limiter")
MAX_IMPORT_PRODUCTS = 50_000


@router.get("/catalog/cards/{card_id}/price-history", response_model=PriceHistoryResponse)
def catalog_price_history(
    request: Request,
    card_id: Annotated[str, Path(min_length=1, max_length=32)],
    db: Annotated[Session, Depends(get_db)],
    product_id: Annotated[int, Query(ge=0, le=2_147_483_647)] = 0,
):
    """Daily market price history of one art (product_id 0 = the card's base art). Public."""
    if not _history_rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many price history requests")
    printing = price_history.resolve_printing(db, card_id.upper(), product_id)
    if printing is None:
        raise HTTPException(status_code=404, detail="Unknown card or art")
    released = price_history.release_date(db, printing.group_name)
    card = db.get(CatalogCard, printing.card_id)
    return PriceHistoryResponse(
        card_id=printing.card_id,
        product_id=printing.product_id,
        name=printing.name,
        group_name=printing.group_name,
        released=released.isoformat() if released else None,
        rarity=(card.rarity or None) if card else None,
        current=printing.market_price,
        points=price_history.history_points(db, printing.product_id),
    )


@router.post("/catalog/price-history/import", response_model=PriceHistoryImportResult, dependencies=[CatalogToken])
def import_price_history(
    body: PriceHistoryImport,
    db: Annotated[Session, Depends(get_db)],
):
    """Backfill one day of market prices (token-guarded, used by the backfill workflow)."""
    if len(body.prices) > MAX_IMPORT_PRODUCTS:
        raise HTTPException(status_code=413, detail="Too many products in one day")
    known = price_history.known_product_ids(db, list(body.prices))
    prices = {pid: v for pid, v in body.prices.items() if pid in known and v is not None and 0 <= v < 1_000_000}
    stored = price_history.record_prices(db, body.day, prices)
    db.commit()
    return PriceHistoryImportResult(day=body.day.isoformat(), stored=stored)


@router.post("/admin/sync-catalog", status_code=202, dependencies=[CatalogToken])
def admin_sync_catalog(background_tasks: BackgroundTasks):
    """Enqueue a full catalog sync and return immediately (202).

    The sync is long-running, so it runs as a background job instead of blocking
    this request (which would time out the caller and the free Render instance).
    """
    # Claim before returning so /status never briefly reports a stale finish.
    if not try_claim_sync_slot():
        return {"status": "already_running", "detail": "A catalog sync is already in progress"}
    background_tasks.add_task(run_catalog_sync_job, already_claimed=True)
    return {"status": "started", "detail": "Catalog sync started in the background"}


@router.get("/admin/sync-catalog/status", dependencies=[CatalogToken])
def admin_sync_catalog_status():
    """Report the background catalog sync state (guarded by the same token)."""
    return sync_status()
