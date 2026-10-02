from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.db_support import make_test_engine
from app.config import get_settings
from app.db import get_db
from app.duel_ratings import apply_elo
from app.game_tokens import mint_game_token, verify_game_token
from app.main import app
from app.models import DuelMatch, User


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
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
    assert all("email" not in entry for entry in entries)

    db = SessionLocal()
    try:
        assert db.query(DuelMatch).count() == 1
        assert db.query(User).count() == 2
    finally:
        db.close()


def test_guest_token_is_always_available(client, monkeypatch: pytest.MonkeyPatch):
    c, _SessionLocal = client
    # The client fixture enables dev login; guest mint must not depend on it.
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    monkeypatch.setenv("ENABLE_DUEL_DEV_TOKEN", "false")
    get_settings.cache_clear()
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

    engine = make_test_engine()
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

    engine = make_test_engine()
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


def _ingest(c, match_id: str, seat0: int, seat1: int, winner: int, **extra):
    r = c.post(
        "/duel/matches",
        json={
            "match_id": match_id,
            "seat0_user_id": seat0,
            "seat1_user_id": seat1,
            "winner_seat": winner,
            "reason": "life",
            "ranked": True,
            **extra,
        },
        headers={"X-Duel-Ingest-Token": "test-ingest"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_ingest_keeps_leaders_turns_and_replay_server_side(client):
    """Ingest stores leader ids, turn count and the replay (#244)."""
    from app.models import DuelMatchLog
    import json as _json

    c, SessionLocal = client
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    replay = {"schema": 1, "seed": 42, "intents": [{"seat": 0, "intent": {"kind": "end_turn"}}]}
    _ingest(c, "r1", a["user_id"], b["user_id"], 1, seat0_leader_id="OP01-001", seat1_leader_id="OP05-060", turns=9, replay=replay)

    db = SessionLocal()
    try:
        row = db.query(DuelMatch).filter_by(match_id="r1").one()
        assert (row.seat0_leader_id, row.seat1_leader_id, row.turns) == ("OP01-001", "OP05-060", 9)
        assert _json.loads(db.get(DuelMatchLog, "r1").replay) == replay
    finally:
        db.close()


def test_oversized_replay_is_dropped_but_the_result_still_counts(client, monkeypatch: pytest.MonkeyPatch):
    """An oversized replay is dropped; the result still counts (#244)."""
    from app.models import DuelMatchLog
    from app.routers import duel as duel_router

    c, SessionLocal = client
    monkeypatch.setattr(duel_router, "MAX_REPLAY_BYTES", 200)
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    body = _ingest(c, "big", a["user_id"], b["user_id"], 0, replay={"intents": ["x" * 300]})
    assert body["created"] is True
    _ingest(c, "small", a["user_id"], b["user_id"], 0, replay={"intents": ["x" * 10]})

    db = SessionLocal()
    try:
        assert db.query(DuelMatch).count() == 2
        assert db.get(DuelMatchLog, "big") is None
        assert db.get(DuelMatchLog, "small") is not None
    finally:
        db.close()


def test_my_matches_lists_only_my_games_from_my_seat(client):
    """Match history lists only my games, from my seat, newest first (#244)."""
    c, _ = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    # I sit in seat 1 and win; then seat 0 and lose; then a game I'm not in.
    _ingest(c, "g1", a["user_id"], me["id"], 1, seat0_leader_id="OP01-001", seat1_leader_id="OP05-060", turns=7, replay={"seed": 1})
    _ingest(c, "g2", me["id"], b["user_id"], 1, seat0_leader_id="OP05-060", seat1_leader_id="OP12-001", turns=11)
    _ingest(c, "g3", a["user_id"], b["user_id"], 0)

    r = c.get("/duel/matches/me")
    assert r.status_code == 200, r.text
    matches = r.json()["matches"]
    assert [m["match_id"] for m in matches] == ["g2", "g1"]
    g2, g1 = matches
    assert g1 | {"created_at": None, "rating_before": 0, "rating_after": 0} == {
        "match_id": "g1",
        "created_at": None,
        "ranked": True,
        "your_seat": 1,
        "won": True,
        "reason": "life",
        "turns": 7,
        "your_leader_id": "OP05-060",
        "opponent_leader_id": "OP01-001",
        "opponent_name": "alice",
        "rating_before": 0,
        "rating_after": 0,
        "has_replay": True,
    }
    assert g1["rating_after"] > g1["rating_before"]
    assert (g2["your_seat"], g2["won"], g2["your_leader_id"], g2["opponent_leader_id"], g2["has_replay"]) == (
        0,
        False,
        "OP05-060",
        "OP12-001",
        False,
    )
    assert g2["rating_after"] < g2["rating_before"]
    assert [m["match_id"] for m in c.get("/duel/matches/me?limit=1").json()["matches"]] == ["g2"]


def test_my_matches_needs_sign_in(client):
    """Match history needs a signed-in player (#244)."""
    c, _ = client
    assert c.get("/duel/matches/me").status_code == 401
