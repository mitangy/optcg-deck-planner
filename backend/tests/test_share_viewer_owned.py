"""Shared deck links count owned cards from the viewer, and can be copied (#741)."""

from __future__ import annotations

from sqlalchemy import select

from app.auth import SESSION_COOKIE
from app.models import Deck, ShareLink
from tests.friend_support import (  # noqa: F401  (client is a fixture)
    add_alt,
    add_card,
    as_user,
    client,
    make_deck,
    make_user,
    own,
    own_alt,
)


def _setup(c, S):
    """Kai owns 4 of OP01-001 and shares a deck needing 4; Vi owns 1 base + 1 alt."""
    add_card(S, "OP01-001", "Zoro", price=2.0, product_id=100)
    add_alt(S, "OP01-001", 101, "Zoro Alt")
    add_card(S, "OP01-002", "Nami", price=3.0, product_id=200)
    kai, vi = make_user(S, "Kai"), make_user(S, "Vi")
    own(S, kai, "OP01-001", 4)
    own(S, kai, "OP01-002", 2)
    own(S, vi, "OP01-001", 1)
    own_alt(S, vi, "OP01-001", 101, 1)
    deck_id = make_deck(S, kai, "Zoro Aggro", {"OP01-001": 4, "OP01-002": 2})
    r = as_user(c, kai).post("/share", json={"kind": "deck", "deck_id": deck_id})
    assert r.status_code == 200, r.text
    return kai, vi, deck_id, r.json()["token"]


def _signed_out(c):
    c.cookies.delete(SESSION_COOKIE)
    return c


def _by_card(body):
    return {i["card_id"]: i for i in body["items"]}


def test_signed_in_viewer_sees_their_own_owned_and_still_needed_741(client):
    c, S = client
    kai, vi, _, token = _setup(c, S)
    body = as_user(c, vi).get(f"/public/share/{token}").json()
    zoro = _by_card(body)["OP01-001"]
    assert (zoro["need"], zoro["owned"], zoro["alts_owned"], zoro["still_need"]) == (4, 1, 1, 2)
    assert zoro["remaining_cost"] == 4.0
    assert [a["owned"] for a in zoro["alt_arts"]] == [1]
    nami = _by_card(body)["OP01-002"]
    assert (nami["owned"], nami["still_need"]) == (0, 2)
    assert body["cards_still_needed"] == 4
    assert body["remaining_market"] == 10.0
    assert body["viewer_signed_in"] is True
    assert body["viewer_is_owner"] is False


def test_the_owner_opening_their_own_link_sees_their_collection_741(client):
    c, S = client
    kai, _, _, token = _setup(c, S)
    body = as_user(c, kai).get(f"/public/share/{token}").json()
    assert _by_card(body)["OP01-001"]["still_need"] == 0
    assert body["cards_still_needed"] == 0
    assert body["viewer_is_owner"] is True


def test_signed_out_viewer_sees_none_owned_and_the_full_cost_741(client):
    c, S = client
    _setup(c, S)
    token = _setup_token(c, S)
    body = _signed_out(c).get(f"/public/share/{token}").json()
    zoro = _by_card(body)["OP01-001"]
    assert (zoro["owned"], zoro["alts_owned"], zoro["still_need"]) == (0, 0, 4)
    assert [a["owned"] for a in zoro["alt_arts"]] == [0]
    assert body["cards_still_needed"] == 6
    assert body["remaining_market"] == 14.0
    assert body["viewer_signed_in"] is False
    assert body["viewer_is_owner"] is False


def _setup_token(c, S):
    """The token of the deck share made in _setup (the only share link)."""
    with S() as db:
        return db.scalar(select(ShareLink.token))


def test_copy_puts_the_deck_in_the_viewers_account_only_741(client):
    c, S = client
    kai, vi, deck_id, token = _setup(c, S)
    r = as_user(c, vi).post(f"/public/share/{token}/copy")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Zoro Aggro"
    assert {x["card_id"]: x["needed"] for x in body["cards"]} == {"OP01-001": 4, "OP01-002": 2}
    # Detail is computed for the viewer: 1 base + 1 alt owned of 4.
    assert {x["card_id"]: x["still_need"] for x in body["cards"]}["OP01-001"] == 2
    with S() as db:
        mine = db.scalars(select(Deck).where(Deck.user_id == vi)).all()
        assert [d.id for d in mine] == [body["id"]]
        theirs = db.scalars(select(Deck).where(Deck.user_id == kai)).all()
        assert [d.id for d in theirs] == [deck_id]


def test_owner_copying_their_own_link_gets_a_copy_suffix_741(client):
    c, S = client
    kai, _, deck_id, token = _setup(c, S)
    body = as_user(c, kai).post(f"/public/share/{token}/copy").json()
    assert body["name"] == "Zoro Aggro (copy)"
    assert body["id"] != deck_id


def test_copy_of_a_revoked_link_is_not_found_741(client):
    c, S = client
    kai, vi, _, token = _setup(c, S)
    assert as_user(c, kai).delete(f"/share/{token}").status_code == 200
    assert as_user(c, vi).post(f"/public/share/{token}/copy").status_code == 404
    with S() as db:
        assert db.scalars(select(Deck).where(Deck.user_id == vi)).all() == []


def test_copy_of_a_shopping_share_is_rejected_741(client):
    c, S = client
    kai, vi, _, _ = _setup(c, S)
    token = as_user(c, kai).post("/share", json={"kind": "shopping"}).json()["token"]
    assert as_user(c, vi).post(f"/public/share/{token}/copy").status_code == 400
    with S() as db:
        assert db.scalars(select(Deck).where(Deck.user_id == vi)).all() == []


def test_copy_requires_sign_in_741(client):
    c, S = client
    _setup(c, S)
    token = _setup_token(c, S)
    assert _signed_out(c).post(f"/public/share/{token}/copy").status_code == 401
