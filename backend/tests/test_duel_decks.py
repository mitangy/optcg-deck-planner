from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.db_support import make_test_engine
from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import User
from app.routers import duel_decks


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()

    engine = make_test_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _user(SessionLocal, name: str) -> int:
    with SessionLocal() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}")
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _deck(name: str = "Red", cards: list[str] | None = None, **extra) -> dict:
    return {"name": name, "leaderId": "OP17-001", "cards": cards or ["OP17-002"] * 4, **extra}


def _put(c: TestClient, deck_id: str, at: int, deck: dict | None = None):
    return c.put(f"/duel/decks/{deck_id}", json={"deck": deck or _deck(), "updatedAt": at})


def test_decks_round_trip_for_the_account_that_saved_them_619(client):
    c, S = client
    luffy = _user(S, "luffy")
    assert _as(c, luffy).get("/duel/decks").json() == {"decks": []}
    deck = _deck("Red", artPrefs={"OP17-002": "p1"}, plannerDeckId=7, editedLocally=True)
    assert _put(c, "d1", 1000, deck).status_code == 200
    assert c.get("/duel/decks").json()["decks"] == [
        {"id": "d1", "updatedAt": 1000, "deleted": False, "deck": deck}
    ]


def test_decks_are_private_to_their_owner_619(client):
    c, S = client
    luffy, zoro = _user(S, "luffy"), _user(S, "zoro")
    _put(_as(c, luffy), "d1", 1000)
    assert _as(c, zoro).get("/duel/decks").json() == {"decks": []}
    # Zoro's delete and write under the same id touch only his own row.
    assert _as(c, zoro).delete("/duel/decks/d1", params={"updatedAt": 5000}).status_code == 200
    _put(c, "d1", 10, _deck("Zoro's"))
    mine = _as(c, luffy).get("/duel/decks").json()["decks"]
    assert [(d["id"], d["deleted"], d["deck"]["name"]) for d in mine] == [("d1", False, "Red")]


def test_put_keeps_a_newer_stored_deck_and_returns_it_619(client):
    c, S = client
    _put(_as(c, _user(S, "luffy")), "d1", 2000, _deck("New"))
    res = _put(c, "d1", 1000, _deck("Old"))
    assert res.status_code == 200
    assert (res.json()["updatedAt"], res.json()["deck"]["name"]) == (2000, "New")
    assert c.get("/duel/decks").json()["decks"][0]["deck"]["name"] == "New"
    # An equal-or-newer write wins.
    assert _put(c, "d1", 2000, _deck("Same time")).json()["deck"]["name"] == "Same time"


def test_delete_leaves_a_tombstone_other_devices_can_see_619(client):
    c, S = client
    _put(_as(c, _user(S, "luffy")), "d1", 1000)
    assert c.delete("/duel/decks/d1", params={"updatedAt": 2000}).status_code == 200
    assert c.get("/duel/decks").json()["decks"] == [
        {"id": "d1", "updatedAt": 2000, "deleted": True, "deck": None}
    ]


def test_delete_older_than_the_stored_deck_is_ignored_619(client):
    c, S = client
    _put(_as(c, _user(S, "luffy")), "d1", 3000)
    res = c.delete("/duel/decks/d1", params={"updatedAt": 2000})
    assert res.json()["deleted"] is False
    assert c.get("/duel/decks").json()["decks"][0]["deleted"] is False


def test_a_newer_save_brings_a_deleted_deck_back_and_an_older_one_does_not_619(client):
    c, S = client
    _put(_as(c, _user(S, "luffy")), "d1", 1000)
    c.delete("/duel/decks/d1", params={"updatedAt": 2000})
    assert _put(c, "d1", 1500).json()["deleted"] is True
    assert _put(c, "d1", 2500).json()["deleted"] is False


def test_bulk_upload_applies_last_writer_wins_per_deck_619(client):
    c, S = client
    _put(_as(c, _user(S, "luffy")), "d1", 5000, _deck("Server"))
    res = c.put(
        "/duel/decks",
        json={"decks": [
            {"id": "d1", "updatedAt": 1000, "deck": _deck("Browser")},
            {"id": "d2", "updatedAt": 1000, "deck": _deck("Fresh")},
        ]},
    )
    assert res.status_code == 200
    names = {d["id"]: d["deck"]["name"] for d in c.get("/duel/decks").json()["decks"]}
    assert names == {"d1": "Server", "d2": "Fresh"}


@pytest.mark.parametrize(
    "deck_id,deck",
    [
        ("bad id!", _deck()),
        ("x" * 65, _deck()),
        ("d1", _deck(cards=["OP17-002"] * 61)),
        ("d1", _deck(cards=["x" * 33])),
        ("d1", _deck("n" * 201)),
    ],
)
def test_malformed_decks_are_refused_619(client, deck_id, deck):
    c, S = client
    res = _put(_as(c, _user(S, "luffy")), deck_id, 1, deck)
    assert res.status_code in (404, 422)
    assert c.get("/duel/decks").json() == {"decks": []}


def test_oversized_deck_data_is_refused_619(client):
    c, S = client
    big = {f"c{i}": "x" * 30 for i in range(600)}
    assert _put(_as(c, _user(S, "luffy")), "d1", 1, _deck(artPrefs=big)).status_code == 413


def test_live_decks_are_capped_but_edits_and_deletes_still_work_619(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(duel_decks, "MAX_DECKS", 2)
    c, S = client
    _as(c, _user(S, "luffy"))
    assert _put(c, "a", 1).status_code == 200
    assert _put(c, "b", 1).status_code == 200
    assert _put(c, "c", 1).status_code == 413
    assert _put(c, "a", 2).status_code == 200
    c.delete("/duel/decks/b", params={"updatedAt": 3})
    assert _put(c, "c", 4).status_code == 200
    # A deleted deck can't come back past the cap either.
    assert _put(c, "b", 5).status_code == 413


def test_tombstones_count_toward_a_row_cap_619(client, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(duel_decks, "MAX_ROWS", 2)
    c, S = client
    _as(c, _user(S, "luffy"))
    assert c.delete("/duel/decks/a", params={"updatedAt": 1}).status_code == 200
    assert _put(c, "b", 1).status_code == 200
    assert c.delete("/duel/decks/c", params={"updatedAt": 1}).status_code == 413
    assert _put(c, "c", 1).status_code == 413
    # Existing rows can still change.
    assert c.delete("/duel/decks/b", params={"updatedAt": 2}).status_code == 200


def test_a_planner_length_deck_name_is_accepted_624(client):
    c, S = client
    name = "n" * 200
    assert _put(_as(c, _user(S, "luffy")), "d1", 1, _deck(name)).status_code == 200
    assert c.get("/duel/decks").json()["decks"][0]["deck"]["name"] == name
