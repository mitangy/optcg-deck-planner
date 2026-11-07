from __future__ import annotations

import atexit
import os
import shutil
import tempfile

import fakeredis
import pytest
from sqlalchemy.orm import Session, sessionmaker

# app.db builds its module-level engine from DATABASE_URL at import time, and every
# `with TestClient(app)` runs the real lifespan (init_db, backfills) against it. Point it at
# a throwaway file before anything imports app.db, or the suite writes backend/optcg.db.
_APP_DB_DIR = tempfile.mkdtemp(prefix="optcg-test-app-db-")
atexit.register(shutil.rmtree, _APP_DB_DIR, ignore_errors=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_APP_DB_DIR}/app.db"

from app import redis_client  # noqa: E402
from app.models import CatalogCard, CatalogPrinting, Deck, DeckCard, Owned, User
from app.rate_limit import RateLimiter
from tests.db_support import make_test_engine


@pytest.fixture(scope="module")
def vcr_config() -> dict:
    # Keep credentials out of any (re-)recorded cassette.
    return {
        "filter_headers": ["authorization", "cookie", "set-cookie", "x-api-key", "x-catalog-token"],
        "filter_query_parameters": ["api_key", "apikey", "access_token", "token"],
        "decode_compressed_response": True,
    }


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    # Limiters are module globals; one test's requests must not spend another's budget.
    RateLimiter.reset_all()
    yield
    RateLimiter.reset_all()


@pytest.fixture(autouse=True)
def _fresh_fuzzy_index():
    # The catalog search index is cached per process; each test builds its own catalog.
    from app.planner.catalog_search import _FUZZY_INDEX

    _FUZZY_INDEX.clear()
    yield


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch: pytest.MonkeyPatch):
    # Tests run without Redis (today's behaviour) unless they ask for fake_redis.
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setattr(redis_client, "_override", None)
    redis_client.reset_failure()
    yield
    redis_client.reset_failure()


@pytest.fixture()
def fake_redis(monkeypatch: pytest.MonkeyPatch):
    """An in-memory Redis that every get_redis() caller sees, as if REDIS_URL were set."""
    server = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_client, "_override", server)
    yield server
    server.flushall()


@pytest.fixture()
def db() -> Session:
    engine = make_test_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def make_user(db: Session, *, email: str, name: str, sub: str) -> User:
    user = User(email=email, name=name, google_sub=sub)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def add_catalog(
    db: Session,
    card_id: str,
    *,
    name: str,
    product_id: int,
    market: float,
    special: bool = False,
) -> None:
    # Keep CatalogCard as the preferred (non-special) face unless this is the first insert.
    existing = db.get(CatalogCard, card_id)
    if existing is None or not special:
        db.merge(
            CatalogCard(
                card_id=card_id,
                name=name,
                market_price=market,
                low_price=market,
                tcgplayer_url=f"https://example.test/{product_id}",
                image_url="",
                group_name="Test Set",
                is_special=1 if special else 0,
            )
        )
    db.add(
        CatalogPrinting(
            card_id=card_id,
            product_id=product_id,
            name=name + (" (Alt)" if special else ""),
            market_price=market,
            low_price=market,
            tcgplayer_url=f"https://example.test/{product_id}",
            image_url="",
            group_name="Test Set",
            is_special=1 if special else 0,
        )
    )
    db.commit()


def add_deck_with_cards(
    db: Session,
    user: User,
    name: str,
    cards: dict[str, int],
) -> Deck:
    deck = Deck(user_id=user.id, name=name)
    db.add(deck)
    db.flush()
    for card_id, needed in cards.items():
        db.add(DeckCard(deck_id=deck.id, card_id=card_id, needed=needed))
    db.commit()
    db.refresh(deck)
    return deck


def set_owned(db: Session, user: User, card_id: str, qty: int) -> None:
    from sqlalchemy import select

    row = db.scalar(
        select(Owned).where(Owned.user_id == user.id, Owned.card_id == card_id)
    )
    if row is None:
        db.add(Owned(user_id=user.id, card_id=card_id, qty=qty))
    else:
        row.qty = qty
    db.commit()
