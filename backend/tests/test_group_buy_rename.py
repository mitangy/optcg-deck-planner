"""Host renames a group buy (#879)."""

from __future__ import annotations

from app.group_buy import service as group_buy
from tests.friend_support import as_user, client, make_user  # noqa: F401


def _create(S, host_id: int):
    with S() as db:
        from app.core.models import User

        host = db.get(User, host_id)
        return group_buy.create_group_buy(db, host, "Old name")


def test_host_renames_group_buy_and_title_is_trimmed_879(client):
    c, S = client
    host = make_user(S, "host")
    created = _create(S, host)
    r = as_user(c, host).put(f"/group-buys/{created.id}/title", json={"title": "  Friday pool  "})
    assert r.status_code == 200
    assert r.json()["title"] == "Friday pool"
    assert as_user(c, host).get(f"/group-buys/{created.id}").json()["title"] == "Friday pool"


def test_host_can_rename_a_locked_group_buy_879(client):
    c, S = client
    host = make_user(S, "host")
    created = _create(S, host)
    with S() as db:
        from app.core.models import User

        group_buy.lock_group_buy(db, db.get(User, host), created.id)
    r = as_user(c, host).put(f"/group-buys/{created.id}/title", json={"title": "Locked rename"})
    assert r.status_code == 200
    assert r.json()["title"] == "Locked rename"


def test_member_cannot_rename_group_buy_879(client):
    c, S = client
    host = make_user(S, "host")
    friend = make_user(S, "friend")
    created = _create(S, host)
    with S() as db:
        from app.core.models import User

        group_buy.join_group_buy(db, db.get(User, friend), created.invite_token)
    r = as_user(c, friend).put(f"/group-buys/{created.id}/title", json={"title": "Hijacked"})
    assert r.status_code == 403
    assert as_user(c, host).get(f"/group-buys/{created.id}").json()["title"] == "Old name"


def test_blank_title_is_rejected_879(client):
    c, S = client
    host = make_user(S, "host")
    created = _create(S, host)
    for bad in ["", "   ", "\t\n"]:
        r = as_user(c, host).put(f"/group-buys/{created.id}/title", json={"title": bad})
        assert r.status_code in (400, 422), bad
    assert as_user(c, host).get(f"/group-buys/{created.id}").json()["title"] == "Old name"
