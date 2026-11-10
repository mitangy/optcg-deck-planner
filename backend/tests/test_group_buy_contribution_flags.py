"""Group buy contribution settings: singles and Extra copies (#1177)."""

from __future__ import annotations

import pytest

from app.core.models import User
from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuyMember
from app.planner import decks as deck_svc, owned as owned_svc, shopping as shopping_svc
from tests.conftest import add_catalog, add_deck_with_cards, make_user
from tests.friend_support import as_user, client, make_user as http_make_user  # noqa: F401

LUFFY = "OP01-001"
ZORO = "OP01-002"
BASE = 1001
GOLD = 1009


@pytest.fixture()
def member(db):
    add_catalog(db, LUFFY, name="Luffy", product_id=BASE, market=2.5)
    add_catalog(db, ZORO, name="Zoro", product_id=1002, market=1.0)
    add_catalog(db, LUFFY, name="Luffy", product_id=GOLD, market=9.0, special=True)
    user = make_user(db, email="solo@example.com", name="Solo", sub="sub-solo")
    add_deck_with_cards(db, user, "Deck", {LUFFY: 2})  # Zoro is in no deck
    shopping_svc.set_shopping_extra(db, user, ZORO, 3)  # a single added directly
    owned_svc.set_collector_want(db, user, LUFFY, GOLD, 2)  # Extra copy of the gold
    return user


def _line(detail, card_id):
    return next((l for l in detail.lines if l.card_id == card_id), None)


def _mine(line, user):
    return next(m.qty for m in line.members if m.user_id == user.id)


def test_cards_not_in_a_deck_leave_the_contribution_when_unchecked_1177(db, member):
    created = group_buy.create_group_buy(db, member, "Singles")
    assert _mine(_line(created, ZORO), member) == 3  # today's behavior is the default

    detail = group_buy.update_contribution(
        db, member, created.id, None, include_singles=False
    )

    zoro = _line(detail, ZORO)
    assert zoro is None or zoro.total_qty == 0
    assert _line(detail, LUFFY).total_qty == 2  # deck cards stay


def test_extra_copies_are_off_by_default_and_added_priced_as_the_alt_when_on_1177(db, member):
    created = group_buy.create_group_buy(db, member, "Extras")
    luffy = _line(created, LUFFY)
    assert _mine(luffy, member) == 2
    assert luffy.remaining_cost == 5.0

    detail = group_buy.update_contribution(
        db, member, created.id, None, include_extra_copies=True
    )

    luffy = _line(detail, LUFFY)
    assert _mine(luffy, member) == 4
    assert sorted((w.product_id, w.qty) for w in luffy.art_wants if w.user_id == member.id) == [
        (BASE, 2),
        (GOLD, 2),
    ]
    assert luffy.remaining_cost == round(2 * 9.0 + 2 * 2.5, 2)


def test_export_lists_extra_copies_at_the_alt_product_1177(db, member):
    created = group_buy.create_group_buy(db, member, "Export")
    before = group_buy.export_tcgplayer(db, member, created.id).paste_text.splitlines()
    assert f"2-{GOLD}" not in before

    group_buy.update_contribution(db, member, created.id, None, include_extra_copies=True)

    lines = group_buy.export_tcgplayer(db, member, created.id).paste_text.splitlines()
    assert f"2-{GOLD}" in lines
    assert f"2-{BASE}" in lines


def test_contribution_flags_persist_and_deck_only_put_keeps_them_1177(client):
    c, S = client
    host = http_make_user(S, "host")
    with S() as db:
        created = group_buy.create_group_buy(db, db.get(User, host), "Flags")
        gid = created.id

    api = as_user(c, host)
    r = api.put(
        f"/group-buys/{gid}/contribution",
        json={"deck_ids": None, "include_singles": False, "include_extra_copies": True},
    )
    assert r.status_code == 200
    me = next(m for m in r.json()["members"] if m["user_id"] == host)
    assert (me["include_singles"], me["include_extra_copies"]) == (False, True)

    # An older client that only sends deck_ids must not reset the flags.
    r = api.put(f"/group-buys/{gid}/contribution", json={"deck_ids": None})
    me = next(m for m in r.json()["members"] if m["user_id"] == host)
    assert (me["include_singles"], me["include_extra_copies"]) == (False, True)

    with S() as db:
        row = db.query(GroupBuyMember).filter_by(group_buy_id=gid, user_id=host).one()
        assert (row.include_singles, row.include_extra_copies) == (False, True)


def _shopping_item(db, user, card_id):
    shop = shopping_svc.shopping_list(db, user, include_collector=True, show_collector=False)
    return next(i for i in shop.items if i.card_id == card_id), shop


def test_group_buy_prices_an_owned_picked_alt_at_the_base_art_like_master_shopping_1216(db):
    add_catalog(db, LUFFY, name="Luffy", product_id=BASE, market=2.5)
    add_catalog(db, LUFFY, name="Luffy", product_id=GOLD, market=9.0, special=True)
    user = make_user(db, email="own@example.com", name="Own", sub="sub-own")
    deck = add_deck_with_cards(db, user, "Deck", {LUFFY: 4})
    deck_svc.set_deck_card_printing(db, user, deck.id, LUFFY, GOLD, 2)
    owned_svc.set_alt_owned(db, user, LUFFY, GOLD, 2)  # both picked golds already owned

    item, shop = _shopping_item(db, user, LUFFY)
    assert item.still_need == 2
    assert item.remaining_cost == 5.0  # 2 base copies; the owned golds are not bought again

    created = group_buy.create_group_buy(db, user, "Owned alt")
    line = _line(created, LUFFY)
    assert line.remaining_cost == item.remaining_cost
    assert created.remaining_market == shop.remaining_market
    assert group_buy.get_group_buy(db, user, created.id).cards_subtotal == shop.remaining_market


def test_group_buy_owned_alt_reserved_by_an_extra_copy_does_not_cover_the_deck_1216(db):
    add_catalog(db, LUFFY, name="Luffy", product_id=BASE, market=2.5)
    add_catalog(db, LUFFY, name="Luffy", product_id=GOLD, market=9.0, special=True)
    user = make_user(db, email="resv@example.com", name="Resv", sub="sub-resv")
    add_deck_with_cards(db, user, "Deck", {LUFFY: 2})
    owned_svc.set_alt_owned(db, user, LUFFY, GOLD, 2)
    owned_svc.set_collector_want(db, user, LUFFY, GOLD, 2)  # the owned golds are Extra copies

    item, _ = _shopping_item(db, user, LUFFY)  # Master Shopping with Extra copies hidden
    assert item.still_need == 2

    created = group_buy.create_group_buy(db, user, "Reserve")  # Extra copies unticked
    line = _line(created, LUFFY)
    assert _mine(line, user) == 2
    assert line.remaining_cost == item.remaining_cost == 5.0
