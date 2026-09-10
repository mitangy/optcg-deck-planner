from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db import get_db
from app.duel_ratings import apply_elo
from app.game_tokens import mint_game_token, verify_game_token
from app.main import app
from app.models import Base, DuelMatch, User


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
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


def test_elo_moves_winner_up():
    a, b = apply_elo(1000, 1000, score_a=1.0, games_a=0, games_b=0)
    assert a > 1000
    assert b < 1000


def test_game_token_roundtrip():
    get_settings.cache_clear()
    minted = mint_game_token(user_id=7, email="a@localhost")
    payload = verify_game_token(minted["token"])
    assert payload is not None
    assert payload["uid"] == 7
    assert payload["email"] == "a@localhost"


def test_dev_token_and_match_ingest(client):
    c, SessionLocal = client
    r = c.post("/duel/dev-token", json={"user_key": "alice"})
    assert r.status_code == 200, r.text
    alice = r.json()
    assert alice["token"]
    assert alice["rating"] == 1000

    r2 = c.post("/duel/dev-token", json={"user_key": "bob"})
    bob = r2.json()
    assert alice["user_id"] != bob["user_id"]

    ingest = c.post(
        "/duel/matches",
        json={
            "match_id": "m1",
            "seat0_user_id": alice["user_id"],
            "seat1_user_id": bob["user_id"],
            "winner_seat": 0,
            "reason": "deck_out",
            "ranked": True,
        },
        headers={"X-Duel-Ingest-Token": "test-ingest"},
    )
    assert ingest.status_code == 200, ingest.text
    body = ingest.json()
    assert body["created"] is True
    assert body["seat0_rating_after"] > body["seat0_rating_before"]

    again = c.post(
        "/duel/matches",
        json={
            "match_id": "m1",
            "seat0_user_id": alice["user_id"],
            "seat1_user_id": bob["user_id"],
            "winner_seat": 0,
            "reason": "deck_out",
            "ranked": True,
        },
        headers={"X-Duel-Ingest-Token": "test-ingest"},
    )
    assert again.json()["created"] is False

    board = c.get("/duel/leaderboard")
    assert board.status_code == 200
    entries = board.json()["entries"]
    assert entries[0]["user_id"] == alice["user_id"]

    db = SessionLocal()
    try:
        assert db.query(DuelMatch).count() == 1
        assert db.query(User).count() == 2
    finally:
        db.close()


def test_guest_token_is_always_available(client):
    c, _SessionLocal = client
    r = c.post("/duel/guest-token", json={"guest_id": "browserguestid001"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token"]
    assert body["email"].startswith("guest-")
    # Same guest id remints the same user.
    r2 = c.post("/duel/guest-token", json={"guest_id": "browserguestid001"})
    assert r2.json()["user_id"] == body["user_id"]


def test_dev_token_hidden_without_flags(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    monkeypatch.setenv("ENABLE_DUEL_DEV_TOKEN", "false")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(app) as c:
            r = c.post("/duel/dev-token", json={"user_key": "alice"})
            assert r.status_code == 404
            assert r.json()["detail"] == "Not found"
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()


def test_dev_token_via_staging_flag(monkeypatch: pytest.MonkeyPatch):
    """Production-like: ENABLE_DEV_LOGIN off, ENABLE_DUEL_DEV_TOKEN on."""
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    monkeypatch.setenv("ENABLE_DUEL_DEV_TOKEN", "true")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(app) as c:
            r = c.post("/duel/dev-token", json={"user_key": "staging-alice"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["token"]
            assert body["email"] == "duel-staging-alice@localhost"
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()


def test_ingest_rejects_bad_secret(client):
    c, _ = client
    a = c.post("/duel/dev-token", json={"user_key": "a"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "b"}).json()
    r = c.post(
        "/duel/matches",
        json={
            "match_id": "x",
            "seat0_user_id": a["user_id"],
            "seat1_user_id": b["user_id"],
            "winner_seat": 1,
        },
        headers={"X-Duel-Ingest-Token": "wrong"},
    )
    assert r.status_code == 401
