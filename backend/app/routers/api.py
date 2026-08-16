from __future__ import annotations

import hmac
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.catalog_sync import run_catalog_sync_job, sync_status, try_claim_sync_slot
from app.config import Settings, get_settings
from app.db import get_db
from app.models import CatalogMeta, User
from app.rate_limit import RateLimiter, client_ip
from app.recent_sales import fetch_recent_sales
from app.schemas import (
    CatalogCardResult,
    CatalogStatus,
    CardPrintingResult,
    CardPrintingUpdate,
    DeckCardPrintingUpdate,
    DeckCardUpsert,
    DeckCreate,
    DeckDetail,
    DeckOwnedResetResult,
    DeckSummary,
    GroupBuyContributionUpdate,
    GroupBuyCreate,
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyLineOverrideUpdate,
    GroupBuyOrderUpdate,
    GroupBuyQtyUpdate,
    GroupBuyReceiptApplyRequest,
    GroupBuyReceiptMatchReport,
    GroupBuyReceiptMatchRequest,
    GroupBuySummary,
    OwnedUpdate,
    PublicShoppingResponse,
    RecentSalesResponse,
    ShareCreate,
    ShareInfo,
    ShoppingResponse,
)
from app import group_buy, services
from app.services import DeckOversizeError

router = APIRouter(tags=["api"])

# Public TCGPlayer proxy — keep abuse cost bounded per client IP.
_sales_rate_limiter = RateLimiter(max_calls=30, period_s=60)


def _require_catalog_token(x_catalog_token: str | None, settings: Settings) -> None:
    provided = x_catalog_token or ""
    expected = settings.catalog_sync_token or ""
    if not expected or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid catalog sync token")


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


@router.post("/decks/{deck_id}/set-main", response_model=DeckDetail)
def set_deck_main(
    deck_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark this deck as Main for its leader; variants compare Additional Cards against it."""
    try:
        return services.set_deck_as_main(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.put("/decks/{deck_id}/cards/{card_id}", response_model=DeckDetail)
def put_deck_card(
    deck_id: int,
    card_id: str,
    body: DeckCardUpsert,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return services.upsert_deck_card(
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
        return services.upsert_deck_card(
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
        return services.set_deck_card_printing(
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
        qty, decks_updated = services.set_user_card_printing(
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
        reset_count, detail = services.reset_deck_owned(db, user, deck_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DeckOwnedResetResult(deck_id=deck_id, reset_count=reset_count, deck=detail)


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


@router.get("/group-buys", response_model=list[GroupBuySummary])
def get_group_buys(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.list_group_buys(db, user)


@router.post("/group-buys", response_model=GroupBuyDetail)
def post_group_buy(
    body: GroupBuyCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.create_group_buy(db, user, body.title, deck_ids=body.deck_ids)


@router.get("/group-buys/{group_id}", response_model=GroupBuyDetail)
def get_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.get_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.delete("/group-buys/{group_id}")
def delete_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        group_buy.delete_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/group-buys/join/{token}", response_model=GroupBuyDetail)
def join_group_buy(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.join_group_buy(db, user, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/public/group-buys/{token}", response_model=GroupBuyInvitePreview)
def public_group_buy_invite(
    token: str,
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.invite_preview(db, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/group-buys/{group_id}/contribution", response_model=GroupBuyDetail)
def put_group_buy_contribution(
    group_id: int,
    body: GroupBuyContributionUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.update_contribution(db, user, group_id, body.deck_ids)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/lock", response_model=GroupBuyDetail)
def lock_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.lock_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/unlock", response_model=GroupBuyDetail)
def unlock_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.unlock_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/order", response_model=GroupBuyDetail)
def mark_group_buy_ordered(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    body: GroupBuyOrderUpdate = GroupBuyOrderUpdate(),
):
    """Mark ordered: record checkout handoff after lock (does not update Owned)."""
    try:
        return group_buy.mark_ordered(db, user, group_id, body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/group-buys/{group_id}/order", response_model=GroupBuyDetail)
def patch_group_buy_order(
    group_id: int,
    body: GroupBuyOrderUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update order notes, shipping cost, and shipping split (host)."""
    try:
        return group_buy.update_order(db, user, group_id, body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/complete", response_model=GroupBuyDetail)
def complete_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark purchased without a receipt is blocked (use POST .../receipt/apply)."""
    try:
        return group_buy.complete_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/group-buys/{group_id}/receipt/match",
    response_model=GroupBuyReceiptMatchReport,
)
def match_group_buy_receipt(
    group_id: int,
    body: GroupBuyReceiptMatchRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Parse a TCGPlayer receipt and compare line items to this group buy.

    Hosts also persist the paste so Mark purchased still works after a refresh.
    """
    try:
        report = group_buy.build_receipt_match_report(db, user, group_id, body.receipt_text)
        try:
            group_buy.save_receipt_text(db, user, group_id, body.receipt_text)
        except PermissionError:
            # Members may match for preview; only the host saves.
            pass
        return report
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/receipt/apply", response_model=GroupBuyDetail)
def apply_group_buy_receipt(
    group_id: int,
    body: GroupBuyReceiptApplyRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Stage matched receipt copies onto Owned (partial OK); complete when pool is empty."""
    try:
        return group_buy.apply_receipt_to_group_buy(db, user, group_id, body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/receipt/undo", response_model=GroupBuyDetail)
def undo_group_buy_receipt_apply(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Undo the latest Mark purchased — restore snapshot, Owned, and status."""
    try:
        return group_buy.undo_last_receipt_apply(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/group-buys/{group_id}/lines/{card_id}", response_model=GroupBuyDetail)
def put_group_buy_line_override(
    group_id: int,
    card_id: str,
    body: GroupBuyLineOverrideUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.set_line_override(db, user, group_id, card_id, body.product_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/group-buys/{group_id}/quantities/{card_id}", response_model=GroupBuyDetail)
def put_group_buy_qty(
    group_id: int,
    card_id: str,
    body: GroupBuyQtyUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.set_member_qty(db, user, group_id, card_id, body.qty)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/group-buys/{group_id}/quantities/{card_id}", response_model=GroupBuyDetail)
def delete_group_buy_qty(
    group_id: int,
    card_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.clear_member_qty(db, user, group_id, card_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/group-buys/{group_id}/quantities/sync", response_model=GroupBuyDetail)
def sync_group_buy_quantities(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.sync_member_quantities(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/group-buys/{group_id}/export/tcgplayer", response_model=GroupBuyExport)
def export_group_buy_tcgplayer(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.export_tcgplayer(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


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
):
    """Search the card catalog by name, id, color, type, rarity, or set name."""
    _ = user
    return services.search_catalog(db, q=q, color=color, card_type=card_type, limit=limit)


@router.get("/catalog/sales/{product_id}", response_model=RecentSalesResponse)
def catalog_recent_sales(
    request: Request,
    product_id: int,
    limit: Annotated[int, Query(ge=1, le=10)] = 3,
):
    """Public proxy for TCGPlayer latest sales (cached). Used by price expand UI."""
    if not _sales_rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many sales requests")
    try:
        sales = fetch_recent_sales(product_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not load recent sales") from exc
    return RecentSalesResponse(product_id=product_id, sales=sales)


@router.post("/admin/sync-catalog", status_code=202)
def admin_sync_catalog(
    background_tasks: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
):
    """Enqueue a full catalog sync and return immediately (202).

    The sync is long-running, so it runs as a background job instead of blocking
    this request (which would time out the caller and the free Render instance).
    """
    _require_catalog_token(x_catalog_token, settings)
    # Claim before returning so /status never briefly reports a stale finish.
    if not try_claim_sync_slot():
        return {"status": "already_running", "detail": "A catalog sync is already in progress"}
    background_tasks.add_task(run_catalog_sync_job, already_claimed=True)
    return {"status": "started", "detail": "Catalog sync started in the background"}


@router.get("/admin/sync-catalog/status")
def admin_sync_catalog_status(
    settings: Annotated[Settings, Depends(get_settings)],
    x_catalog_token: Annotated[str | None, Header()] = None,
):
    """Report the background catalog sync state (guarded by the same token)."""
    _require_catalog_token(x_catalog_token, settings)
    return sync_status()
