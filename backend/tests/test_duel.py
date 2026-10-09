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
from datetime import datetime, timedelta, timezone

from app.models import DuelLobbySeen, DuelMatch, DuelPresence, DuelRating, User
from app.routers import duel as duel_router


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    duel_router.reset_live_cache()

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
        "has_log": False,
        "finished": True,
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


def test_match_page_shows_only_my_seats_log(client):
    """A match opened from history carries the log from my seat, never the opponent's (#252)."""
    c, _ = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    logs = [{"seat": 0, "turns": [{"turn": 1}]}, {"seat": 1, "turns": [{"turn": 1}, {"turn": 2}]}]
    _ingest(c, "mine", a["user_id"], me["id"], 1, seat0_leader_id="OP01-001", seat1_leader_id="OP05-060", turns=2, seat_logs=logs)
    _ingest(c, "theirs", a["user_id"], b["user_id"], 0, seat_logs=logs)

    assert c.get("/duel/matches/me").json()["matches"][0]["has_log"] is True
    r = c.get("/duel/matches/me/mine")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["log"] == logs[1]
    assert (body["match"]["your_seat"], body["match"]["your_leader_id"], body["match"]["won"]) == (1, "OP05-060", True)
    assert c.get("/duel/matches/me/theirs").status_code == 404


def test_oversized_seat_log_is_dropped_but_the_result_still_counts(client, monkeypatch: pytest.MonkeyPatch):
    """An oversized seat log is dropped; the match still opens, without a log (#252)."""
    from app.routers import duel as duel_router

    c, _ = client
    monkeypatch.setattr(duel_router, "MAX_REPLAY_BYTES", 200)
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    big = {"seat": 0, "turns": ["x" * 300]}
    small = {"seat": 1, "turns": []}
    _ingest(c, "big", me["id"], a["user_id"], 0, seat_logs=[big, small])
    _ingest(c, "small", a["user_id"], me["id"], 0, seat_logs=[big, small])

    assert c.get("/duel/matches/me/big").json()["log"] is None
    assert c.get("/duel/matches/me/small").json()["log"] == small


def test_my_matches_needs_sign_in(client):
    """Match history needs a signed-in player (#244)."""
    c, _ = client
    assert c.get("/duel/matches/me").status_code == 401


def _progress(c, match_id: str, seat0: int, seat1: int, token: str = "test-ingest", **extra):
    return c.put(
        f"/duel/matches/{match_id}/progress",
        json={"seat0_user_id": seat0, "seat1_user_id": seat1, **extra},
        headers={"X-Duel-Ingest-Token": token},
    )


def test_unfinished_game_shows_its_log_so_far_from_my_seat(client):
    """A game cut short keeps its latest per-turn log, listed as unfinished, my seat only (#316)."""
    c, _ = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    early = [{"seat": 0, "turns": [{"turn": 1}]}, {"seat": 1, "turns": [{"turn": 1}]}]
    later = [{"seat": 0, "turns": [{"turn": 1}, {"turn": 2}]}, {"seat": 1, "turns": [{"turn": 1}, {"turn": 2}, {"turn": 3}]}]
    assert _progress(c, "cut", a["user_id"], me["id"], seat_logs=early, turns=1).status_code == 204
    assert _progress(c, "cut", a["user_id"], me["id"], seat_logs=later, turns=3, seat1_leader_id="OP05-060").status_code == 204
    assert _progress(c, "theirs", a["user_id"], b["user_id"], seat_logs=later).status_code == 204

    listed = c.get("/duel/matches/me").json()["matches"]
    assert [(m["match_id"], m["finished"], m["has_log"], m["turns"]) for m in listed] == [("cut", False, True, 3)]
    r = c.get("/duel/matches/me/cut")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["log"] == later[1]
    assert (body["match"]["your_seat"], body["match"]["your_leader_id"], body["match"]["finished"]) == (1, "OP05-060", False)
    assert c.get("/duel/matches/me/theirs").status_code == 404


def test_result_replaces_the_unfinished_log_and_late_progress_is_ignored(client):
    """Once the result lands the game is listed once, finished, and a late snapshot can't reopen it (#316)."""
    c, _ = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    partial = [{"seat": 0, "turns": [{"turn": 1}]}, {"seat": 1, "turns": [{"turn": 1}]}]
    final = [{"seat": 0, "turns": [{"turn": 1}, {"turn": 2}]}, {"seat": 1, "turns": [{"turn": 1}, {"turn": 2}]}]
    _progress(c, "g", me["id"], a["user_id"], seat_logs=partial)
    _ingest(c, "g", me["id"], a["user_id"], 0, seat_logs=final)
    assert _progress(c, "g", me["id"], a["user_id"], seat_logs=partial).status_code == 204

    listed = c.get("/duel/matches/me").json()["matches"]
    assert [(m["match_id"], m["finished"]) for m in listed] == [("g", True)]
    assert c.get("/duel/matches/me/g").json()["log"] == final[0]


def test_progress_needs_the_ingest_secret(client):
    """Only the game server can save a game's progress (#316)."""
    c, _ = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    assert _progress(c, "x", me["id"], a["user_id"], token="wrong").status_code == 401
    assert c.get("/duel/matches/me").json()["matches"] == []


def test_oversized_progress_log_is_dropped(client, monkeypatch: pytest.MonkeyPatch):
    """An unfinished game's oversized log is dropped like a finished one's (#316)."""
    from app.routers import duel as duel_router

    c, _ = client
    monkeypatch.setattr(duel_router, "MAX_REPLAY_BYTES", 200)
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    big = {"seat": 0, "turns": ["x" * 300]}
    small = {"seat": 1, "turns": []}
    _progress(c, "big", me["id"], a["user_id"], seat_logs=[big, small])
    _progress(c, "small", a["user_id"], me["id"], seat_logs=[big, small])
    assert c.get("/duel/matches/me/big").json()["log"] is None
    assert c.get("/duel/matches/me/small").json()["log"] == small


def test_new_guest_accounts_are_capped_per_client_ip_318(client, monkeypatch: pytest.MonkeyPatch):
    from app.rate_limit import RateLimiter
    from app.routers import duel as duel_router

    c, SessionLocal = client
    monkeypatch.setattr(duel_router, "_new_account_ip_rate", RateLimiter(max_calls=2, period_s=3600))
    ip = {"X-Forwarded-For": "203.0.113.7"}
    first = c.post("/duel/guest-token", json={"guest_id": "freshguest0001"}, headers=ip)
    assert first.status_code == 200, first.text
    assert c.post("/duel/guest-token", json={"guest_id": "freshguest0002"}, headers=ip).status_code == 200
    # A third brand-new id from the same client creates no account.
    assert c.post("/duel/guest-token", json={"guest_id": "freshguest0003"}, headers=ip).status_code == 429
    # Re-minting an existing guest needs no new-account slot.
    again = c.post("/duel/guest-token", json={"guest_id": "freshguest0001"}, headers=ip)
    assert again.status_code == 200
    assert again.json()["user_id"] == first.json()["user_id"]
    # Another client still gets in.
    assert c.post("/duel/guest-token", json={"guest_id": "freshguest0004"}, headers={"X-Forwarded-For": "198.51.100.9"}).status_code == 200
    with SessionLocal() as db:
        assert db.query(User).filter(User.email.like("guest-freshguest%")).count() == 3


def test_new_accounts_are_capped_in_total_across_ips_318(client, monkeypatch: pytest.MonkeyPatch):
    from app.rate_limit import RateLimiter
    from app.routers import duel as duel_router

    c, _ = client
    monkeypatch.setattr(duel_router, "_new_account_global_rate", RateLimiter(max_calls=2, period_s=3600))
    codes = [
        c.post(
            "/duel/guest-token",
            json={"guest_id": f"spoofedguest{i:04d}"},
            headers={"X-Forwarded-For": f"192.0.2.{i}"},
        ).status_code
        for i in range(3)
    ]
    assert codes == [200, 200, 429]


def test_dev_token_new_accounts_share_the_cap_318(client, monkeypatch: pytest.MonkeyPatch):
    from app.rate_limit import RateLimiter
    from app.routers import duel as duel_router

    c, _ = client
    monkeypatch.setattr(duel_router, "_new_account_ip_rate", RateLimiter(max_calls=1, period_s=3600))
    assert c.post("/duel/dev-token", json={"user_key": "capped-one"}).status_code == 200
    assert c.post("/duel/dev-token", json={"user_key": "capped-two"}).status_code == 429
    assert c.post("/duel/dev-token", json={"user_key": "capped-one"}).status_code == 200


def _set_rating(SessionLocal, user_id: int, rating: int, games_played: int) -> None:
    with SessionLocal() as db:
        row = db.get(DuelRating, user_id)
        if row is None:
            db.add(DuelRating(user_id=user_id, rating=rating, games_played=games_played))
        else:
            row.rating, row.games_played = rating, games_played
        db.commit()


def test_rating_me_counts_wins_losses_and_rank_431(client):
    c, SessionLocal = client
    me = c.post("/auth/dev-login").json()
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()["user_id"]
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()["user_id"]
    d = c.post("/duel/dev-token", json={"user_key": "dave"}).json()["user_id"]
    # Win from seat 1, loss from seat 0, unranked win from seat 0, and a game I'm not in.
    _ingest(c, "w1", a, me["id"], 1)
    _ingest(c, "l1", me["id"], b, 1)
    _ingest(c, "u1", me["id"], a, 0, ranked=False)
    _ingest(c, "x1", a, b, 0)
    _set_rating(SessionLocal, me["id"], 1100, 2)
    _set_rating(SessionLocal, a, 1200, 5)  # higher, played
    _set_rating(SessionLocal, b, 1100, 4)  # tied, not strictly higher
    _set_rating(SessionLocal, d, 1900, 0)  # higher but never played

    body = c.get("/duel/rating/me").json()
    assert body["wins"] == 2
    assert body["losses"] == 1
    assert body["rank"] == 2
    assert body["rating"] == 1100 and body["games_played"] == 2


def test_rating_me_rank_is_null_without_ranked_games_431(client):
    c, SessionLocal = client
    c.post("/auth/dev-login")
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()["user_id"]
    _set_rating(SessionLocal, a, 1300, 3)
    body = c.get("/duel/rating/me").json()
    assert body["rank"] is None
    assert body["wins"] == 0 and body["losses"] == 0


def test_leaderboard_skips_players_with_no_games_431(client):
    c, SessionLocal = client
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()["user_id"]
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()["user_id"]
    _set_rating(SessionLocal, a, 1400, 0)
    _set_rating(SessionLocal, b, 1000, 1)
    ids = [e["user_id"] for e in c.get("/duel/leaderboard").json()["entries"]]
    assert ids == [b]


def _live_user(c, key: str) -> int:
    return c.post("/duel/dev-token", json={"user_key": key}).json()["user_id"]


def _presence(SessionLocal, user_id: int, room: str, *, role="player", phase="playing", age_s=0):
    with SessionLocal() as db:
        db.add(
            DuelPresence(
                user_id=user_id,
                room_id=room,
                instance_id="gs-1",
                role=role,
                phase=phase,
                updated_at=datetime.now(timezone.utc) - timedelta(seconds=age_s),
            )
        )
        db.commit()


def test_live_counts_fresh_playing_rooms_and_online_users_431(client):
    c, SessionLocal = client
    keys = ("p1", "p2", "p3", "wait", "fin", "stale", "spec", "seen", "oldseen", "seenplay")
    u = {k: _live_user(c, k) for k in keys}
    # Room r1: two players are one match. A spectator is online but adds no match,
    # even in a room of its own.
    _presence(SessionLocal, u["p1"], "r1")
    _presence(SessionLocal, u["p2"], "r1")
    _presence(SessionLocal, u["spec"], "r7", role="spectator")
    _presence(SessionLocal, u["p3"], "r2")
    # A waiting room is online but not a match.
    _presence(SessionLocal, u["wait"], "r3", phase="waiting")
    # Finished rooms and stale rows count for nothing.
    _presence(SessionLocal, u["fin"], "r4", phase="finished")
    _presence(SessionLocal, u["stale"], "r5", age_s=600)
    _presence(SessionLocal, u["seenplay"], "r6", phase="waiting")
    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        db.add(DuelLobbySeen(user_id=u["seen"], seen_at=now))
        db.add(DuelLobbySeen(user_id=u["oldseen"], seen_at=now - timedelta(seconds=600)))
        db.add(DuelLobbySeen(user_id=u["seenplay"], seen_at=now))  # counted once
        db.commit()

    r = c.get("/duel/live")
    assert r.status_code == 200
    # online: p1 p2 p3 spec wait seen seenplay
    assert r.json() == {"online": 7, "matches": 2}


def test_live_result_is_cached_for_30_seconds_431(client, monkeypatch: pytest.MonkeyPatch):
    c, SessionLocal = client
    clock = [1000.0]
    monkeypatch.setattr(duel_router, "_live_clock", lambda: clock[0])
    assert c.get("/duel/live").json() == {"online": 0, "matches": 0}
    _presence(SessionLocal, _live_user(c, "p1"), "r1")
    clock[0] += 29
    assert c.get("/duel/live").json() == {"online": 0, "matches": 0}
    clock[0] += 2
    assert c.get("/duel/live").json() == {"online": 1, "matches": 1}
