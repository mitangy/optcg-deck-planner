"""Shared setup for the friend-view and trade tests (#703)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import (
    CatalogCard,
    CatalogPrinting,
    Deck,
    DeckCard,
    Friendship,
    Owned,
    OwnedPrinting,
    User,
)
from tests.db_support import make_test_engine


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


def make_user(S, name: str, **extra) -> int:
    with S() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}", username=name, **extra)
        db.add(u)
        db.commit()
        return u.id


def as_user(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def befriend(S, a: int, b: int) -> None:
    low, high = min(a, b), max(a, b)
    with S() as db:
        db.add(Friendship(user_low_id=low, user_high_id=high, requester_id=a, status="accepted"))
        db.commit()


def request_only(S, a: int, b: int) -> None:
    """A pending (not yet accepted) friend request from a to b."""
    low, high = min(a, b), max(a, b)
    with S() as db:
        db.add(Friendship(user_low_id=low, user_high_id=high, requester_id=a, status="pending"))
        db.commit()


def add_card(
    S,
    card_id: str,
    name: str,
    price: float | None = 1.0,
    product_id: int | None = None,
    card_type: str = "Character",
) -> None:
    with S() as db:
        db.add(
            CatalogCard(
                card_id=card_id,
                name=name,
                card_type=card_type,
                rarity="C",
                color="Red",
                cost="2",
                market_price=price,
                low_price=price,
                image_url=f"https://img.test/{card_id}.png",
                group_name="Test Set",
            )
        )
        if product_id is not None:
            db.add(
                CatalogPrinting(
                    card_id=card_id,
                    product_id=product_id,
                    name=name,
                    market_price=price,
                    low_price=price,
                    image_url=f"https://img.test/{product_id}.png",
                    group_name="Test Set",
                )
            )
        db.commit()


def add_alt(S, card_id: str, product_id: int, name: str, price: float | None = 9.0) -> None:
    with S() as db:
        db.add(
            CatalogPrinting(
                card_id=card_id,
                product_id=product_id,
                name=name,
                market_price=price,
                low_price=price,
                image_url=f"https://img.test/{product_id}.png",
                group_name="Test Set",
                is_special=1,
            )
        )
        db.commit()


def own(S, uid: int, card_id: str, qty: int) -> None:
    with S() as db:
        row = db.scalar(select(Owned).where(Owned.user_id == uid, Owned.card_id == card_id))
        if row is None:
            db.add(Owned(user_id=uid, card_id=card_id, qty=qty))
        else:
            row.qty = qty
        db.commit()


def own_alt(S, uid: int, card_id: str, product_id: int, qty: int) -> None:
    with S() as db:
        db.add(OwnedPrinting(user_id=uid, card_id=card_id, product_id=product_id, qty=qty))
        db.commit()


def make_deck(S, uid: int, name: str, cards: dict[str, int], leader: str | None = None, **kw) -> int:
    with S() as db:
        deck = Deck(user_id=uid, name=name, leader_card_id=leader, **kw)
        db.add(deck)
        db.flush()
        for card_id, needed in cards.items():
            db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=needed))
        db.commit()
        return deck.id


def owned_qty(S, uid: int, card_id: str) -> int:
    with S() as db:
        row = db.scalar(select(Owned).where(Owned.user_id == uid, Owned.card_id == card_id))
        return row.qty if row else 0


def alt_qty(S, uid: int, card_id: str, product_id: int) -> int:
    with S() as db:
        row = db.scalar(
            select(OwnedPrinting).where(
                OwnedPrinting.user_id == uid,
                OwnedPrinting.card_id == card_id,
                OwnedPrinting.product_id == product_id,
            )
        )
        return row.qty if row else 0


def share(c: TestClient, uid: int, **settings) -> None:
    r = as_user(c, uid).put("/me/sharing", json=settings)
    assert r.status_code == 200, r.text
