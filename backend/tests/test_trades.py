"""Trade offers between friends: send, answer, counter, complete, apply, undo (#703)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import TradeOffer
from tests.friend_support import (  # noqa: F401  (client is a fixture)
    add_alt,
    add_card,
    alt_qty,
    as_user,
    befriend,
    client,
    make_deck,
    make_user,
    own,
    own_alt,
    owned_qty,
    share,
)


def _setup(S, c):
    """Me and Kai are friends, both open to trades, each with spares the other lacks.

    Me: 3 Zoro (OP01-001).  Kai: 3 Nami (OP01-002).
    """
    me, kai = make_user(S, "Me"), make_user(S, "Kai")
    befriend(S, me, kai)
    add_card(S, "OP01-001", "Zoro", 2.0, product_id=100)
    add_card(S, "OP01-002", "Nami", 3.0, product_id=200)
    own(S, me, "OP01-001", 3)
    own(S, kai, "OP01-002", 3)
    share(c, me, trades_open=True)
    share(c, kai, trades_open=True)
    return me, kai


def _line(side, card, qty=1, product_id=None):
    return {"side": side, "card_id": card, "qty": qty, "product_id": product_id}


def _send(c, sender, to, lines, message=""):
    return as_user(c, sender).post("/trades", json={"to_user_id": to, "message": message, "lines": lines})


def _simple(c, me, kai, give=1, get=1):
    r = _send(c, me, kai, [_line("give", "OP01-001", give), _line("get", "OP01-002", get)])
    assert r.status_code == 201, r.text
    return r.json()


def _to_completed(c, me, kai):
    offer = _simple(c, me, kai)
    assert as_user(c, kai).post(f"/trades/{offer['id']}/accept").status_code == 200
    assert as_user(c, me).post(f"/trades/{offer['id']}/complete").status_code == 200
    return offer["id"]


# --- sending ------------------------------------------------------------------


def test_sending_an_offer_snapshots_prices_and_shows_both_sides_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai, give=2, get=1)
    assert offer["status"] == "pending"
    assert (offer["from_username"], offer["to_username"]) == ("Me", "Kai")
    assert offer["i_am_sender"] is True
    assert offer["give_value"] == 4.0  # 2 x Zoro at 2.00
    assert offer["get_value"] == 3.0
    assert {(x["side"], x["card_id"], x["qty"], x["name"]) for x in offer["lines"]} == {
        ("give", "OP01-001", 2, "Zoro"),
        ("get", "OP01-002", 1, "Nami"),
    }
    assert as_user(c, kai).get("/trades").json()["incoming"][0]["i_am_sender"] is False


def test_an_offer_value_is_unknown_when_a_card_has_no_price_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    add_card(S, "OP01-009", "Mystery", None)
    own(S, me, "OP01-009", 1)
    r = _send(c, me, kai, [_line("give", "OP01-009"), _line("get", "OP01-002")])
    assert r.json()["give_value"] is None
    assert r.json()["get_value"] == 3.0


def test_you_cannot_offer_more_than_your_spare_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    make_deck(S, me, "Mine", {"OP01-001": 2})  # 3 owned, 2 reserved, 1 spare
    r = _send(c, me, kai, [_line("give", "OP01-001", 2), _line("get", "OP01-002")])
    assert r.status_code == 409
    assert r.json()["detail"] == "You don't have 2 spare Zoro (OP01-001)."
    assert _send(c, me, kai, [_line("give", "OP01-001", 1), _line("get", "OP01-002")]).status_code == 201


def test_you_cannot_ask_for_more_than_their_spare_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    make_deck(S, kai, "Kai's", {"OP01-002": 2})  # 3 owned, 2 reserved, 1 spare
    r = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002", 2)])
    assert r.status_code == 409
    assert r.json()["detail"] == "Kai no longer has 2 spare Nami (OP01-002)."


def test_split_lines_of_one_card_are_added_up_before_checking_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    lines = [_line("give", "OP01-001", 2), _line("give", "OP01-001", 2), _line("get", "OP01-002")]
    r = _send(c, me, kai, lines)
    assert r.status_code == 409  # 2 + 2 > 3 spare
    ok = _send(c, me, kai, [_line("give", "OP01-001", 1), _line("give", "OP01-001", 2), _line("get", "OP01-002")])
    assert ok.status_code == 201
    gives = [x for x in ok.json()["lines"] if x["side"] == "give"]
    assert [(x["card_id"], x["qty"]) for x in gives] == [("OP01-001", 3)]


def test_you_cannot_send_an_offer_to_someone_not_open_to_trades_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    share(c, kai, trades_open=False)
    r = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002")])
    assert r.status_code == 409
    assert r.json()["detail"] == "Kai isn't open to trades."


def test_you_can_ask_while_your_own_trades_are_closed_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    share(c, me, trades_open=False)
    assert _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002")]).status_code == 201


def test_standard_printing_trade_line_cannot_exceed_base_copies_705(client):
    c, S = client
    me, kai = _setup(S, client[0])
    own(S, me, "OP01-001", 1)  # 1 base copy ...
    add_alt(S, "OP01-001", 101, "Zoro (Alt Art)", 20.0)
    own_alt(S, me, "OP01-001", 101, 3)  # ... and 3 alts: 4 spare in total, only 1 standard
    take = _line("get", "OP01-002")
    # The spares list tells the tray how many standard copies are really there.
    seen = as_user(c, kai).get(f"/friends/{me}/spares").json()["their_spares"]
    zoro = next(i for i in seen if i["card_id"] == "OP01-001")
    assert (zoro["spare"], zoro["base_owned"]) == (4, 1)
    r = _send(c, me, kai, [_line("give", "OP01-001", 4), take])
    assert r.status_code == 409
    assert "own 4 of the standard printing of OP01-001" in r.json()["detail"]
    assert _send(c, me, kai, [_line("give", "OP01-001", 1), take]).status_code == 201
    # Standard lines still count against the shared spare with an alt line.
    assert _send(c, me, kai, [_line("give", "OP01-001", 1), _line("give", "OP01-001", 3, 101), take]).status_code == 201


def test_standard_printing_with_no_base_copies_cannot_be_traded_even_with_alts_705(client):
    c, S = client
    me, kai = _setup(S, client[0])
    add_alt(S, "OP01-001", 101, "Zoro (Alt Art)", 20.0)
    own(S, me, "OP01-001", 0)
    own_alt(S, me, "OP01-001", 101, 2)
    r = _send(c, me, kai, [_line("give", "OP01-001", 2), _line("get", "OP01-002")])
    assert r.status_code == 409
    # Their side too: asking for standard copies of a card they only own as alts.
    add_alt(S, "OP01-002", 201, "Nami (Alt Art)", 9.0)
    own(S, kai, "OP01-002", 0)
    own_alt(S, kai, "OP01-002", 201, 2)
    r = _send(c, me, kai, [_line("give", "OP01-001", 1, 101), _line("get", "OP01-002", 2)])
    assert r.status_code == 409
    assert "Kai doesn't own 2 of the standard printing of OP01-002" in r.json()["detail"]
    assert _send(c, me, kai, [_line("give", "OP01-001", 1, 101), _line("get", "OP01-002", 2, 201)]).status_code == 201


def test_an_alt_printing_must_be_owned_to_be_offered_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    add_alt(S, "OP01-001", 101, "Zoro (Alt Art)", 20.0)
    lines = [_line("give", "OP01-001", 1, product_id=101), _line("get", "OP01-002")]
    r = _send(c, me, kai, lines)
    assert r.status_code == 409
    assert "own 1 of that printing" in r.json()["detail"]
    own_alt(S, me, "OP01-001", 101, 1)
    ok = _send(c, me, kai, lines)
    assert ok.status_code == 201
    line = next(x for x in ok.json()["lines"] if x["side"] == "give")
    assert (line["product_id"], line["printing_label"], line["market_price"]) == (101, "Zoro (Alt Art)", 20.0)


def test_an_alt_printing_of_theirs_must_be_one_they_own_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    add_alt(S, "OP01-002", 201, "Nami (Alt Art)", 15.0)
    r = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002", 1, product_id=201)])
    assert r.status_code == 409
    assert r.json()["detail"].startswith("Kai doesn't own 1 of that printing")
    own_alt(S, kai, "OP01-002", 201, 1)
    ok = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002", 1, product_id=201)])
    assert ok.status_code == 201


def test_you_cannot_send_an_offer_to_a_non_friend_or_yourself_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    stranger = make_user(S, "Rando")
    own(S, stranger, "OP01-002", 2)
    share(c, stranger, trades_open=True)
    assert _send(c, me, stranger, [_line("give", "OP01-001"), _line("get", "OP01-002")]).status_code == 404
    assert _send(c, me, me, [_line("give", "OP01-001")]).status_code == 404


def test_you_cannot_have_more_than_five_open_offers_with_one_friend_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    for _ in range(5):
        _simple(c, me, kai)
    r = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002")])
    assert r.status_code == 429
    assert r.json()["detail"] == "You already have 5 open offers with Kai."
    # Answering one frees a slot; another friend is not affected.
    first = as_user(c, me).get("/trades").json()["outgoing"][-1]["id"]
    as_user(c, me).post(f"/trades/{first}/cancel")
    assert _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002")]).status_code == 201


# --- answering ----------------------------------------------------------------


def test_accepting_again_checks_their_collection_has_not_changed_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai, give=1, get=2)
    own(S, kai, "OP01-002", 1)  # Kai sold some: only 1 left
    r = as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert r.status_code == 409
    assert r.json()["detail"] == "You don't have 2 spare Nami (OP01-002)."
    assert as_user(c, kai).get("/trades").json()["incoming"][0]["status"] == "pending"


def test_accepting_checks_the_senders_side_too_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai, give=2, get=1)
    own(S, me, "OP01-001", 1)
    r = as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert r.status_code == 409
    assert r.json()["detail"] == "Me no longer has 2 spare Zoro (OP01-001)."


def test_accepting_an_offer_marks_it_accepted_and_active_for_both_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    r = as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"
    assert r.json()["responded_at"] is not None
    for user in (me, kai):
        body = as_user(c, user).get("/trades").json()
        assert [t["id"] for t in body["active"]] == [offer["id"]]
        assert body["incoming"] == [] and body["outgoing"] == []


def test_accepting_does_not_need_your_own_trades_to_be_open_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    share(c, kai, trades_open=False)
    assert as_user(c, kai).post(f"/trades/{offer['id']}/accept").status_code == 200


def test_only_the_recipient_can_accept_or_decline_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    stranger = make_user(S, "Rando")
    for action in ("accept", "decline"):
        assert as_user(c, me).post(f"/trades/{offer['id']}/{action}").status_code == 403
        assert as_user(c, stranger).post(f"/trades/{offer['id']}/{action}").status_code == 404
    assert as_user(c, kai).post(f"/trades/{offer['id']}/decline").json()["status"] == "declined"
    assert as_user(c, kai).post(f"/trades/{offer['id']}/accept").status_code == 409


def test_a_pending_offer_is_cancelled_by_its_sender_not_its_recipient_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    stranger = make_user(S, "Rando")
    assert as_user(c, kai).post(f"/trades/{offer['id']}/cancel").status_code == 403
    assert as_user(c, stranger).post(f"/trades/{offer['id']}/cancel").status_code == 404
    assert as_user(c, me).post(f"/trades/{offer['id']}/cancel").json()["status"] == "cancelled"


def test_either_side_can_cancel_an_accepted_offer_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert as_user(c, kai).post(f"/trades/{offer['id']}/cancel").json()["status"] == "cancelled"
    assert as_user(c, me).post(f"/trades/{offer['id']}/cancel").status_code == 409


def _expire(S, offer_id):
    with S() as db:
        db.get(TradeOffer, offer_id).expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()


def test_a_stale_pending_offer_expires_when_listed_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    _expire(S, offer["id"])
    assert as_user(c, kai).get("/trades/summary").json() == {"incoming_pending": 0, "active": 0}
    body = as_user(c, kai).get("/trades").json()
    assert body["incoming"] == []
    assert [t["status"] for t in body["history"]] == ["expired"]


def test_a_stale_offer_cannot_be_accepted_before_anyone_lists_it_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    _expire(S, offer["id"])
    r = as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert r.status_code == 409
    assert r.json()["detail"] == "This offer is already expired."


def test_a_counter_replaces_the_offer_with_one_from_the_other_side_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai, give=1, get=2)
    r = as_user(c, kai).post(
        f"/trades/{offer['id']}/counter",
        json={"message": "How about this", "lines": [_line("give", "OP01-002", 1), _line("get", "OP01-001", 1)]},
    )
    assert r.status_code == 200, r.text
    new = r.json()
    assert (new["from_user_id"], new["to_user_id"]) == (kai, me)
    assert new["parent_offer_id"] == offer["id"]
    assert new["status"] == "pending"
    assert new["message"] == "How about this"
    assert new["i_am_sender"] is True
    # Lines are from the new sender's view: Kai gives Nami, gets Zoro.
    assert {(x["side"], x["card_id"]) for x in new["lines"]} == {("give", "OP01-002"), ("get", "OP01-001")}
    mine = as_user(c, me).get("/trades").json()
    assert [t["id"] for t in mine["incoming"]] == [new["id"]]
    assert mine["outgoing"] == []
    assert [(t["id"], t["status"]) for t in mine["history"]] == [(offer["id"], "countered")]


def test_a_counter_is_checked_like_a_new_offer_and_only_the_recipient_makes_one_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    too_many = {"message": "", "lines": [_line("give", "OP01-002", 4), _line("get", "OP01-001")]}
    r = as_user(c, kai).post(f"/trades/{offer['id']}/counter", json=too_many)
    assert r.status_code == 409
    assert as_user(c, kai).get("/trades").json()["incoming"][0]["status"] == "pending"
    ok = {"message": "", "lines": [_line("give", "OP01-002"), _line("get", "OP01-001")]}
    assert as_user(c, me).post(f"/trades/{offer['id']}/counter", json=ok).status_code == 403


# --- finishing ----------------------------------------------------------------


def test_a_trade_is_marked_traded_by_either_side_only_once_accepted_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    assert as_user(c, me).post(f"/trades/{offer['id']}/complete").status_code == 409
    as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    r = as_user(c, kai).post(f"/trades/{offer['id']}/complete")
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] is not None


def test_applying_a_trade_changes_only_my_own_collection_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    oid = _to_completed(c, me, kai)  # Me gives 1 Zoro, gets 1 Nami
    r = as_user(c, me).post(f"/trades/{oid}/apply")
    assert r.status_code == 200, r.text
    assert (r.json()["my_applied"], r.json()["other_applied"]) == (True, False)
    assert (owned_qty(S, me, "OP01-001"), owned_qty(S, me, "OP01-002")) == (2, 1)
    # Kai's collection is untouched until Kai applies it.
    assert (owned_qty(S, kai, "OP01-001"), owned_qty(S, kai, "OP01-002")) == (0, 3)
    r = as_user(c, kai).post(f"/trades/{oid}/apply")
    assert r.json()["other_applied"] is True
    assert (owned_qty(S, kai, "OP01-001"), owned_qty(S, kai, "OP01-002")) == (1, 2)
    assert (owned_qty(S, me, "OP01-001"), owned_qty(S, me, "OP01-002")) == (2, 1)


def test_applying_a_trade_cannot_take_more_than_i_own_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    oid = _to_completed(c, me, kai)
    own(S, me, "OP01-001", 0)  # already handed the card over
    as_user(c, me).post(f"/trades/{oid}/apply")
    assert owned_qty(S, me, "OP01-001") == 0
    undo = as_user(c, me).delete(f"/trades/{oid}/apply")
    assert undo.status_code == 200
    assert owned_qty(S, me, "OP01-001") == 0  # only what was actually removed comes back
    assert owned_qty(S, me, "OP01-002") == 0


def test_applying_moves_alt_printings_too_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    add_alt(S, "OP01-001", 101, "Zoro (Alt Art)", 20.0)
    add_alt(S, "OP01-002", 201, "Nami (Alt Art)", 15.0)
    own_alt(S, me, "OP01-001", 101, 1)
    own_alt(S, kai, "OP01-002", 201, 1)
    r = _send(c, me, kai, [_line("give", "OP01-001", 1, 101), _line("get", "OP01-002", 1, 201)])
    oid = r.json()["id"]
    as_user(c, kai).post(f"/trades/{oid}/accept")
    as_user(c, me).post(f"/trades/{oid}/complete")
    as_user(c, me).post(f"/trades/{oid}/apply")
    assert (alt_qty(S, me, "OP01-001", 101), alt_qty(S, me, "OP01-002", 201)) == (0, 1)
    assert owned_qty(S, me, "OP01-001") == 3  # base copies are not touched
    as_user(c, me).delete(f"/trades/{oid}/apply")
    assert (alt_qty(S, me, "OP01-001", 101), alt_qty(S, me, "OP01-002", 201)) == (1, 0)


def test_undoing_an_apply_restores_my_collection_and_allows_applying_again_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    oid = _to_completed(c, me, kai)
    as_user(c, me).post(f"/trades/{oid}/apply")
    r = as_user(c, me).delete(f"/trades/{oid}/apply")
    assert r.status_code == 200
    assert r.json()["my_applied"] is False
    assert (owned_qty(S, me, "OP01-001"), owned_qty(S, me, "OP01-002")) == (3, 0)
    assert as_user(c, me).delete(f"/trades/{oid}/apply").status_code == 409
    assert as_user(c, me).post(f"/trades/{oid}/apply").status_code == 200
    assert (owned_qty(S, me, "OP01-001"), owned_qty(S, me, "OP01-002")) == (2, 1)


def test_a_trade_cannot_be_applied_twice_or_before_it_is_traded_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    offer = _simple(c, me, kai)
    as_user(c, kai).post(f"/trades/{offer['id']}/accept")
    assert as_user(c, me).post(f"/trades/{offer['id']}/apply").status_code == 409
    as_user(c, me).post(f"/trades/{offer['id']}/complete")
    assert as_user(c, me).post(f"/trades/{offer['id']}/apply").status_code == 200
    assert as_user(c, me).post(f"/trades/{offer['id']}/apply").status_code == 409
    assert owned_qty(S, me, "OP01-001") == 2


def test_a_stranger_cannot_apply_or_undo_my_trade_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    oid = _to_completed(c, me, kai)
    stranger = make_user(S, "Rando")
    assert as_user(c, stranger).post(f"/trades/{oid}/apply").status_code == 404
    assert as_user(c, stranger).delete(f"/trades/{oid}/apply").status_code == 404
    assert as_user(c, stranger).post(f"/trades/{oid}/complete").status_code == 404


def test_an_applied_trade_moves_from_active_to_history_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    oid = _to_completed(c, me, kai)
    assert [t["id"] for t in as_user(c, me).get("/trades").json()["active"]] == [oid]
    assert as_user(c, me).get("/trades/summary").json()["active"] == 1
    as_user(c, me).post(f"/trades/{oid}/apply")
    mine = as_user(c, me).get("/trades").json()
    assert mine["active"] == []
    assert [t["id"] for t in mine["history"]] == [oid]
    assert as_user(c, me).get("/trades/summary").json()["active"] == 0
    # Kai has not applied yet, so it is still active for Kai.
    assert [t["id"] for t in as_user(c, kai).get("/trades").json()["active"]] == [oid]


def test_the_summary_counts_incoming_offers_and_active_trades_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    _simple(c, me, kai)
    second = _simple(c, me, kai)
    as_user(c, kai).post(f"/trades/{second['id']}/accept")
    assert as_user(c, kai).get("/trades/summary").json() == {"incoming_pending": 1, "active": 1}
    assert as_user(c, me).get("/trades/summary").json() == {"incoming_pending": 0, "active": 1}


def test_history_lists_the_newest_fifty_first_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    now = datetime.now(timezone.utc)
    with S() as db:
        for _ in range(52):
            db.add(
                TradeOffer(
                    from_user_id=me,
                    to_user_id=kai,
                    status="cancelled",
                    created_at=now,
                    expires_at=now + timedelta(days=14),
                )
            )
        db.commit()
        ids = list(db.scalars(select(TradeOffer.id).order_by(TradeOffer.id)))
    history = as_user(c, me).get("/trades").json()["history"]
    assert [t["id"] for t in history] == ids[::-1][:50]


def test_sending_offers_is_limited_to_twenty_a_minute_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    for _ in range(20):
        offer = _simple(c, me, kai)
        as_user(c, me).post(f"/trades/{offer['id']}/cancel")
    r = _send(c, me, kai, [_line("give", "OP01-001"), _line("get", "OP01-002")])
    assert r.status_code == 429
    assert r.json()["detail"].startswith("Too many trade offers")


# --- unfriending --------------------------------------------------------------


def test_unfriending_cancels_open_and_accepted_offers_but_keeps_finished_ones_703(client):
    c, S = client
    me, kai = _setup(S, client[0])
    pending = _simple(c, me, kai)
    accepted = _simple(c, me, kai)
    as_user(c, kai).post(f"/trades/{accepted['id']}/accept")
    done = _simple(c, me, kai)
    as_user(c, kai).post(f"/trades/{done['id']}/accept")
    as_user(c, me).post(f"/trades/{done['id']}/complete")
    other = make_user(S, "Other")
    befriend(S, me, other)
    share(c, other, trades_open=True)
    own(S, other, "OP01-002", 1)
    elsewhere = _send(c, me, other, [_line("give", "OP01-001"), _line("get", "OP01-002")]).json()

    assert as_user(c, kai).delete(f"/friends/{me}").status_code == 204
    with S() as db:
        status = {o.id: o.status for o in db.scalars(select(TradeOffer))}
    assert status[pending["id"]] == "cancelled"
    assert status[accepted["id"]] == "cancelled"
    assert status[done["id"]] == "completed"
    assert status[elsewhere["id"]] == "pending"
    assert as_user(c, kai).get("/trades/summary").json()["incoming_pending"] == 0
    assert as_user(c, me).post(f"/trades/{pending['id']}/accept").status_code == 403
