from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.db import get_db
from app.main import app
from app.models import Owned
from tests.conftest import add_catalog, make_user, set_owned


def _client(db, user):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


def _seed(db):
    add_catalog(db, "OP01-120", name="Shanks", product_id=1, market=30.0)
    add_catalog(db, "OP01-001", name="Zoro", product_id=2, market=1.0)
    return make_user(db, email="scan@example.com", name="Scan", sub="sub-scan")


def test_owned_add_increments_and_sums_repeated_ids_701(db):
    user = _seed(db)
    set_owned(db, user, "OP01-120", 1)
    try:
        res = _client(db, user).post(
            "/owned/add",
            json={"items": [{"card_id": "op01-120", "add": 2}, {"card_id": "OP01-120", "add": 1}, {"card_id": "OP01-001", "add": 3}]},
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert res.json() == {"items": [{"card_id": "OP01-120", "owned": 4}, {"card_id": "OP01-001", "owned": 3}]}
    counts = {r.card_id: r.qty for r in db.query(Owned).filter(Owned.user_id == user.id)}
    assert counts == {"OP01-120": 4, "OP01-001": 3}


def test_owned_add_unknown_card_rejects_the_whole_batch_701(db):
    user = _seed(db)
    try:
        res = _client(db, user).post(
            "/owned/add",
            json={"items": [{"card_id": "OP01-001", "add": 1}, {"card_id": "ZZ99-999", "add": 1}]},
        )
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 404
    assert db.query(Owned).count() == 0


def test_owned_add_rejects_out_of_range_amounts_and_oversize_lists_701(db):
    user = _seed(db)
    try:
        client = _client(db, user)
        too_many = client.post("/owned/add", json={"items": [{"card_id": "OP01-001", "add": 100}]})
        zero = client.post("/owned/add", json={"items": [{"card_id": "OP01-001", "add": 0}]})
        long = client.post("/owned/add", json={"items": [{"card_id": "OP01-001", "add": 1}] * 201})
        empty = client.post("/owned/add", json={"items": []})
    finally:
        app.dependency_overrides.clear()

    assert [r.status_code for r in (too_many, zero, long, empty)] == [422, 422, 422, 422]
    assert db.query(Owned).count() == 0
