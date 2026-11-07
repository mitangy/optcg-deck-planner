"""Group buy routes (pooled TCGPlayer orders). Split out of routers/api.py (refactor 3.9c, D-03).

Registered right after the api router in app.main, so matching order is unchanged.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.group_buy import service as group_buy
from app.core.models import User
from app.group_buy.schemas import (
    GroupBuyContributionUpdate,
    GroupBuyCreate,
    GroupBuyDetail,
    GroupBuyExport,
    GroupBuyInvitePreview,
    GroupBuyOrderUpdate,
    GroupBuyPublicUpdate,
    GroupBuyQtyUpdate,
    GroupBuyReceiptApplyRequest,
    GroupBuyReceiptMatchReport,
    GroupBuyReceiptMatchRequest,
    GroupBuySummary,
    GroupBuyTitleUpdate,
)

router = APIRouter(tags=["api"])


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


@router.post("/group-buys/{group_id}/leave")
def leave_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        group_buy.leave_group_buy(db, user, group_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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


@router.get("/public/group-buys/{token}/view", response_model=GroupBuyDetail)
def public_group_buy_view(
    token: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Unauthenticated read-only group buy for anyone with the invite token."""
    try:
        return group_buy.public_group_buy_view(db, token)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/group-buys/{group_id}/public", response_model=GroupBuyDetail)
def put_group_buy_public(
    group_id: int,
    body: GroupBuyPublicUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.set_public(db, user, group_id, body.is_public)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/group-buys/{group_id}/title", response_model=GroupBuyDetail)
def put_group_buy_title(
    group_id: int,
    body: GroupBuyTitleUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return group_buy.set_title(db, user, group_id, body.title)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
