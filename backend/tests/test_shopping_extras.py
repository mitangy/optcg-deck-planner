from __future__ import annotations

import pytest

from app.planner import shopping as shopping_svc, owned as owned_svc, share as share_svc
from tests.test_abuse_limits import _signed_in, client  # noqa: F401  (fixture)
from tests.conftest import add_catalog, add_deck_with_cards, make_user, set_owned


def _item(shop, card_id):
    return next(i for i in shop.items if i.card_id == card_id)


def _setup(db, email="extra@example.com"):
    add_catalog(db, "OP01-001", name="Luffy", product_id=1, market=2.0)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=3.0)
    return make_user(db, email=email, name="Extra", sub="sub-" + email)


def test_extra_only_card_lists_with_still_need_target_minus_owned_525(db):
    user = _setup(db)
    shopping_svc.set_shopping_extra(db, user, "op01-002", 3)
    set_owned(db, user, "OP01-002", 1)

    zoro = _item(shopping_svc.shopping_list(db, user), "OP01-002")

    assert (zoro.need, zoro.owned, zoro.still_need) == (3, 1, 2)
    assert zoro.extra_qty == 3
    assert zoro.deck_need == 0
    assert zoro.used_in == []
    assert zoro.deck_sort_key == "9999-9999-9999"
    assert zoro.primary_leader_card_id is None

    set_owned(db, user, "OP01-002", 3)
    zoro = _item(shopping_svc.shopping_list(db, user), "OP01-002")
    assert zoro.still_need == 0


def test_extra_sorts_after_deck_cards_525(db):
    user = _setup(db)
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 1)

    shop = shopping_svc.shopping_list(db, user)
    keys = {i.card_id: i.deck_sort_key for i in shop.items}

    assert keys["OP01-001"] < keys["OP01-002"]


@pytest.mark.parametrize("extra,expected", [(2, 4), (5, 5)])
def test_extra_combines_with_deck_by_max_not_sum_525(db, extra, expected):
    user = _setup(db)
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 4})
    shopping_svc.set_shopping_extra(db, user, "OP01-001", extra)

    luffy = _item(shopping_svc.shopping_list(db, user), "OP01-001")

    assert luffy.need == expected
    assert luffy.deck_need == 4
    assert luffy.extra_qty == extra


def test_extra_is_max_not_a_leader_when_summing_across_leaders_525(db):
    add_catalog(db, "LUF", name="Luffy L", product_id=10, market=1.0)
    add_catalog(db, "ZOR", name="Zoro L", product_id=11, market=1.0)
    user = _setup(db)
    user.sum_across_leaders = True
    db.commit()
    from app.planner.models import Deck

    a = add_deck_with_cards(db, user, "Luffy deck", {"OP01-001": 3})
    b = add_deck_with_cards(db, user, "Zoro deck", {"OP01-001": 2})
    for deck, leader in ((a, "LUF"), (b, "ZOR")):
        db.get(Deck, deck.id).leader_card_id = leader
    db.commit()
    shopping_svc.set_shopping_extra(db, user, "OP01-001", 4)

    luffy = _item(shopping_svc.shopping_list(db, user), "OP01-001")
    # Leaders sum to 5; the extra target 4 is not a third leader (would be 9).
    assert luffy.deck_need == 5
    assert luffy.need == 5
    assert luffy.need_by_leader and len(luffy.need_by_leader) == 2

    shopping_svc.set_shopping_extra(db, user, "OP01-001", 8)
    luffy = _item(shopping_svc.shopping_list(db, user), "OP01-001")
    assert luffy.need == 8
    assert len(luffy.need_by_leader) == 2


def test_extra_qty_zero_removes_the_row_525(db):
    user = _setup(db)
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)
    assert shopping_svc.set_shopping_extra(db, user, "OP01-002", 0) == 0

    assert shopping_svc.shopping_list(db, user).items == []
    # Setting again after removal re-adds it (the row was really deleted).
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 1)
    assert _item(shopping_svc.shopping_list(db, user), "OP01-002").extra_qty == 1


def test_extras_ignore_deck_filter_but_extras_false_excludes_them_525(db):
    user = _setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 2})
    add_deck_with_cards(db, user, "Deck B", {"OP01-001": 4})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)

    filtered = shopping_svc.shopping_list(db, user, deck_ids=[deck.id])
    assert {i.card_id for i in filtered.items} == {"OP01-001", "OP01-002"}
    assert _item(filtered, "OP01-001").need == 2

    none = shopping_svc.shopping_list(db, user, deck_ids=[deck.id], include_extras=False)
    assert {i.card_id for i in none.items} == {"OP01-001"}


def test_extras_are_private_to_their_user_525(db):
    user = _setup(db)
    other = make_user(db, email="other@example.com", name="Other", sub="sub-other")
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)

    assert shopping_svc.shopping_list(db, other).items == []
    shopping_svc.set_shopping_extra(db, other, "OP01-002", 0)
    assert _item(shopping_svc.shopping_list(db, user), "OP01-002").extra_qty == 2


def test_extra_for_unknown_card_is_rejected_525(db):
    user = _setup(db)
    with pytest.raises(LookupError):
        shopping_svc.set_shopping_extra(db, user, "ZZ99-999", 1)
    assert shopping_svc.shopping_list(db, user).items == []


def test_collection_buying_counts_still_need_from_decks_and_extras_525(db):
    user = _setup(db)
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 4})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 3)
    set_owned(db, user, "OP01-001", 1)
    set_owned(db, user, "OP01-002", 2)

    by_id = {i.card_id: i for i in owned_svc.owned_collection(db, user).items}

    assert by_id["OP01-001"].buying == 3
    assert by_id["OP01-002"].buying == 1

    set_owned(db, user, "OP01-002", 3)
    by_id = {i.card_id: i for i in owned_svc.owned_collection(db, user).items}
    assert by_id["OP01-002"].buying == 0


def test_shopping_extras_http_put_get_flags_and_unknown_card_404_525(client):
    c, SessionLocal = client
    _signed_in(c, SessionLocal)
    with SessionLocal() as db:
        add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=3.0)

    assert c.put("/shopping/extras/op01-002", json={"qty": 2}).json() == {
        "card_id": "OP01-002",
        "qty": 2,
    }
    assert c.put("/shopping/extras/ZZ99-999", json={"qty": 1}).status_code == 404
    assert c.put("/shopping/extras/OP01-002", json={"qty": -1}).status_code == 422

    items = c.get("/shopping").json()["items"]
    assert [(i["card_id"], i["extra_qty"], i["still_need"]) for i in items] == [("OP01-002", 2, 2)]
    assert c.get("/shopping", params={"extras": "false"}).json()["items"] == []

    c.put("/shopping/extras/OP01-002", json={"qty": 0})
    assert c.get("/shopping").json()["items"] == []


def _share_setup(db):
    user = _setup(db, email="sharer@example.com")
    add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)
    return user


def _public_ids(db, token):
    return sorted(i.card_id for i in share_svc.public_share_view(db, token).items)


def test_share_made_with_extras_off_hides_added_directly_cards_527(db):
    user = _share_setup(db)

    info = share_svc.create_or_update_share(db, user, "shopping", include_extras=False)

    assert info.include_extras is False
    assert _public_ids(db, info.token) == ["OP01-001"]


def test_share_without_the_flag_still_includes_extras_527(db):
    user = _share_setup(db)

    info = share_svc.create_or_update_share(db, user, "shopping")

    assert info.include_extras is True
    assert _public_ids(db, info.token) == ["OP01-001", "OP01-002"]


def test_old_share_link_row_defaults_to_including_extras_527(db):
    from app.planner.models import ShareLink

    user = _share_setup(db)
    db.add(ShareLink(user_id=user.id, token="old-token", kind="shopping"))
    db.commit()

    assert _public_ids(db, "old-token") == ["OP01-001", "OP01-002"]
    assert share_svc.get_active_shopping_share(db, user).include_extras is True


def test_resharing_follows_the_latest_extras_choice_527(db):
    user = _share_setup(db)
    first = share_svc.create_or_update_share(db, user, "shopping", include_extras=False)

    again = share_svc.create_or_update_share(db, user, "shopping", include_extras=True)
    assert again.token == first.token
    assert _public_ids(db, first.token) == ["OP01-001", "OP01-002"]

    share_svc.create_or_update_share(db, user, "shopping", include_extras=False)
    assert _public_ids(db, first.token) == ["OP01-001"]
    assert share_svc.get_active_shopping_share(db, user).include_extras is False


def test_share_http_extras_off_hides_them_on_the_public_page_527(client):
    c, SessionLocal = client
    _signed_in(c, SessionLocal)
    with SessionLocal() as db:
        add_catalog(db, "OP01-002", name="Zoro", product_id=2, market=3.0)
    c.put("/shopping/extras/OP01-002", json={"qty": 2})

    shared = c.post("/share", json={"kind": "shopping", "include_extras": False}).json()
    assert shared["include_extras"] is False
    assert c.get(f"/public/share/{shared['token']}").json()["items"] == []

    c.post("/share", json={"kind": "shopping", "include_extras": True})
    items = c.get(f"/public/share/{shared['token']}").json()["items"]
    assert [i["card_id"] for i in items] == ["OP01-002"]


# ---- Alt picks on Master Shopping cards (#872) ----


def _alt_setup(db, email="alt872@example.com"):
    user = _setup(db, email=email)
    add_catalog(db, "OP01-001", name="Luffy", product_id=1009, market=9.0, special=True)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2009, market=7.0, special=True)
    return user


def _wanted(db, user, card_id, pid):
    alts = _item(shopping_svc.shopping_list(db, user), card_id).alt_arts
    return next(a.wanted for a in alts if a.product_id == pid)


def test_alt_pick_saves_for_a_card_added_only_from_master_shopping_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)

    shown, _ = owned_svc.set_user_card_printing(
        db, user, "OP01-002", 2009, 1, deck_ids=[deck.id]
    )

    assert shown == 1
    assert _wanted(db, user, "OP01-002", 2009) == 1


def test_alt_pick_above_the_deck_count_sticks_when_master_shopping_wants_more_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 2})
    shopping_svc.set_shopping_extra(db, user, "OP01-001", 4)

    shown, _ = owned_svc.set_user_card_printing(
        db, user, "OP01-001", 1009, 3, deck_ids=[deck.id]
    )

    assert shown == 3
    assert _wanted(db, user, "OP01-001", 1009) == 3


def test_alt_pick_never_exceeds_the_master_shopping_want_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 2})
    shopping_svc.set_shopping_extra(db, user, "OP01-001", 4)

    shown, _ = owned_svc.set_user_card_printing(
        db, user, "OP01-001", 1009, 9, deck_ids=[deck.id]
    )

    assert shown == 4
    assert _wanted(db, user, "OP01-001", 1009) == 4


def test_lowering_an_alt_pick_on_a_master_shopping_card_lowers_it_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 3)

    owned_svc.set_user_card_printing(db, user, "OP01-002", 2009, 2, deck_ids=[deck.id])
    shown, _ = owned_svc.set_user_card_printing(
        db, user, "OP01-002", 2009, 1, deck_ids=[deck.id]
    )

    assert shown == 1
    assert _wanted(db, user, "OP01-002", 2009) == 1


def test_removing_the_master_shopping_card_clears_its_alt_picks_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)
    owned_svc.set_user_card_printing(db, user, "OP01-002", 2009, 2, deck_ids=[deck.id])

    shopping_svc.set_shopping_extra(db, user, "OP01-002", 0)
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 2)

    assert _wanted(db, user, "OP01-002", 2009) == 0


def _two_alt_extra(db, want):
    user = _alt_setup(db)
    add_catalog(db, "OP01-002", name="Zoro", product_id=2010, market=6.0, special=True)
    shopping_svc.set_shopping_extra(db, user, "OP01-002", want)
    return user


def test_lowering_want_clamps_saved_alt_picks_so_a_later_minus_stays_on_that_art_873(db):
    user = _two_alt_extra(db, 4)
    owned_svc.set_user_card_printing(db, user, "OP01-002", 2009, 2)
    owned_svc.set_user_card_printing(db, user, "OP01-002", 2010, 2)

    shopping_svc.set_shopping_extra(db, user, "OP01-002", 3)
    assert _wanted(db, user, "OP01-002", 2009) == 1
    assert _wanted(db, user, "OP01-002", 2010) == 2

    owned_svc.set_user_card_printing(db, user, "OP01-002", 2010, 1)

    assert _wanted(db, user, "OP01-002", 2009) == 1
    assert _wanted(db, user, "OP01-002", 2010) == 1


def test_raising_want_back_does_not_resurrect_trimmed_alt_picks_873(db):
    user = _two_alt_extra(db, 3)
    owned_svc.set_user_card_printing(db, user, "OP01-002", 2009, 3)

    shopping_svc.set_shopping_extra(db, user, "OP01-002", 1)
    shopping_svc.set_shopping_extra(db, user, "OP01-002", 3)

    assert _wanted(db, user, "OP01-002", 2009) == 1


def test_alt_pick_for_a_card_in_no_deck_and_no_extra_is_refused_872(db):
    user = _alt_setup(db)
    deck = add_deck_with_cards(db, user, "Deck A", {"OP01-001": 1})

    with pytest.raises(LookupError):
        owned_svc.set_user_card_printing(db, user, "OP01-002", 2009, 1, deck_ids=[deck.id])
