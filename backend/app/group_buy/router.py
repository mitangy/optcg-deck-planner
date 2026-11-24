
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.core.errors import Invalid
from app.group_buy import service as group_buy
from app.group_buy.order_history_pdf import (
    MAX_HISTORY_PDFS,
    MAX_PDF_BYTES,
    MAX_TEXT_CHARS,
    extract_order_history_text,
)
from app.core.models import User
from app.group_buy.schemas import (
    GroupBuyArrivalUndo,
    GroupBuyArrivalUpdate,
    GroupBuyContributionUpdate,
    GroupBuyCreate,
    GroupBuyDetail,
    GroupBuyExtraSkipUpdate,
    GroupBuyExport,
    GroupBuyHandoffUpdate,
    GroupBuyInvitePreview,
    GroupBuyOfflineCardsPaste,
    GroupBuyOfflineCardsResult,
    GroupBuyOfflineMemberBody,
    GroupBuyOrderAdded,
    GroupBuyOrderCreate,
    GroupBuyOrderHistoryImport,
    GroupBuyOrderHistoryImported,
    GroupBuyOrderHistoryPreview,
    GroupBuyOrderHistoryRequest,
    GroupBuyOrderLinesUpdate,
    GroupBuyOrderPatch,
    GroupBuyOrderPreview,
    GroupBuyOrderPreviewRequest,
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
    return group_buy.get_group_buy(db, user, group_id)


@router.delete("/group-buys/{group_id}")
def delete_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    group_buy.delete_group_buy(db, user, group_id)
    return {"ok": True}


@router.post("/group-buys/{group_id}/leave")
def leave_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    group_buy.leave_group_buy(db, user, group_id)
    return {"ok": True}


@router.post("/group-buys/join/{token}", response_model=GroupBuyDetail)
def join_group_buy(
    token: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.join_group_buy(db, user, token)


@router.get("/public/group-buys/{token}", response_model=GroupBuyInvitePreview)
def public_group_buy_invite(
    token: str,
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.invite_preview(db, token)


@router.get("/public/group-buys/{token}/view", response_model=GroupBuyDetail)
def public_group_buy_view(
    token: str,
    db: Annotated[Session, Depends(get_db)],
):
    """Unauthenticated read-only group buy for anyone with the invite token."""
    return group_buy.public_group_buy_view(db, token)


@router.put("/group-buys/{group_id}/public", response_model=GroupBuyDetail)
def put_group_buy_public(
    group_id: int,
    body: GroupBuyPublicUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.set_public(db, user, group_id, body.is_public)


@router.post("/group-buys/{group_id}/invite/reset", response_model=GroupBuyDetail)
def post_group_buy_invite_reset(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.reset_invite(db, user, group_id)


@router.put("/group-buys/{group_id}/title", response_model=GroupBuyDetail)
def put_group_buy_title(
    group_id: int,
    body: GroupBuyTitleUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.set_title(db, user, group_id, body.title)


@router.put("/group-buys/{group_id}/contribution", response_model=GroupBuyDetail)
def put_group_buy_contribution(
    group_id: int,
    body: GroupBuyContributionUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.update_contribution(
        db,
        user,
        group_id,
        body.deck_ids,
        include_singles=body.include_singles,
        include_extra_copies=body.include_extra_copies,
    )


@router.post("/group-buys/{group_id}/lock", response_model=GroupBuyDetail)
def lock_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.lock_group_buy(db, user, group_id)


@router.post("/group-buys/{group_id}/unlock", response_model=GroupBuyDetail)
def unlock_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.unlock_group_buy(db, user, group_id)


@router.post("/group-buys/{group_id}/order", response_model=GroupBuyDetail)
def mark_group_buy_ordered(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    body: GroupBuyOrderUpdate = GroupBuyOrderUpdate(),
):
    """Mark ordered: record checkout handoff after lock (does not update Owned)."""
    return group_buy.mark_ordered(db, user, group_id, body)


@router.patch("/group-buys/{group_id}/order", response_model=GroupBuyDetail)
def patch_group_buy_order(
    group_id: int,
    body: GroupBuyOrderUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Update order notes, shipping cost, and shipping split (host)."""
    return group_buy.update_order(db, user, group_id, body)


@router.post("/group-buys/{group_id}/complete", response_model=GroupBuyDetail)
def complete_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Mark purchased without a receipt is blocked (use POST .../receipt/apply)."""
    return group_buy.complete_group_buy(db, user, group_id)


@router.post("/group-buys/{group_id}/orders", response_model=GroupBuyOrderAdded)
def post_group_buy_order(
    group_id: int,
    body: GroupBuyOrderCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Add one seller package (host). The first one moves locked -> ordered; Owned is untouched."""
    return group_buy.add_order(db, user, group_id, body)


@router.post("/group-buys/{group_id}/orders/preview", response_model=GroupBuyOrderPreview)
def preview_group_buy_order(
    group_id: int,
    body: GroupBuyOrderPreviewRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Match a pasted order and show who its copies would go to; saves nothing."""
    return group_buy.preview_order(db, user, group_id, body.receipt_text)


@router.post(
    "/group-buys/{group_id}/orders/history/preview", response_model=GroupBuyOrderHistoryPreview
)
def preview_group_buy_order_history(
    group_id: int,
    body: GroupBuyOrderHistoryRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Match every order on a pasted TCGplayer Order History page; saves nothing."""
    return group_buy.preview_order_history(db, user, group_id, body.text)


@router.post(
    "/group-buys/{group_id}/orders/history/pdf", response_model=GroupBuyOrderHistoryPreview
)
def preview_group_buy_order_history_pdf(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    files: Annotated[list[UploadFile], File()],
    text: Annotated[str, Form()] = "",
):
    """Same as the paste preview for Order History pages saved as PDF (one per page, #1437).

    `text` is what the dialog already holds; each file's text is added after it, so the list grows.
    Returns the combined text to import with."""
    if len(files) > MAX_HISTORY_PDFS:
        raise Invalid(f"Upload at most {MAX_HISTORY_PDFS} PDFs at once")
    parts = [text.strip()] if text.strip() else []
    for upload in files:
        name = upload.filename or "PDF"
        try:
            parts.append(extract_order_history_text(upload.file.read(MAX_PDF_BYTES + 1)))
        except Invalid as exc:
            raise Invalid(f"{name}: {exc.detail}") from exc
    combined = "\n".join(parts)
    if len(combined) > MAX_TEXT_CHARS:
        raise Invalid("Those pages have too much text together")
    preview = group_buy.preview_order_history(db, user, group_id, combined)
    preview.text = combined
    return preview


@router.post(
    "/group-buys/{group_id}/orders/history/import", response_model=GroupBuyOrderHistoryImported
)
def import_group_buy_order_history(
    group_id: int,
    body: GroupBuyOrderHistoryImport,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Add the chosen orders of an Order History page at once (host)."""
    return group_buy.import_order_history(db, user, group_id, body.text, body.order_numbers)


@router.patch("/group-buys/{group_id}/orders/{order_id}", response_model=GroupBuyDetail)
def patch_group_buy_order_details(
    group_id: int,
    order_id: int,
    body: GroupBuyOrderPatch,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.update_order_details(db, user, group_id, order_id, body)


@router.put("/group-buys/{group_id}/orders/{order_id}/lines", response_model=GroupBuyOrderAdded)
def put_group_buy_order_lines(
    group_id: int,
    order_id: int,
    body: GroupBuyOrderLinesUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Replace an order's cards (host) while nothing in it has arrived; allocation is redone."""
    return group_buy.set_order_lines(db, user, group_id, order_id, body)


@router.delete("/group-buys/{group_id}/orders/{order_id}", response_model=GroupBuyDetail)
def delete_group_buy_order(
    group_id: int,
    order_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.delete_order(db, user, group_id, order_id)


@router.put("/group-buys/{group_id}/orders/{order_id}/arrival", response_model=GroupBuyDetail)
def put_group_buy_order_arrival(
    group_id: int,
    order_id: int,
    body: GroupBuyArrivalUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Set how many copies of each line arrived (or all); members' Owned follows."""
    return group_buy.set_order_arrival(db, user, group_id, order_id, body)


@router.post(
    "/group-buys/{group_id}/orders/{order_id}/arrival/undo", response_model=GroupBuyDetail
)
def undo_group_buy_order_arrival(
    group_id: int,
    order_id: int,
    body: GroupBuyArrivalUndo,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.undo_order_arrival(db, user, group_id, order_id, body)


@router.put("/group-buys/{group_id}/handoffs/{member_id}", response_model=GroupBuyDetail)
def put_group_buy_handoff(
    group_id: int,
    member_id: int,
    body: GroupBuyHandoffUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Host: set how one member's arrived cards reach them, and whether they paid."""
    return group_buy.set_handoff(db, user, group_id, member_id, body)


@router.post("/group-buys/{group_id}/handoffs/me/received", response_model=GroupBuyDetail)
def post_group_buy_handoff_received(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Member: confirm the cards the host shipped or handed over arrived."""
    return group_buy.confirm_handoff_received(db, user, group_id)


@router.post("/group-buys/{group_id}/close", response_model=GroupBuyDetail)
def close_group_buy(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Finish the buy; copies that never arrived stay on members' Shopping lists."""
    return group_buy.close_group_buy(db, user, group_id)


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
    report = group_buy.build_receipt_match_report(db, user, group_id, body.receipt_text)
    try:
        group_buy.save_receipt_text(db, user, group_id, body.receipt_text)
    except PermissionError:
        pass
    return report


@router.post("/group-buys/{group_id}/receipt/apply", response_model=GroupBuyDetail)
def apply_group_buy_receipt(
    group_id: int,
    body: GroupBuyReceiptApplyRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Stage matched receipt copies onto Owned (partial OK); complete when pool is empty."""
    return group_buy.apply_receipt_to_group_buy(db, user, group_id, body)


@router.post("/group-buys/{group_id}/receipt/undo", response_model=GroupBuyDetail)
def undo_group_buy_receipt_apply(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Undo the latest Mark purchased — restore snapshot, Owned, and status."""
    return group_buy.undo_last_receipt_apply(db, user, group_id)


@router.put("/group-buys/{group_id}/quantities/{card_id}", response_model=GroupBuyDetail)
def put_group_buy_qty(
    group_id: int,
    card_id: str,
    body: GroupBuyQtyUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.set_member_qty(db, user, group_id, card_id, body.qty, body.user_id)


@router.put(
    "/group-buys/{group_id}/extras/{card_id}/{product_id}", response_model=GroupBuyDetail
)
def put_group_buy_extra_skip(
    group_id: int,
    card_id: str,
    product_id: int,
    body: GroupBuyExtraSkipUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.set_extra_skip(db, user, group_id, card_id, product_id, body.skip)


@router.delete("/group-buys/{group_id}/quantities/{card_id}", response_model=GroupBuyDetail)
def delete_group_buy_qty(
    group_id: int,
    card_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.clear_member_qty(db, user, group_id, card_id)


@router.post("/group-buys/{group_id}/quantities/sync", response_model=GroupBuyDetail)
def sync_group_buy_quantities(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.sync_member_quantities(db, user, group_id)


@router.get("/group-buys/{group_id}/export/tcgplayer", response_model=GroupBuyExport)
def export_group_buy_tcgplayer(
    group_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.export_tcgplayer(db, user, group_id)


@router.post("/group-buys/{group_id}/offline-members", response_model=GroupBuyDetail)
def post_offline_member(
    group_id: int,
    body: GroupBuyOfflineMemberBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.add_offline_member(db, user, group_id, body.name)


@router.patch("/group-buys/{group_id}/offline-members/{member_id}", response_model=GroupBuyDetail)
def patch_offline_member(
    group_id: int,
    member_id: int,
    body: GroupBuyOfflineMemberBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.rename_offline_member(db, user, group_id, member_id, body.name)


@router.delete("/group-buys/{group_id}/offline-members/{member_id}", response_model=GroupBuyDetail)
def delete_offline_member(
    group_id: int,
    member_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.remove_offline_member(db, user, group_id, member_id)


@router.post(
    "/group-buys/{group_id}/offline-members/{member_id}/cards",
    response_model=GroupBuyOfflineCardsResult,
)
def post_offline_member_cards(
    group_id: int,
    member_id: int,
    body: GroupBuyOfflineCardsPaste,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return group_buy.set_offline_member_cards(db, user, group_id, member_id, body.text)
