from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from tests.friend_support import add_card, as_user, client, make_user, owned_qty, own  # noqa: F401


def test_first_owned_write_losing_a_race_is_a_409_not_a_500_1346(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    uid = make_user(S, "racer")
    add_card(S, "OP01-001", "Luffy")
    own(S, uid, "OP01-001", 1)

    real_scalar = Session.scalar
    missed = {"once": False}

    def blind_first_owned_lookup(self, statement, *a, **k):
        if not missed["once"] and "FROM owned" in str(statement):
            missed["once"] = True
            return None
        return real_scalar(self, statement, *a, **k)

    monkeypatch.setattr(Session, "scalar", blind_first_owned_lookup)
    res = as_user(c, uid).put("/owned/OP01-001", json={"qty": 3})
    monkeypatch.undo()

    assert res.status_code == 409
    assert res.json() == {"detail": "That change conflicted with another one. Try again."}
    assert owned_qty(S, uid, "OP01-001") == 1
    assert as_user(c, uid).put("/owned/OP01-001", json={"qty": 3}).status_code == 200
    assert owned_qty(S, uid, "OP01-001") == 3


def test_card_ids_longer_than_a_card_number_are_refused_on_writes_1346(client):
    c, S = client
    uid = make_user(S, "longid")
    too_long = "X" * 33
    ok = "X" * 32
    assert as_user(c, uid).put(f"/owned/{too_long}", json={"qty": 1}).status_code == 422
    assert as_user(c, uid).put(f"/shopping/extras/{too_long}", json={"qty": 1}).status_code == 422
    assert as_user(c, uid).put(f"/owned/{too_long}/display", json={"product_id": None}).status_code == 422
    assert as_user(c, uid).put(f"/owned/{ok}", json={"qty": 1}).status_code == 200
    assert owned_qty(S, uid, ok) == 1
