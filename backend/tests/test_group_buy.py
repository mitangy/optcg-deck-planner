from __future__ import annotations

import pytest

from app import group_buy
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


@pytest.fixture()
def two_players(db):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=1.0)
    add_catalog(
        db, "OP01-001", name="Luffy", product_id=1009, market=9.0, special=True
    )

    host = make_user(db, email="host@example.com", name="Host", sub="sub-host")
    friend = make_user(db, email="friend@example.com", name="Friend", sub="sub-friend")
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 4, "OP01-002": 2})
    add_deck_with_cards(db, friend, "Friend Deck", {"OP01-001": 3, "OP01-002": 4})
    set_owned(db, host, "OP01-001", 1)  # still need 3
    set_owned(db, friend, "OP01-002", 1)  # still need 3 of 002, 3 of 001
    return host, friend


def test_create_join_and_merge_sums_still_need(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Friday night", deck_ids=None)
    assert created.is_host
    assert created.member_count == 1
    assert created.status == "open"

    joined = group_buy.join_group_buy(db, friend, created.invite_token)
    assert joined.member_count == 2
    assert not joined.is_host

    # Host still needs 3 OP01-001 + 2 OP01-002; friend 3 + 3
    by_id = {line.card_id: line for line in joined.lines}
    assert by_id["OP01-001"].total_qty == 6
    assert by_id["OP01-002"].total_qty == 5
    assert {m.display_name: m.qty for m in by_id["OP01-001"].members} == {
        "Host": 3,
        "Friend": 3,
    }
    assert by_id["OP01-001"].product_id == 1001  # preferred standard printing


def test_lock_freezes_quantities_against_later_owned_changes(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Lock test")
    group_buy.join_group_buy(db, friend, created.invite_token)
    locked = group_buy.lock_group_buy(db, host, created.id)
    assert locked.status == "locked"
    before = {line.card_id: line.total_qty for line in locked.lines}

    # Friend buys their whole list after lock — live shopping would drop, snapshot must not.
    set_owned(db, friend, "OP01-001", 99)
    set_owned(db, friend, "OP01-002", 99)
    again = group_buy.get_group_buy(db, host, created.id)
    after = {line.card_id: line.total_qty for line in again.lines}
    assert after == before

    # New users cannot join locked pools.
    outsider = make_user(db, email="out@example.com", name="Out", sub="sub-out")
    with pytest.raises(PermissionError):
        group_buy.join_group_buy(db, outsider, created.invite_token)


def test_host_printing_override_and_export(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Export")
    group_buy.join_group_buy(db, friend, created.invite_token)
    updated = group_buy.set_line_override(db, host, created.id, "OP01-001", 1009)
    line = next(l for l in updated.lines if l.card_id == "OP01-001")
    assert line.product_id == 1009

    export = group_buy.export_tcgplayer(db, host, created.id)
    assert "6-1009" in export.paste_text.splitlines()
    assert "5-1002" in export.paste_text.splitlines()
    assert export.copy_count == 11
    assert export.with_product_id == 2


def test_member_cannot_lock(db, two_players):
    host, friend = two_players
    created = group_buy.create_group_buy(db, host, "Perms")
    group_buy.join_group_buy(db, friend, created.invite_token)
    with pytest.raises(PermissionError):
        group_buy.lock_group_buy(db, friend, created.id)


def test_contribution_deck_filter(db, two_players):
    host, _friend = two_players
    # Second deck for host with only OP01-002
    deck_b = add_deck_with_cards(db, host, "Only Zoro", {"OP01-002": 4})
    created = group_buy.create_group_buy(db, host, "Filtered", deck_ids=[deck_b.id])
    assert len(created.lines) == 1
    assert created.lines[0].card_id == "OP01-002"
    # Host owned 0 of 002 in fixture... wait host has deck with 002 need 2 and no owned for 002
    # With only deck_b, need 4 of 002, owned 0 → still 4
    assert created.lines[0].total_qty == 4
