"""Skip an Extra copy in one group buy without touching the Shopping list (#1269)."""

from __future__ import annotations

import pytest

from app.core.errors import Forbidden
from app.group_buy import service as group_buy
from app.planner import owned as owned_svc, shopping as shopping_svc
from tests.conftest import add_catalog, add_deck_with_cards, make_user

SHANKS = "OP01-001"
LUFFY = "OP01-002"
SHANKS_BASE, SHANKS_MANGA = 1001, 1009  # $2.50 base, $180 alt
LUFFY_BASE, LUFFY_PARALLEL = 1002, 1010  # $1 base, $12 alt


@pytest.fixture()
def member(db):
    add_catalog(db, SHANKS, name="Shanks", product_id=SHANKS_BASE, market=2.5)
    add_catalog(db, SHANKS, name="Shanks Manga", product_id=SHANKS_MANGA, market=180.0, special=True)
    add_catalog(db, LUFFY, name="Luffy", product_id=LUFFY_BASE, market=1.0)
    add_catalog(db, LUFFY, name="Luffy Parallel", product_id=LUFFY_PARALLEL, market=12.0, special=True)
    user = make_user(db, email="skip@example.com", name="Skipper", sub="sub-skip")
    add_deck_with_cards(db, user, "Deck", {SHANKS: 4, LUFFY: 4})
    owned_svc.set_collector_want(db, user, SHANKS, SHANKS_MANGA, 1)
    owned_svc.set_collector_want(db, user, LUFFY, LUFFY_PARALLEL, 1)
    return user


@pytest.fixture()
def group(db, member):
    created = group_buy.create_group_buy(db, member, "Skip")
    group_buy.update_contribution(db, member, created.id, deck_ids=None, include_extra_copies=True)
    return created


def _line(detail, card_id):
    return next(l for l in detail.lines if l.card_id == card_id)


def _wants(line):
    return sorted((w.product_id, w.qty) for w in line.art_wants)


def test_skipping_one_cards_extra_leaves_the_other_cards_extra_in_the_buy_1269(db, member, group):
    before = group_buy.get_group_buy(db, member, group.id)
    assert (_line(before, SHANKS).my_qty, _line(before, LUFFY).my_qty) == (5, 5)

    after = group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 1)
    shanks, luffy = _line(after, SHANKS), _line(after, LUFFY)

    assert (shanks.my_qty, shanks.my_suggested_qty, shanks.my_deck_qty) == (4, 4, 4)
    assert shanks.remaining_cost == 10.0  # 4 base copies, no $180 Manga
    assert _wants(shanks) == [(SHANKS_BASE, 4)]
    assert [(e.product_id, e.wanted, e.skipped) for e in shanks.my_extras] == [(SHANKS_MANGA, 1, 1)]
    assert (luffy.my_qty, luffy.remaining_cost) == (5, 16.0)  # 4 base + the $12 Parallel
    assert (LUFFY_PARALLEL, 1) in _wants(luffy)
    # The Shopping list still wants the Manga copy.
    shop = shopping_svc.shopping_list(db, member, include_collector=True, show_collector=True)
    item = next(i for i in shop.items if i.card_id == SHANKS)
    assert [c.still_need for c in item.collector_wants] == [1]

    restored = group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 0)
    assert _line(restored, SHANKS).my_qty == 5


def test_lowering_your_buy_drops_the_extra_before_a_deck_copy_1269(db, member, group):
    after = group_buy.set_member_qty(db, member, group.id, SHANKS, 4)
    line = _line(after, SHANKS)

    assert line.my_qty == 4
    assert _wants(line) == [(SHANKS_BASE, 4)]  # four base copies, the Manga is what went
    assert line.remaining_cost == 10.0


def test_skipping_an_extra_in_a_locked_group_buy_is_refused_1269(db, member, group):
    group_buy.lock_group_buy(db, member, group.id)
    with pytest.raises(Forbidden):
        group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 1)


def test_skipping_an_extra_keeps_a_custom_qty_the_extra_never_funded_1289(db, member, group):
    group_buy.set_member_qty(db, member, group.id, SHANKS, 3)  # custom, below the 4 deck copies + Manga
    after = group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 1)
    line = _line(after, SHANKS)

    assert line.my_qty == 3  # the Manga was never in a 3-copy buy, so no deck copy goes
    assert line.my_suggested_qty == 4


def test_unticking_an_extra_keeps_a_custom_qty_equal_to_the_deck_copies_1289(db, member, group):
    group_buy.set_member_qty(db, member, group.id, SHANKS, 4)
    after = group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 1)
    line = _line(after, SHANKS)

    assert line.my_qty == 4
    assert _wants(line) == [(SHANKS_BASE, 4)]
    assert line.remaining_cost == 10.0


def test_skipping_an_extra_lowers_a_custom_qty_that_funded_it_by_the_same_copies_1269(db, member, group):
    owned_svc.set_collector_want(db, member, SHANKS, SHANKS_MANGA, 2)  # suggested 6: 4 deck + 2 Manga
    group_buy.set_member_qty(db, member, group.id, SHANKS, 5)  # custom: 4 deck + 1 Manga
    after = group_buy.set_extra_skip(db, member, group.id, SHANKS, SHANKS_MANGA, 1)
    line = _line(after, SHANKS)

    assert line.my_suggested_qty == 5
    assert line.my_qty == 4  # the funded Manga copy leaves the buy; still a custom qty below the suggestion


def test_leaving_a_group_buy_forgets_skipped_extras_on_rejoin_1289(db, member, group):
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, friend, "Friend deck", {SHANKS: 4})
    owned_svc.set_collector_want(db, friend, SHANKS, SHANKS_MANGA, 1)
    group_buy.join_group_buy(db, friend, group.invite_token)
    group_buy.update_contribution(db, friend, group.id, deck_ids=None, include_extra_copies=True)
    skipped = group_buy.set_extra_skip(db, friend, group.id, SHANKS, SHANKS_MANGA, 1)
    assert _line(skipped, SHANKS).my_qty == 4

    group_buy.leave_group_buy(db, friend, group.id)
    group_buy.join_group_buy(db, friend, group.invite_token)
    group_buy.update_contribution(db, friend, group.id, deck_ids=None, include_extra_copies=True)
    line = _line(group_buy.get_group_buy(db, friend, group.id), SHANKS)

    assert line.my_qty == 5
    assert [(e.product_id, e.skipped) for e in line.my_extras] == [(SHANKS_MANGA, 0)]
