"""Add every order on a TCGplayer Order History page at once, pasted or saved as PDF (#1433)."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from pypdf import PdfWriter
from sqlalchemy import select

from app.core.errors import Forbidden, Invalid
from app.core.models import User
from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuyOrder
from app.group_buy.order_history_pdf import MAX_TEXT_CHARS, extract_order_history_text
from app.group_buy.receipt import (
    looks_like_order_history,
    parse_order_history,
    tracking_url_for,
)
from app.planner import decks as deck_svc
from app.planner.models import CatalogPrinting
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401

FIXTURES = Path(__file__).parent / "fixtures"
PDF_TEXT = (FIXTURES / "tcgplayer_order_history_pdf.txt").read_text(encoding="utf-8")
PASTE_TEXT = (FIXTURES / "tcgplayer_order_history_paste.txt").read_text(encoding="utf-8")
SAMPLE_PDF = FIXTURES / "tcgplayer_order_history_sample.pdf"
PAGE2_PDF = FIXTURES / "tcgplayer_order_history_sample_page2.pdf"

LUFFY_ORDER = "8F3A21C0-77C1A0-1B3E4"
ZORO_ORDER = "0C4D5E6F-A1B2C3-D4E5F"
NAMI_ORDER = "FFEEDDCC-BBAA99-88776"


def _by_number(text: str):
    return {o.order_number: o for o in parse_order_history(text)}


def _page(*orders: tuple[str, int]) -> str:
    """A minimal page in the saved-PDF layout: (order number, Luffy copies) per order."""
    blocks = []
    for number, qty in orders:
        blocks.append(
            "\n".join(
                [
                    "ORDER DATE",
                    "November 1, 2026",
                    "ORDER NUMBER",
                    number,
                    "SHIPPED AND SOLD BY",
                    f"Seller {number[:2]}",
                    "SHIPPED WITHOUT TRACKING",
                    "ITEMS DETAILS PRICE QUANTITY",
                    "Monkey D. Luffy (001)",
                    "Test Set",
                    "Rarity: R",
                    f"Condition: Near Mint $2.50 {qty}",
                ]
            )
        )
    return "\n".join(blocks)


# --- parser -----------------------------------------------------------------------------------


def test_every_order_on_a_saved_pdf_page_is_found_with_seller_and_tracking_1433():
    orders = parse_order_history(PDF_TEXT)

    assert [o.order_number for o in orders] == [f"A000000{i}-B0000{i}-C000{i}" for i in range(10)]
    assert [o.seller_name for o in orders] == [f"Sample Seller {c}" for c in "ABCDEFGHIJ"]
    assert [o.tracking_number for o in orders] == [
        "1Z999AA10123456780",
        "9400100000000000000001",
        "9400100000000000000002",
        "",
        "",
        "",
        "9400100000000000000003",
        "9400100000000000000004",
        "9400100000000000000005",
        "9400100000000000000006",
    ]
    assert orders[0].order_date == "November 16, 2026"
    assert orders[1].order_date == "November 15, 2026"


def test_pdf_items_keep_quantity_set_foil_and_collector_number_1433():
    by = _by_number(PDF_TEXT)

    shanks = by["A0000000-B00000-C0000"].lines
    assert len(shanks) == 1
    assert (shanks[0].qty, shanks[0].card_name, shanks[0].set_name) == (
        1,
        "Shanks (022) (Alternate Art)",
        "The World's Strongest Warriors",
    )
    assert (shanks[0].is_foil, shanks[0].condition, shanks[0].collector_number) == (True, "near mint", "022")
    assert shanks[0].wants_special is True

    bonney = by["A0000002-B00002-C0002"].lines[0]
    assert (bonney.qty, bonney.card_name, bonney.is_foil, bonney.wants_special) == (3, "DON!! Card (Bonney)", False, False)

    two_dons = by["A0000003-B00003-C0003"].lines
    assert [(l.qty, l.card_name, l.wants_special) for l in two_dons] == [
        (1, "DON!! Card", False),
        (1, "DON!! Card (Alternate Art)", True),
    ]


def test_a_set_name_wrapped_over_two_lines_is_joined_1433():
    line = _by_number(PDF_TEXT)["A0000001-B00001-C0001"].lines[0]

    assert line.qty == 2
    assert line.set_name == "Extra Booster: One Piece Heroines Edition Vol. 2"


def test_page_junk_and_a_page_break_inside_an_item_are_not_part_of_it_1433():
    by = _by_number(PDF_TEXT)
    assert [l.card_name for l in by["A0000001-B00001-C0001"].lines] == ["DON!! Card (Alternate Art)"]
    assert [l.card_name for l in by["A0000009-B00009-C0009"].lines] == ["Gloriosa (Alternate Art)"]
    assert sum(len(o.lines) for o in by.values()) == 17

    # The page breaks between an item's name and its set, and the footer follows the last item.
    broken = _page((LUFFY_ORDER, 2)).replace(
        "Monkey D. Luffy (001)\nTest Set",
        "Monkey D. Luffy (001)\nContact Seller  Rate Transaction\nEnter an Order Number or Product Name  Search\nTest Set",
    )
    (order,) = parse_order_history(broken + "\nViewing 1 - 10 of 20 order(s)\nStore Credit: $0.00\nFIRST 12 LAST")
    assert [(l.qty, l.card_name, l.set_name) for l in order.lines] == [(2, "Monkey D. Luffy (001)", "Test Set")]


def test_a_tracking_header_with_no_number_leaves_tracking_empty_1433():
    text = _page((LUFFY_ORDER, 1)).replace(
        "SHIPPED WITHOUT TRACKING", "SHIPPED WITH TRACKING:\nStandard (est.delivery by\nDecember 01, 2026) - $3.99"
    )

    assert parse_order_history(text)[0].tracking_number == ""


def test_a_page_number_after_the_last_item_is_not_its_quantity_1433():
    text = _page((LUFFY_ORDER, 2)) + "\n7\nFIRST 1 LAST\n"

    assert [l.qty for l in parse_order_history(text)[0].lines] == [2]


def test_a_copy_pasted_page_with_tabs_between_cells_is_read_the_same_1433():
    by = _by_number(PASTE_TEXT)

    assert list(by) == [LUFFY_ORDER, ZORO_ORDER, NAMI_ORDER]
    assert [o.seller_name for o in by.values()] == ["Grand Line Singles", "Thousand Sunny Cards", "Merry Go Marketplace"]
    assert [o.tracking_number for o in by.values()] == ["1Z999AA10123456784", "9400100000000000000042", ""]
    assert by[LUFFY_ORDER].order_date == "November 20, 2026"
    luffy = by[LUFFY_ORDER].lines
    assert [(l.qty, l.card_name, l.is_foil, l.collector_number) for l in luffy] == [
        (1, "Monkey D. Luffy (001) (Parallel)", True, "001"),
        (2, "Monkey D. Luffy (001)", False, "001"),
    ]
    assert [(l.qty, l.set_name, l.condition) for l in by[ZORO_ORDER].lines][0] == (1, "Test Set Extra Booster Vol. 3", "lightly played")
    # Price and quantity on their own cells after the condition.
    assert [(l.qty, l.card_name) for l in by[NAMI_ORDER].lines] == [(4, "Nami (016)")]


def test_an_order_number_listed_twice_is_kept_once_1433():
    text = _page((LUFFY_ORDER, 1), (ZORO_ORDER, 5), (LUFFY_ORDER, 9))

    orders = parse_order_history(text)

    assert [o.order_number for o in orders] == [LUFFY_ORDER, ZORO_ORDER]
    assert orders[0].lines[0].qty == 1


def test_tracking_links_depend_on_the_carrier_1433():
    assert tracking_url_for("1Z999AA10123456780") == "https://www.ups.com/track?tracknum=1Z999AA10123456780"
    assert tracking_url_for("9400100000000000000001") == (
        "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000001"
    )
    assert tracking_url_for("LX123456789CN") == ""
    assert tracking_url_for("") == ""


def test_only_an_order_history_page_is_detected_as_one_1433():
    assert looks_like_order_history(PDF_TEXT) and looks_like_order_history(PASTE_TEXT)
    assert not looks_like_order_history("Qty\tDescription\n3\tMonkey D. Luffy")
    assert not looks_like_order_history(f"Order {LUFFY_ORDER} was shipped")
    assert not looks_like_order_history("Rarity: SR\nCondition: Near Mint $1.00 1")


# --- preview and import ------------------------------------------------------------------------


def _alt_printing(db) -> None:
    db.add(
        CatalogPrinting(
            card_id="OP01-001",
            product_id=1009,
            name="Monkey D. Luffy (001) (Parallel)",
            market_price=9.0,
            low_price=9.0,
            tcgplayer_url="https://example.test/1009",
            image_url="",
            group_name="Test Set",
            is_special=1,
        )
    )
    db.commit()


def _group(db):
    """Host needs 2 Luffy + 1 Zoro, friend 2 Luffy (one as the Parallel art). Nami is nobody's."""
    add_catalog(db, "OP01-001", name="Monkey D. Luffy", product_id=1001, market=2.5)
    _alt_printing(db)
    add_catalog(db, "OP01-025", name="Roronoa Zoro", product_id=2001, market=4.0)
    add_catalog(db, "OP01-016", name="Nami", product_id=3001, market=0.25)
    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2, "OP01-025": 1})
    friend_deck = add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 2})
    for u in (host, friend):
        for card in ("OP01-001", "OP01-025"):
            set_owned(db, u, card, 0)
    deck_svc.set_deck_card_printing(db, friend, friend_deck.id, "OP01-001", 1009, 1)
    created = group_buy.create_group_buy(db, host, "History")
    group_buy.join_group_buy(db, friend, created.invite_token)
    group_buy.lock_group_buy(db, host, created.id)
    return host, friend, created.id


def _lines(preview_order):
    return {(l.card_id, l.product_id): l for l in preview_order.lines}


def test_preview_lists_each_order_with_who_gets_what_and_flags_1433(db):
    host, friend, gid = _group(db)
    group_buy.import_order_history(db, host, gid, PASTE_TEXT, [ZORO_ORDER])

    preview = group_buy.preview_order_history(db, host, gid, PASTE_TEXT)

    luffy, zoro, nami = preview.orders
    assert [o.order_number for o in preview.orders] == [LUFFY_ORDER, ZORO_ORDER, NAMI_ORDER]
    assert (luffy.already_added, zoro.already_added, nami.already_added) == (False, True, False)
    assert (luffy.in_group_buy, zoro.in_group_buy, nami.in_group_buy) == (True, True, False)
    assert luffy.seller_name == "Grand Line Singles"
    assert luffy.tracking_url == "https://www.ups.com/track?tracknum=1Z999AA10123456784"
    assert nami.tracking_url == ""
    by = _lines(luffy)
    assert by[("OP01-001", 1009)].qty == 1
    assert [(a.display_name, a.qty) for a in by[("OP01-001", 1009)].allocations] == [("Friend", 1)]
    assert by[("OP01-001", None)].qty == 2 and by[("OP01-001", None)].qty_extra == 0
    assert [(u.qty, u.card_name) for u in zoro.unmatched] == [(1, "Mystery Promo Card")]
    assert [l.card_id for l in nami.lines] == ["OP01-016"]


def test_a_later_order_in_the_preview_only_gets_what_earlier_ones_left_1433(db):
    host, _friend, gid = _group(db)
    a, b = "11111111-AAAAAA-11111", "22222222-BBBBBB-22222"

    preview = group_buy.preview_order_history(db, host, gid, _page((a, 3), (b, 3)))

    first, second = (o.lines[0] for o in preview.orders)
    assert (sum(x.qty for x in first.allocations), first.qty_extra) == (3, 0)
    assert (sum(x.qty for x in second.allocations), second.qty_extra) == (1, 2)


def test_import_adds_only_the_chosen_orders_in_page_order_1433(db):
    host, friend, gid = _group(db)

    done = group_buy.import_order_history(db, host, gid, PASTE_TEXT, [NAMI_ORDER, LUFFY_ORDER])

    orders = done.detail.orders
    assert [o.order_number for o in orders] == [LUFFY_ORDER, NAMI_ORDER]
    assert done.order_ids == [o.id for o in orders]
    luffy = orders[0]
    assert (luffy.seller_name, luffy.qty_ordered, luffy.qty_allocated) == ("Grand Line Singles", 3, 3)
    assert luffy.tracking_url == "https://www.ups.com/track?tracknum=1Z999AA10123456784"
    alt = next(l for l in luffy.lines if l.product_id == 1009)
    assert [(a.display_name, a.qty) for a in alt.allocations] == [("Friend", 1)]
    assert orders[1].tracking_url == ""
    assert done.detail.status == "ordered"
    assert done.unmatched == []


def test_orders_imported_together_split_the_copies_between_them_1433(db):
    host, _friend, gid = _group(db)
    a, b = "11111111-AAAAAA-11111", "22222222-BBBBBB-22222"

    done = group_buy.import_order_history(db, host, gid, _page((a, 3), (b, 3)), [a, b])

    first, second = done.detail.orders
    assert (first.qty_ordered, first.qty_allocated, first.qty_extra) == (3, 3, 0)
    assert (second.qty_ordered, second.qty_allocated, second.qty_extra) == (3, 1, 2)


def test_stored_receipt_text_holds_the_items_and_no_address_1433(db):
    host, _friend, gid = _group(db)

    group_buy.import_order_history(db, host, gid, PASTE_TEXT, [LUFFY_ORDER, ZORO_ORDER, NAMI_ORDER])

    stored = [o.receipt_text for o in db.scalars(select(GroupBuyOrder).where(GroupBuyOrder.group_buy_id == gid))]
    assert len(stored) == 3
    assert all("Example Street" not in t and "Sample Road" not in t and "Test Buyer" not in t for t in stored)
    luffy = next(t for t in stored if "Parallel" in t)
    assert luffy.splitlines() == [
        "1\tTest Set - Monkey D. Luffy (001) (Parallel) - Near Mint Foil",
        "2\tTest Set - Monkey D. Luffy (001) - Near Mint",
    ]


def test_import_skips_an_order_already_added_and_refuses_one_not_on_the_page_1433(db):
    host, _friend, gid = _group(db)
    group_buy.import_order_history(db, host, gid, PASTE_TEXT, [LUFFY_ORDER])

    again = group_buy.import_order_history(db, host, gid, PASTE_TEXT, [LUFFY_ORDER, ZORO_ORDER])
    assert [o.order_number for o in again.detail.orders] == [LUFFY_ORDER, ZORO_ORDER]
    assert len(again.order_ids) == 1

    with pytest.raises(Invalid, match="not on that page"):
        group_buy.import_order_history(db, host, gid, PASTE_TEXT, [NAMI_ORDER, "00000000-000000-00000"])
    assert [o.order_number for o in group_buy.get_group_buy(db, host, gid).orders] == [LUFFY_ORDER, ZORO_ORDER]


def test_text_with_no_orders_in_it_is_refused_1433(db):
    host, _friend, gid = _group(db)

    with pytest.raises(Invalid, match="No TCGplayer orders"):
        group_buy.preview_order_history(db, host, gid, "Qty\tDescription\n3\tMonkey D. Luffy")


def test_only_the_host_can_preview_or_import_an_order_history_1433(db):
    host, friend, gid = _group(db)

    with pytest.raises(Forbidden):
        group_buy.preview_order_history(db, friend, gid, PASTE_TEXT)
    with pytest.raises(Forbidden):
        group_buy.import_order_history(db, friend, gid, PASTE_TEXT, [LUFFY_ORDER])
    assert not db.scalars(select(GroupBuyOrder)).all()


# --- PDF ---------------------------------------------------------------------------------------


def _blank_pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _http_group(S):
    host = make_http_user(S, "host")
    friend = make_http_user(S, "friend")
    with S() as db:
        add_catalog(db, "OP01-001", name="Monkey D. Luffy", product_id=1001, market=2.5)
        add_catalog(db, "OP01-025", name="Roronoa Zoro", product_id=2001, market=4.0)
        for uid in (host, friend):
            add_deck_with_cards(db, db.get(User, uid), "D", {"OP01-001": 2, "OP01-025": 1})
        created = group_buy.create_group_buy(db, db.get(User, host), "Http")
        group_buy.join_group_buy(db, db.get(User, friend), created.invite_token)
        gid = created.id
    return host, friend, gid


def test_a_saved_pdf_page_is_read_previewed_and_imported_1433(client):
    c, S = client
    host, friend, gid = _http_group(S)
    assert as_user(c, host).post(f"/group-buys/{gid}/lock").status_code == 200
    pdf = SAMPLE_PDF.read_bytes()

    res = as_user(c, host).post(
        f"/group-buys/{gid}/orders/history/pdf", files=[("files", ("orders.pdf", pdf, "application/pdf"))]
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert [o["order_number"] for o in body["orders"]] == [LUFFY_ORDER, ZORO_ORDER]
    assert [o["seller_name"] for o in body["orders"]] == ["Grand Line Singles", "Thousand Sunny Cards"]
    assert [o["in_group_buy"] for o in body["orders"]] == [True, True]
    assert body["orders"][0]["tracking_url"].startswith("https://www.ups.com/track?tracknum=1Z")

    imported = as_user(c, host).post(
        f"/group-buys/{gid}/orders/history/import", json={"text": body["text"], "order_numbers": [LUFFY_ORDER, ZORO_ORDER]}
    )
    assert imported.status_code == 200, imported.text
    assert [o["order_number"] for o in imported.json()["detail"]["orders"]] == [LUFFY_ORDER, ZORO_ORDER]
    assert len(imported.json()["order_ids"]) == 2
    assert [o["qty_ordered"] for o in imported.json()["detail"]["orders"]] == [3, 1]


def test_a_pdf_upload_is_refused_for_non_hosts_and_bad_files_1433(client):
    c, S = client
    host, friend, gid = _http_group(S)
    assert as_user(c, host).post(f"/group-buys/{gid}/lock").status_code == 200
    url = f"/group-buys/{gid}/orders/history/pdf"

    not_pdf = as_user(c, host).post(url, files=[("files", ("orders.pdf", b"just some text", "application/pdf"))])
    broken = as_user(c, host).post(url, files=[("files", ("orders.pdf", b"%PDF-1.7\nnot really", "application/pdf"))])
    non_host = as_user(c, friend).post(url, files=[("files", ("o.pdf", SAMPLE_PDF.read_bytes(), "application/pdf"))])

    assert not_pdf.status_code == 400 and "orders.pdf: That file is not a PDF" in not_pdf.json()["detail"]
    assert broken.status_code == 400 and "Couldn't read that PDF" in broken.json()["detail"]
    assert non_host.status_code == 403


def test_a_pdf_over_the_size_or_page_limit_is_refused_1433():
    with pytest.raises(Invalid, match="too big"):
        extract_order_history_text(b"%PDF-" + b"0" * (5 * 1024 * 1024))
    with pytest.raises(Invalid, match="too many pages"):
        extract_order_history_text(_blank_pdf(31))
    with pytest.raises(Invalid, match="any text"):
        extract_order_history_text(_blank_pdf(2))
    with pytest.raises(Invalid, match="Couldn't read that PDF"):
        extract_order_history_text(b"%PDF-1.7\nnot really")


# --- several PDFs at once (#1437) ---------------------------------------------------------------


def _upload(c, user, gid, pdfs, text=None):
    files = [("files", (name, data, "application/pdf")) for name, data in pdfs]
    return as_user(c, user).post(
        f"/group-buys/{gid}/orders/history/pdf", files=files, data={"text": text} if text is not None else None
    )


def _locked_group(c, S):
    host, _friend, gid = _http_group(S)
    assert as_user(c, host).post(f"/group-buys/{gid}/lock").status_code == 200
    return host, gid


def _numbers(res):
    return [o["order_number"] for o in res.json()["orders"]]


def test_two_different_pdfs_give_the_union_of_their_orders_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)

    res = _upload(c, host, gid, [("page1.pdf", SAMPLE_PDF.read_bytes()), ("page2.pdf", PAGE2_PDF.read_bytes())])

    assert res.status_code == 200, res.text
    assert _numbers(res) == [LUFFY_ORDER, ZORO_ORDER, NAMI_ORDER]
    assert {LUFFY_ORDER, NAMI_ORDER} <= set(_by_number(res.json()["text"]))


def test_the_same_pdf_twice_lists_each_order_once_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)
    pdf = SAMPLE_PDF.read_bytes()

    res = _upload(c, host, gid, [("a.pdf", pdf), ("b.pdf", pdf)])

    assert res.status_code == 200, res.text
    assert _numbers(res) == [LUFFY_ORDER, ZORO_ORDER]


def test_the_same_order_in_two_files_shows_once_with_the_first_files_items_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)
    first = _page((LUFFY_ORDER, 2))
    again = _page((LUFFY_ORDER, 7), ("11223344-556677-88990", 1))
    # Plain-text "PDFs" are not PDFs, so go through the text field the dialog sends back.
    res = _upload(c, host, gid, [("p.pdf", PAGE2_PDF.read_bytes())], text=first + "\n" + again)

    assert res.status_code == 200, res.text
    assert _numbers(res) == [LUFFY_ORDER, "11223344-556677-88990", NAMI_ORDER]
    luffy = next(o for o in res.json()["orders"] if o["order_number"] == LUFFY_ORDER)
    assert sum(line["qty"] for line in luffy["lines"]) == 2


def test_text_already_in_the_dialog_is_kept_when_a_file_is_added_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)

    res = _upload(c, host, gid, [("page2.pdf", PAGE2_PDF.read_bytes())], text=PDF_TEXT)

    assert res.status_code == 200, res.text
    assert _numbers(res) == [f"A000000{i}-B0000{i}-C000{i}" for i in range(10)] + [NAMI_ORDER]
    assert res.json()["text"].startswith(PDF_TEXT.strip()) and res.json()["text"].endswith("FIRST 1 LAST")


def test_more_than_ten_pdfs_at_once_are_refused_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)
    pdf = SAMPLE_PDF.read_bytes()

    ten = _upload(c, host, gid, [(f"p{i}.pdf", pdf) for i in range(10)])
    eleven = _upload(c, host, gid, [(f"p{i}.pdf", pdf) for i in range(11)])

    assert ten.status_code == 200, ten.text
    assert eleven.status_code == 400
    assert eleven.json()["detail"] == "Upload at most 10 PDFs at once"


def test_a_bad_file_in_the_batch_is_named_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)

    res = _upload(
        c,
        host,
        gid,
        [("page1.pdf", SAMPLE_PDF.read_bytes()), ("page2.pdf", b"just some text"), ("page3.pdf", PAGE2_PDF.read_bytes())],
    )

    assert res.status_code == 400
    assert res.json()["detail"] == "page2.pdf: That file is not a PDF"


def test_pages_that_are_too_long_together_are_refused_1437(client):
    c, S = client
    host, gid = _locked_group(c, S)

    res = _upload(c, host, gid, [("page2.pdf", PAGE2_PDF.read_bytes())], text="x" * MAX_TEXT_CHARS)

    assert res.status_code == 400
    assert "too much text" in res.json()["detail"]
