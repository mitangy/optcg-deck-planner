"""Limits that keep one client (signed in or not) from exhausting the API or its database."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import services
from app.auth import SESSION_COOKIE, create_session_token
from app.body_limit import DEFAULT_MAX_BODY_BYTES
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import User
from app.rate_limit import RateLimiter
from app.routers import api as api_router
from tests.conftest import add_catalog
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


def _signed_in(c: TestClient, SessionLocal) -> TestClient:
    with SessionLocal() as db:
        user = User(email="limits@x.test", name="Limits", google_sub="sub-limits")
        db.add(user)
        db.commit()
        uid = user.id
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def test_declared_oversized_body_is_refused_before_any_route_runs_SEC(client):
    c, SessionLocal = client
    res = c.post(
        "/duel/guest-token",
        content=b"{" + b" " * DEFAULT_MAX_BODY_BYTES + b"}",
        headers={"Content-Type": "application/json"},
    )
    assert res.status_code == 413
    with SessionLocal() as db:
        assert db.query(User).count() == 0


def test_streamed_oversized_body_without_length_is_cut_off_SEC(client):
    c, _ = client

    def chunks():
        yield b"{"
        for _ in range(DEFAULT_MAX_BODY_BYTES // 65536 + 2):
            yield b" " * 65536
        yield b"}"

    res = c.post("/duel/guest-token", content=chunks(), headers={"Content-Type": "application/json"})
    # FastAPI reports a failed body read as 400; either way the body never parses.
    assert res.status_code in (400, 413), res.text


def test_rate_limiter_forgets_idle_keys_SEC():
    limiter = RateLimiter(max_calls=1, period_s=0.05)
    assert limiter.allow("spoofed-1") is True
    time.sleep(0.06)
    assert limiter.allow("spoofed-2") is True
    assert "spoofed-1" not in limiter._hits


def test_sales_proxy_refuses_products_outside_the_catalog_SEC(client):
    c, _ = client
    res = c.get("/catalog/sales/987654321")
    assert res.status_code == 404


def test_sales_proxy_caps_uncached_upstream_calls_in_total_SEC(client, monkeypatch: pytest.MonkeyPatch):
    c, SessionLocal = client
    with SessionLocal() as db:
        add_catalog(db, "OP01-016", name="Nami", product_id=555123, market=1.0)
    monkeypatch.setattr(api_router, "_sales_upstream_limiter", RateLimiter(max_calls=0, period_s=60))
    res = c.get("/catalog/sales/555123", headers={"X-Forwarded-For": "192.0.2.50"})
    assert res.status_code == 429


def test_deck_with_too_many_different_cards_is_refused_SEC(client):
    c, SessionLocal = client
    c = _signed_in(c, SessionLocal)
    ids = [f"OP{n // 1000 + 1:02d}-{n % 1000:03d}" for n in range(services.MAX_DECK_DISTINCT_CARDS + 1)]
    res = c.post("/decks", json={"name": "Huge", "decklist": "\n".join(f"1x{i}" for i in ids)})
    assert res.status_code == 400
    assert c.get("/decks").json() == []


def test_deck_count_per_account_is_capped_SEC(client, monkeypatch: pytest.MonkeyPatch):
    c, SessionLocal = client
    c = _signed_in(c, SessionLocal)
    monkeypatch.setattr(services, "MAX_DECKS_PER_USER", 1)
    assert c.post("/decks", json={"name": "One", "decklist": "4xOP01-016"}).status_code == 200
    assert c.post("/decks", json={"name": "Two", "decklist": "4xOP01-016"}).status_code == 400
    assert len(c.get("/decks").json()) == 1
