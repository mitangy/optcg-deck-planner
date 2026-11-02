"""POST /group-buys/{id}/leave status codes (#881)."""

from __future__ import annotations

from app import group_buy
from app.models import User
from tests.friend_support import as_user, client, make_user  # noqa: F401


def _setup(S, host_id: int, friend_id: int):
    with S() as db:
        created = group_buy.create_group_buy(db, db.get(User, host_id), "Pool")
        group_buy.join_group_buy(db, db.get(User, friend_id), created.invite_token)
        return created.id


def test_leave_route_status_codes_881(client):
    c, S = client
    host = make_user(S, "host")
    friend = make_user(S, "friend")
    outsider = make_user(S, "outsider")
    gid = _setup(S, host, friend)

    assert as_user(c, host).post(f"/group-buys/{gid}/leave").status_code == 400
    assert as_user(c, outsider).post(f"/group-buys/{gid}/leave").status_code == 403
    assert as_user(c, friend).post("/group-buys/99999/leave").status_code == 404

    assert as_user(c, host).post(f"/group-buys/{gid}/lock").status_code == 200
    assert as_user(c, friend).post(f"/group-buys/{gid}/leave").status_code == 400
    assert as_user(c, host).post(f"/group-buys/{gid}/unlock").status_code == 200

    r = as_user(c, friend).post(f"/group-buys/{gid}/leave")
    assert r.status_code == 200
    assert as_user(c, friend).get(f"/group-buys/{gid}").status_code == 403
