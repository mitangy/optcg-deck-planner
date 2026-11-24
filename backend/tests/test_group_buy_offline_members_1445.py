"""Group buy members who are not on the app: a host-typed name with its own cards and cost (#1445)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.auth import SESSION_COOKIE, create_session_token, resolve_google_user
from app.core.errors import Conflict
from app.core.models import User
from app.group_buy import service as group_buy
from app.group_buy.models import GroupBuyQtyOverride
from tests.conftest import add_catalog, add_deck_with_cards, make_user as make_db_user
from tests.friend_support import as_user, client, make_user  # noqa: F401
from tests.test_group_buy_orders import _add, _arrive_all, _owned


def _catalog(S) -> None:
    with S() as db:
        add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.0)
        add_catalog(db, "OP01-002", name="Zoro", product_id=1002, market=10.0)


def _host_group(S, host_id: int, *, host_needs: dict[str, int] | None = None) -> int:
    with S() as db:
        host = db.get(User, host_id)
        if host_needs:
            add_deck_with_cards(db, host, "Host Deck", host_needs)
        return group_buy.create_group_buy(db, host, "Pool").id


def _add_sam(c, host: int, gid: int, name: str = "Sam") -> int:
    res = as_user(c, host).post(f"/group-buys/{gid}/offline-members", json={"name": name})
    assert res.status_code == 200, res.text
    return next(m["user_id"] for m in res.json()["members"] if m["is_offline"])


def _member(detail: dict, user_id: int) -> dict:
    return next(m for m in detail["members"] if m["user_id"] == user_id)


def _line(detail: dict, card_id: str) -> dict:
    return next(ln for ln in detail["lines"] if ln["card_id"] == card_id)


def test_the_host_adds_sam_and_sets_their_cards_by_stepper_and_paste_apart_from_their_own_1445(client):
    c, S = client
    _catalog(S)
    host = make_user(S, "host")
    gid = _host_group(S, host, host_needs={"OP01-001": 2})
    sam = _add_sam(c, host, gid)

    stepped = as_user(c, host).put(
        f"/group-buys/{gid}/quantities/OP01-002", json={"qty": 3, "user_id": sam}
    )
    assert stepped.status_code == 200, stepped.text
    zoro = _line(stepped.json(), "OP01-002")
    assert [(m["user_id"], m["qty"]) for m in zoro["members"]] == [(sam, 3)]
    assert _member(stepped.json(), sam)["display_name"] == "Sam"
    assert _member(stepped.json(), host)["cards_still_needed"] == 2

    pasted = as_user(c, host).post(
        f"/group-buys/{gid}/offline-members/{sam}/cards",
        json={"text": "4xOP01-001\n1 OP01-002\nnot a card line\n2 OP99-999"},
    )
    assert pasted.status_code == 200, pasted.text
    body = pasted.json()
    assert body["applied"] == 2
    assert body["unmatched"] == ["not a card line", "2 OP99-999"]
    detail = body["detail"]
    luffy = {m["user_id"]: m["qty"] for m in _line(detail, "OP01-001")["members"]}
    assert luffy == {host: 2, sam: 4}
    assert {m["user_id"]: m["qty"] for m in _line(detail, "OP01-002")["members"]} == {sam: 1}

    locked = as_user(c, host).post(f"/group-buys/{gid}/lock").json()
    assert _member(locked, sam)["card_cost"] == 4 * 2.0 + 1 * 10.0
    assert _member(locked, host)["card_cost"] == 2 * 2.0
    assert _member(locked, sam)["total_owed"] > _member(locked, host)["total_owed"] > 0


def test_pasting_again_replaces_what_sam_had_1445(client):
    c, S = client
    _catalog(S)
    host = make_user(S, "host")
    gid = _host_group(S, host)
    sam = _add_sam(c, host, gid)
    paste = f"/group-buys/{gid}/offline-members/{sam}/cards"
    as_user(c, host).post(paste, json={"text": "2 OP01-001\n1 OP01-002"})

    again = as_user(c, host).post(paste, json={"text": "OP01-002 x3"}).json()["detail"]

    assert [(ln["card_id"], ln["total_qty"]) for ln in again["lines"]] == [("OP01-002", 3)]


def test_stepping_sams_card_to_zero_drops_the_line_1445(client):
    c, S = client
    _catalog(S)
    host = make_user(S, "host")
    gid = _host_group(S, host)
    sam = _add_sam(c, host, gid)
    put = f"/group-buys/{gid}/quantities/OP01-001"
    as_user(c, host).put(put, json={"qty": 2, "user_id": sam})

    zeroed = as_user(c, host).put(put, json={"qty": 0, "user_id": sam}).json()

    assert zeroed["lines"] == []
    with S() as db:
        assert db.scalar(select(GroupBuyQtyOverride.id)) is None


def test_only_the_host_adds_renames_or_removes_offline_members_1445(client):
    c, S = client
    host, friend = make_user(S, "host"), make_user(S, "friend")
    gid = _host_group(S, host)
    with S() as db:
        group_buy.join_group_buy(db, db.get(User, friend), group_buy.get_group_buy(db, db.get(User, host), gid).invite_token)
    sam = _add_sam(c, host, gid)

    assert as_user(c, friend).post(f"/group-buys/{gid}/offline-members", json={"name": "Ann"}).status_code == 403
    assert as_user(c, friend).patch(f"/group-buys/{gid}/offline-members/{sam}", json={"name": "X"}).status_code == 403
    assert as_user(c, friend).delete(f"/group-buys/{gid}/offline-members/{sam}").status_code == 403
    assert (
        as_user(c, friend).put(f"/group-buys/{gid}/quantities/OP01-001", json={"qty": 1, "user_id": sam}).status_code
        == 403
    )
    assert as_user(c, friend).post(f"/group-buys/{gid}/offline-members/{sam}/cards", json={"text": "1 OP01-001"}).status_code == 403
    detail = as_user(c, host).get(f"/group-buys/{gid}").json()
    assert _member(detail, sam)["display_name"] == "Sam"


def test_the_host_cannot_edit_a_real_member_through_the_offline_path_1445(client):
    c, S = client
    _catalog(S)
    host, friend = make_user(S, "host"), make_user(S, "friend")
    gid = _host_group(S, host)
    with S() as db:
        group_buy.join_group_buy(db, db.get(User, friend), group_buy.get_group_buy(db, db.get(User, host), gid).invite_token)

    res = as_user(c, host).put(f"/group-buys/{gid}/quantities/OP01-001", json={"qty": 1, "user_id": friend})

    assert res.status_code == 404


def test_names_are_trimmed_and_limited_to_forty_characters_1445(client):
    c, S = client
    host = make_user(S, "host")
    gid = _host_group(S, host)
    url = f"/group-buys/{gid}/offline-members"

    assert as_user(c, host).post(url, json={"name": "   "}).status_code == 422
    assert as_user(c, host).post(url, json={"name": "x" * 41}).status_code == 422
    sam = _add_sam(c, host, gid, "  Sam  ")
    renamed = as_user(c, host).patch(f"{url}/{sam}", json={"name": " Samuel "})
    assert _member(renamed.json(), sam)["display_name"] == "Samuel"


def test_offline_members_do_not_count_as_people_who_joined_1445(client):
    c, S = client
    host = make_user(S, "host")
    gid = _host_group(S, host)
    _add_sam(c, host, gid)

    detail = as_user(c, host).get(f"/group-buys/{gid}").json()
    preview = c.get(f"/public/group-buys/{detail['invite_token']}").json()

    assert len(detail["members"]) == 2
    assert detail["member_count"] == 1
    assert preview["member_count"] == 1


def test_removing_sam_deletes_their_cards_and_the_placeholder_1445(client):
    c, S = client
    _catalog(S)
    host = make_user(S, "host")
    gid = _host_group(S, host)
    sam = _add_sam(c, host, gid)
    as_user(c, host).put(f"/group-buys/{gid}/quantities/OP01-001", json={"qty": 2, "user_id": sam})

    removed = as_user(c, host).delete(f"/group-buys/{gid}/offline-members/{sam}").json()

    assert [m["user_id"] for m in removed["members"]] == [host]
    assert removed["lines"] == []
    with S() as db:
        assert db.get(User, sam) is None


def test_sam_cannot_be_removed_once_they_have_copies_in_an_order_1445(db):
    host = make_db_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 1})
    gid = group_buy.create_group_buy(db, host, "Orders").id
    sam = next(m for m in group_buy.add_offline_member(db, host, gid, "Sam").members if m.is_offline)
    group_buy.set_member_qty(db, host, gid, "OP01-001", 2, sam.user_id)
    group_buy.lock_group_buy(db, host, gid)
    _add(db, host, gid, std=3)

    with pytest.raises(Conflict):
        group_buy.remove_offline_member(db, host, gid, sam.user_id)

    assert db.get(User, sam.user_id) is not None


def test_arrival_credits_owned_to_real_members_but_not_to_sam_1445(db):
    host = make_db_user(db, email="host@example.com", name="Host", sub="sub-host")
    add_catalog(db, "OP01-001", name="Luffy", product_id=1001, market=2.5)
    add_deck_with_cards(db, host, "Host Deck", {"OP01-001": 2})
    gid = group_buy.create_group_buy(db, host, "Orders").id
    sam = next(m for m in group_buy.add_offline_member(db, host, gid, "Sam").members if m.is_offline)
    group_buy.set_member_qty(db, host, gid, "OP01-001", 2, sam.user_id)
    group_buy.lock_group_buy(db, host, gid)
    added = _add(db, host, gid, std=4).detail

    arrived = _arrive_all(db, host, gid, added.orders[0])

    assert _owned(db, host.id) == 2
    assert _owned(db, sam.user_id) == 0
    assert {a.user_id: a.qty_arrived for a in arrived.orders[0].lines[0].allocations} == {
        host.id: 2,
        sam.user_id: 2,
    }


def test_deleting_the_group_buy_deletes_its_offline_members_1445(client):
    c, S = client
    host = make_user(S, "host")
    gid = _host_group(S, host)
    sam = _add_sam(c, host, gid)

    assert as_user(c, host).delete(f"/group-buys/{gid}").status_code == 200

    with S() as db:
        assert db.get(User, sam) is None
        assert db.get(User, host) is not None


def test_offline_members_are_left_out_of_the_admin_user_list_and_counts_1445(client):
    c, S = client
    boss = make_user(S, "boss", role="admin")
    host = make_user(S, "host")
    gid = _host_group(S, host)
    _add_sam(c, host, gid, "Zelda Placeholder")

    as_user(c, boss)
    listed = c.get("/admin/users", params={"q": "placeholder"}).json()
    overview = c.get("/admin/overview").json()

    assert listed["total"] == 0
    assert c.get("/admin/users").json()["total"] == 2
    assert overview["accounts"]["total"] == 2


def test_nobody_can_sign_in_as_an_offline_member_1445(client):
    c, S = client
    host = make_user(S, "host")
    gid = _host_group(S, host)
    sam = _add_sam(c, host, gid)

    c.cookies.set(SESSION_COOKIE, create_session_token(sam, 0))
    assert c.get("/group-buys").status_code == 401

    with S() as db:
        placeholder = db.get(User, sam)
        with pytest.raises(HTTPException) as err:
            resolve_google_user(db, email=placeholder.email, sub=placeholder.google_sub, name="Imposter")
        assert err.value.status_code == 403
