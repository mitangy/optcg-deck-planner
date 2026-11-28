from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core.auth import SESSION_COOKIE, create_session_token
from app.core.config import get_settings
from app.core.db import get_db
from app.core.models import User
from app.duel.models import DuelSavedDeck
from app.main import app
from app.planner.models import CatalogCard
from tests.conftest import add_catalog, set_owned
from tests.db_support import make_test_engine

LEADER = "OP01-001"


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

    with SessionLocal() as db:
        add_catalog(db, LEADER, name="Luffy", product_id=1, market=0.0)
        db.get(CatalogCard, LEADER).card_type = "Leader"
        add_catalog(db, "OP01-016", name="Nami", product_id=2, market=2.0)
        add_catalog(db, "OP01-017", name="Zoro", product_id=3, market=0.5)
        db.commit()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _user(S, name: str) -> int:
    with S() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}")
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _save(c: TestClient, deck_id: str, cards: list[str]) -> None:
    deck = {"name": "Red", "leaderId": LEADER, "cards": cards}
    assert c.put(f"/duel/decks/{deck_id}", json={"deck": deck, "updatedAt": 1000}).status_code == 200


def _owned(S, uid: int, card_id: str, qty: int) -> None:
    with S() as db:
        set_owned(db, db.get(User, uid), card_id, qty)


# 4 Nami at $2 and 2 Zoro at $0.50, leader priced at 0.
CARDS = ["OP01-016"] * 4 + ["OP01-017"] * 2


def _missing(c: TestClient, deck_id: str = "d1") -> tuple[int, int, float]:
    body = c.get(f"/duel/decks/{deck_id}/missing-cost").json()
    return body["missing_cards"], body["missing_copies"], body["cost_usd"]


def test_missing_cost_prices_the_copies_the_player_does_not_own_1507(client):
    c, S = client
    uid = _user(S, "luffy")
    _save(_as(c, uid), "d1", CARDS)
    assert _missing(c) == (3, 7, 9.0)

    _owned(S, uid, "OP01-016", 3)
    _owned(S, uid, "OP01-017", 2)
    assert _missing(c) == (2, 2, 2.0)


def test_owning_everything_costs_nothing_1507(client):
    c, S = client
    uid = _user(S, "luffy")
    _save(_as(c, uid), "d1", CARDS)
    for card, qty in (("OP01-016", 4), ("OP01-017", 2), (LEADER, 1)):
        _owned(S, uid, card, qty)
    assert _missing(c) == (0, 0, 0.0)


def test_another_players_owned_cards_do_not_lower_the_cost_1507(client):
    c, S = client
    luffy, zoro = _user(S, "luffy"), _user(S, "zoro")
    for card, qty in (("OP01-016", 4), ("OP01-017", 2), (LEADER, 1)):
        _owned(S, zoro, card, qty)
    _save(_as(c, luffy), "d1", CARDS)
    assert _missing(c)[2] == 9.0


def test_missing_cost_of_someone_elses_or_unknown_deck_is_404_1507(client):
    c, S = client
    luffy, zoro = _user(S, "luffy"), _user(S, "zoro")
    _save(_as(c, luffy), "d1", CARDS)
    assert _as(c, zoro).get("/duel/decks/d1/missing-cost").status_code == 404
    assert _as(c, luffy).get("/duel/decks/nope/missing-cost").status_code == 404


def test_a_deck_without_a_planner_twin_has_no_missing_cost_1507(client):
    c, S = client
    uid = _user(S, "luffy")
    _save(_as(c, uid), "d1", CARDS)
    with S() as db:
        db.query(DuelSavedDeck).update({DuelSavedDeck.planner_deck_id: None})
        db.commit()
    assert c.get("/duel/decks/d1/missing-cost").status_code == 404

