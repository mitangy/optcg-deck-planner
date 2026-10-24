"""Friends' decks, collection and spares behind the privacy guard (#703)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app import services
from app.models import Deck, TradeKeep, User
from tests.friend_support import (  # noqa: F401  (client is a fixture)
    add_alt,
    add_card,
    as_user,
    befriend,
    client,
    make_deck,
    make_user,
    own,
    own_alt,
    request_only,
    share,
)

NOT_FOUND = {"detail": "Not found."}


def _pair(S):
    """Kai (the owner) and Me, his accepted friend."""
    kai, me = make_user(S, "Kai"), make_user(S, "Me")
    befriend(S, kai, me)
    return kai, me


# --- the guard ----------------------------------------------------------------


def test_a_stranger_cannot_see_your_decks_703(client):
    c, S = client
    kai, stranger = make_user(S, "Kai"), make_user(S, "Rando")
    share(c, kai, decks="friends", collection="friends", trades_open=True)
    make_deck(S, kai, "Red", {"OP01-001": 1})
    for path in ("profile", "decks", "decks/1", "collection", "spares"):
        r = as_user(c, stranger).get(f"/friends/{kai}/{path}")
        assert r.status_code == 404, path
        assert r.json() == NOT_FOUND


def test_a_pending_friend_request_does_not_open_your_pages_703(client):
    c, S = client
    kai, me = make_user(S, "Kai"), make_user(S, "Me")
    request_only(S, me, kai)
    share(c, kai, decks="friends", collection="friends", trades_open=True)
    for path in ("profile", "decks", "collection", "spares"):
        assert as_user(c, me).get(f"/friends/{kai}/{path}").status_code == 404, path


def test_you_cannot_open_your_own_friend_page_703(client):
    c, S = client
    kai = make_user(S, "Kai")
    share(c, kai, decks="friends")
    assert as_user(c, kai).get(f"/friends/{kai}/decks").status_code == 404


def test_turning_decks_off_hides_them_but_not_the_profile_703(client):
    c, S = client
    kai, me = _pair(S)
    share(c, kai, decks="off", collection="friends")
    assert as_user(c, me).get(f"/friends/{kai}/decks").status_code == 404
    assert as_user(c, me).get(f"/friends/{kai}/profile").status_code == 200


def test_the_collection_is_private_until_you_share_it_703(client):
    c, S = client
    kai, me = _pair(S)
    assert as_user(c, me).get(f"/friends/{kai}/collection").status_code == 404
    share(c, kai, collection="friends")
    assert as_user(c, me).get(f"/friends/{kai}/collection").status_code == 200
    share(c, kai, collection="off")
    assert as_user(c, me).get(f"/friends/{kai}/collection").status_code == 404


def test_spares_are_hidden_until_the_owner_opens_trades_703(client):
    c, S = client
    kai, me = _pair(S)
    assert as_user(c, me).get(f"/friends/{kai}/spares").status_code == 404
    share(c, kai, trades_open=True)
    assert as_user(c, me).get(f"/friends/{kai}/spares").status_code == 200


def test_a_banned_owner_looks_like_nobody_703(client):
    c, S = client
    kai, me = _pair(S)
    share(c, kai, decks="friends", collection="friends", trades_open=True)
    with S() as db:
        db.get(User, kai).banned_at = datetime.now(timezone.utc)
        db.commit()
    for path in ("profile", "decks", "collection", "spares"):
        assert as_user(c, me).get(f"/friends/{kai}/{path}").status_code == 404, path


def test_the_profile_only_reports_what_is_shared_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 2)
    make_deck(S, kai, "Red", {"OP01-001": 1})
    share(c, kai, decks="off", collection="off", trades_open=False)
    p = as_user(c, me).get(f"/friends/{kai}/profile").json()
    assert (p["deck_count"], p["unique_cards"], p["total_copies"], p["total_value"], p["spare_cards"]) == (
        None,
        None,
        None,
        None,
        None,
    )
    assert (p["decks_shared"], p["collection_shared"], p["trades_open"]) == (False, False, False)
    share(c, kai, decks="friends", collection="friends", trades_open=True, show_values=True)
    p = as_user(c, me).get(f"/friends/{kai}/profile").json()
    assert p["deck_count"] == 1
    assert (p["unique_cards"], p["total_copies"], p["total_value"]) == (1, 2, 4.0)
    assert p["spare_cards"] == 1


def test_the_profile_hides_the_collection_value_unless_values_are_shown_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 2)
    share(c, kai, collection="friends", show_values=False)
    assert as_user(c, me).get(f"/friends/{kai}/profile").json()["total_value"] is None


# --- hidden decks -------------------------------------------------------------


def test_a_hidden_deck_is_left_out_of_the_list_and_the_profile_count_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    shown = make_deck(S, kai, "Shown", {"OP01-001": 1}, sort_order=1)
    make_deck(S, kai, "Secret", {"OP01-001": 1}, sort_order=2, hidden_from_friends=True)
    share(c, kai, decks="friends")
    listed = as_user(c, me).get(f"/friends/{kai}/decks").json()
    assert [d["id"] for d in listed] == [shown]
    assert as_user(c, me).get(f"/friends/{kai}/profile").json()["deck_count"] == 1


def test_a_hidden_deck_cannot_be_opened_or_copied_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    secret = make_deck(S, kai, "Secret", {"OP01-001": 1}, hidden_from_friends=True)
    share(c, kai, decks="friends")
    assert as_user(c, me).get(f"/friends/{kai}/decks/{secret}").status_code == 404
    assert as_user(c, me).post(f"/friends/{kai}/decks/{secret}/copy").status_code == 404
    assert as_user(c, me).get("/decks").json() == []


def test_a_deck_of_someone_else_is_not_reachable_through_a_friend_703(client):
    c, S = client
    kai, me = _pair(S)
    other = make_user(S, "Other")
    add_card(S, "OP01-001", "Zoro", 2.0)
    theirs = make_deck(S, other, "Not Kai's", {"OP01-001": 1})
    share(c, kai, decks="friends")
    assert as_user(c, me).get(f"/friends/{kai}/decks/{theirs}").status_code == 404


def test_hiding_a_deck_from_friends_is_saved_and_shown_on_the_deck_703(client):
    c, S = client
    kai = make_user(S, "Kai")
    add_card(S, "OP01-001", "Zoro", 2.0)
    deck = make_deck(S, kai, "Red", {"OP01-001": 1})
    r = as_user(c, kai).patch(f"/decks/{deck}", json={"hidden_from_friends": True})
    assert r.status_code == 200
    assert r.json()["hidden_from_friends"] is True
    assert r.json()["name"] == "Red"
    assert as_user(c, kai).get(f"/decks/{deck}").json()["hidden_from_friends"] is True
    assert as_user(c, kai).get("/decks").json()[0]["hidden_from_friends"] is True
    r = as_user(c, kai).patch(f"/decks/{deck}", json={"hidden_from_friends": False})
    assert r.json()["hidden_from_friends"] is False


def test_renaming_a_deck_leaves_it_visible_to_friends_703(client):
    c, S = client
    kai = make_user(S, "Kai")
    add_card(S, "OP01-001", "Zoro", 2.0)
    deck = make_deck(S, kai, "Red", {"OP01-001": 1}, hidden_from_friends=True)
    r = as_user(c, kai).patch(f"/decks/{deck}", json={"name": "Renamed"})
    assert r.json()["name"] == "Renamed"
    assert r.json()["hidden_from_friends"] is True
    assert as_user(c, kai).get(f"/decks/{deck}").json()["hidden_from_friends"] is True
    assert as_user(c, kai).patch(f"/decks/{deck}", json={}).status_code == 400


# --- sharing settings ---------------------------------------------------------


def test_sharing_defaults_share_decks_only_and_ask_first_703(client):
    c, S = client
    me = make_user(S, "Me")
    assert as_user(c, me).get("/me/sharing").json() == {
        "decks": "friends",
        "collection": "off",
        "trades_open": False,
        "show_values": False,
        "prompted": False,
    }


def test_saving_sharing_changes_only_what_was_sent_and_marks_prompted_703(client):
    c, S = client
    me = make_user(S, "Me")
    r = as_user(c, me).put("/me/sharing", json={"collection": "friends", "trades_open": True})
    assert r.json() == {
        "decks": "friends",
        "collection": "friends",
        "trades_open": True,
        "show_values": False,
        "prompted": True,
    }
    r = as_user(c, me).put("/me/sharing", json={"decks": "off"})
    assert r.json()["collection"] == "friends"
    assert r.json()["trades_open"] is True
    assert r.json()["decks"] == "off"
    assert as_user(c, me).get("/me/sharing").json()["prompted"] is True


# --- friend collection --------------------------------------------------------


def test_a_friends_collection_hides_values_unless_they_show_them_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.5)
    own(S, kai, "OP01-001", 2)
    share(c, kai, collection="friends", show_values=False)
    body = as_user(c, me).get(f"/friends/{kai}/collection").json()
    assert body["total_value"] is None
    assert body["items"][0]["value"] is None
    assert body["items"][0]["owned"] == 2
    share(c, kai, show_values=True)
    body = as_user(c, me).get(f"/friends/{kai}/collection").json()
    assert body["total_value"] == 5.0
    assert body["items"][0]["value"] == 5.0


def test_a_friends_collection_shows_spares_only_while_trades_are_open_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 3)
    share(c, kai, collection="friends", trades_open=False)
    assert as_user(c, me).get(f"/friends/{kai}/collection").json()["items"][0]["spare"] == 0
    share(c, kai, trades_open=True)
    assert as_user(c, me).get(f"/friends/{kai}/collection").json()["items"][0]["spare"] == 3


def test_a_friends_collection_does_not_say_which_decks_use_a_card_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 1)
    make_deck(S, kai, "Secret", {"OP01-001": 1}, hidden_from_friends=True)
    share(c, kai, collection="friends")
    item = as_user(c, me).get(f"/friends/{kai}/collection").json()["items"][0]
    assert "used_in" not in item and "Secret" not in str(item)


# --- friend deck: what I'd need ----------------------------------------------


def test_a_friends_deck_counts_what_i_still_need_from_my_own_collection_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    add_card(S, "OP01-002", "Nami", 3.0)
    own(S, kai, "OP01-001", 4)  # the friend owns plenty; that must not count for me
    own(S, me, "OP01-001", 1)
    deck = make_deck(S, kai, "Red", {"OP01-001": 3, "OP01-002": 2})
    share(c, kai, decks="friends")
    body = as_user(c, me).get(f"/friends/{kai}/decks/{deck}").json()
    cards = {x["card_id"]: x for x in body["cards"]}
    assert (cards["OP01-001"]["my_owned"], cards["OP01-001"]["my_still_need"]) == (1, 2)
    assert (cards["OP01-002"]["my_owned"], cards["OP01-002"]["my_still_need"]) == (0, 2)
    assert body["my_missing_copies"] == 4
    assert body["my_missing_cost"] == 10.0  # 2 x 2.00 + 2 x 3.00


def test_my_missing_cost_is_unknown_when_a_needed_card_has_no_price_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    add_card(S, "OP01-002", "Nami", None)
    deck = make_deck(S, kai, "Red", {"OP01-001": 1, "OP01-002": 1})
    share(c, kai, decks="friends")
    body = as_user(c, me).get(f"/friends/{kai}/decks/{deck}").json()
    assert body["my_missing_copies"] == 2
    assert body["my_missing_cost"] is None


def test_don_cards_do_not_count_toward_what_i_would_need_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    add_card(S, "DON-5001", "DON!! Card", 0.5, card_type="DON!!")
    deck = make_deck(S, kai, "Red", {"OP01-001": 1, "DON-5001": 10})
    share(c, kai, decks="friends")
    body = as_user(c, me).get(f"/friends/{kai}/decks/{deck}").json()
    assert body["my_missing_copies"] == 1
    assert body["my_missing_cost"] == 2.0


# --- copy deck ----------------------------------------------------------------


def test_copying_a_friends_deck_gives_me_my_own_copy_of_the_list_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    add_card(S, "OP01-002", "Nami", 3.0)
    deck = make_deck(S, kai, "Red Zoro", {"OP01-001": 4, "OP01-002": 2}, leader="OP01-001")
    share(c, kai, decks="friends")
    r = as_user(c, me).post(f"/friends/{kai}/decks/{deck}/copy")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Red Zoro (Kai)"
    assert body["leader_card_id"] == "OP01-001"
    assert {x["card_id"]: x["needed"] for x in body["cards"]} == {"OP01-001": 4, "OP01-002": 2}
    mine = as_user(c, me).get("/decks").json()
    assert [d["id"] for d in mine] == [body["id"]]
    with S() as db:
        assert db.get(Deck, body["id"]).user_id == me
        assert db.get(Deck, deck).user_id == kai


def test_copying_a_friends_deck_respects_the_deck_cap_703(client, monkeypatch):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    deck = make_deck(S, kai, "Red", {"OP01-001": 1})
    make_deck(S, me, "Mine", {"OP01-001": 1})
    share(c, kai, decks="friends")
    monkeypatch.setattr(services, "MAX_DECKS_PER_USER", 1)
    r = as_user(c, me).post(f"/friends/{kai}/decks/{deck}/copy")
    assert r.status_code == 400
    assert "at most 1 decks" in r.json()["detail"]
    assert len(as_user(c, me).get("/decks").json()) == 1


def test_a_stranger_cannot_copy_a_deck_703(client):
    c, S = client
    kai, stranger = make_user(S, "Kai"), make_user(S, "Rando")
    add_card(S, "OP01-001", "Zoro", 2.0)
    deck = make_deck(S, kai, "Red", {"OP01-001": 1})
    share(c, kai, decks="friends")
    assert as_user(c, stranger).post(f"/friends/{kai}/decks/{deck}/copy").status_code == 404
    assert as_user(c, stranger).get("/decks").json() == []


# --- spares -------------------------------------------------------------------


def _spares(c, viewer, owner):
    r = as_user(c, viewer).get(f"/friends/{owner}/spares")
    assert r.status_code == 200, r.text
    return r.json()


def _spare_of(body, card_id, key="their_spares"):
    return next((i["spare"] for i in body[key] if i["card_id"] == card_id), 0)


def test_a_card_needed_by_two_decks_is_reserved_once_at_the_larger_count_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 4)
    # Same leader: sharing a playset covers both lists, so reserved is 3 (not 2 + 3).
    make_deck(S, kai, "A", {"OP01-001": 2}, leader="OP01-060", sort_order=1)
    make_deck(S, kai, "B", {"OP01-001": 3}, leader="OP01-060", sort_order=2)
    share(c, kai, trades_open=True)
    assert _spare_of(_spares(c, me, kai), "OP01-001") == 1


def test_decks_with_different_leaders_reserve_separately_only_when_summing_is_on_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 6)
    make_deck(S, kai, "A", {"OP01-001": 2}, leader="OP01-060", sort_order=1)
    make_deck(S, kai, "B", {"OP01-001": 3}, leader="OP02-001", sort_order=2)
    share(c, kai, trades_open=True)
    assert _spare_of(_spares(c, me, kai), "OP01-001") == 3  # max(2, 3) reserved
    with S() as db:
        db.get(User, kai).sum_across_leaders = True
        db.commit()
    assert _spare_of(_spares(c, me, kai), "OP01-001") == 1  # 2 + 3 reserved


def test_copies_you_asked_to_keep_are_not_spare_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "OP01-001", 5)
    make_deck(S, kai, "A", {"OP01-001": 2})
    share(c, kai, trades_open=True)
    assert _spare_of(_spares(c, me, kai), "OP01-001") == 3
    r = as_user(c, kai).put("/me/trade-keep/OP01-001", json={"keep_qty": 1})
    assert r.json() == {"card_id": "OP01-001", "keep_qty": 1, "spare": 2}
    assert _spare_of(_spares(c, me, kai), "OP01-001") == 2


def test_alt_art_copies_count_toward_what_is_owned_for_spares_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0, product_id=100)
    add_alt(S, "OP01-001", 101, "Zoro (Alt Art)", 20.0)
    own(S, kai, "OP01-001", 2)
    own_alt(S, kai, "OP01-001", 101, 1)
    make_deck(S, kai, "A", {"OP01-001": 1})
    share(c, kai, trades_open=True)
    item = _spares(c, me, kai)["their_spares"][0]
    assert item["spare"] == 2
    assert item["printings"] == [
        {"product_id": 101, "label": "Zoro (Alt Art)", "image_url": "https://img.test/101.png", "owned": 1}
    ]


def test_don_cards_are_never_spares_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "DON-5001", "DON!! Card", 0.5, card_type="DON!!")
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, kai, "DON-5001", 10)
    own(S, kai, "OP01-001", 1)
    share(c, kai, trades_open=True)
    assert [i["card_id"] for i in _spares(c, me, kai)["their_spares"]] == ["OP01-001"]
    assert [i["card_id"] for i in as_user(c, kai).get("/me/spares").json()["items"]] == ["OP01-001"]


def test_you_need_lists_only_their_spares_you_still_want_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-001", "Zoro", 2.0)
    add_card(S, "OP01-002", "Nami", 3.0)
    own(S, kai, "OP01-001", 3)
    own(S, kai, "OP01-002", 2)
    make_deck(S, me, "Mine", {"OP01-001": 2})  # I want 2 Zoro, nothing else
    share(c, kai, trades_open=True)
    body = _spares(c, me, kai)
    assert {i["card_id"] for i in body["their_spares"]} == {"OP01-001", "OP01-002"}
    assert [(i["card_id"], i["want"]) for i in body["you_need"]] == [("OP01-001", 2)]
    assert {i["card_id"]: i["want"] for i in body["their_spares"]} == {"OP01-001": 2, "OP01-002": 0}


def test_they_need_lists_only_my_spares_they_still_want_703(client):
    c, S = client
    kai, me = _pair(S)
    add_card(S, "OP01-003", "Luffy", 4.0)
    add_card(S, "OP01-004", "Sanji", 1.0)
    own(S, me, "OP01-003", 2)
    own(S, me, "OP01-004", 2)
    make_deck(S, kai, "Kai's", {"OP01-003": 3})  # Kai wants 3 Luffy
    share(c, kai, trades_open=True)
    body = _spares(c, me, kai)
    assert [(i["card_id"], i["spare"], i["want"]) for i in body["they_need"]] == [("OP01-003", 2, 3)]


def test_my_spares_list_kept_cards_even_when_nothing_is_spare_703(client):
    c, S = client
    me = make_user(S, "Me")
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, me, "OP01-001", 3)
    make_deck(S, me, "Mine", {"OP01-001": 1})
    assert as_user(c, me).put("/me/trade-keep/OP01-001", json={"keep_qty": 2}).json()["spare"] == 0
    items = as_user(c, me).get("/me/spares").json()["items"]
    assert [(i["card_id"], i["spare"], i["keep_qty"]) for i in items] == [("OP01-001", 0, 2)]


def test_keeping_zero_copies_removes_the_keep_row_703(client):
    c, S = client
    me = make_user(S, "Me")
    add_card(S, "OP01-001", "Zoro", 2.0)
    own(S, me, "OP01-001", 3)
    as_user(c, me).put("/me/trade-keep/OP01-001", json={"keep_qty": 2})
    as_user(c, me).put("/me/trade-keep/OP01-001", json={"keep_qty": 0})
    with S() as db:
        assert db.scalars(select(TradeKeep)).all() == []
    assert as_user(c, me).put("/me/trade-keep/OP01-001", json={"keep_qty": 100}).status_code == 422
