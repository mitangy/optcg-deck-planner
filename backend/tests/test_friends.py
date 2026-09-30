from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import Base, DuelInvite, DuelPresence, User
from app.routers import friends as friends_router

INGEST = {"X-Duel-Ingest-Token": "test-ingest"}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    # Fresh buckets per test: request/invite limits are keyed by user id.
    friends_router._request_rate._hits.clear()
    friends_router._invite_rate._hits.clear()

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


def _user(SessionLocal, username: str) -> int:
    with SessionLocal() as db:
        u = User(email=f"{username}@x.test", name=username, google_sub=f"sub-{username}", username=username)
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _befriend(c: TestClient, a: int, b: int, b_name: str, a_name: str) -> None:
    assert _as(c, a).post("/friends/requests", json={"username": b_name}).json()["status"] == "pending"
    assert _as(c, b).post(f"/friends/requests/{a}/accept").status_code == 200


def _snapshot(c: TestClient, entries: list[dict], instance: str = "gs-1"):
    return c.put("/duel/presence", json={"instance_id": instance, "entries": entries}, headers=INGEST)


def test_request_then_accept_makes_both_friends(client):
    c, S = client
    luffy, zoro, nami = _user(S, "Luffy"), _user(S, "Zoro"), _user(S, "Nami")

    assert _as(c, luffy).post("/friends/requests", json={"username": "zoro"}).json()["status"] == "pending"
    before = _as(c, zoro).get("/friends").json()
    assert before["friends"] == []
    assert [r["username"] for r in before["incoming"]] == ["Luffy"]
    assert [r["username"] for r in _as(c, luffy).get("/friends").json()["outgoing"]] == ["Zoro"]

    assert _as(c, zoro).post(f"/friends/requests/{luffy}/accept").status_code == 200
    assert [f["username"] for f in _as(c, luffy).get("/friends").json()["friends"]] == ["Zoro"]
    assert [f["username"] for f in _as(c, zoro).get("/friends").json()["friends"]] == ["Luffy"]
    assert _as(c, nami).get("/friends").json()["friends"] == []


def test_requester_cannot_accept_own_request(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _as(c, luffy).post("/friends/requests", json={"username": "Zoro"})
    assert _as(c, luffy).post(f"/friends/requests/{zoro}/accept").status_code == 404
    assert _as(c, luffy).get("/friends").json()["friends"] == []


def test_crossed_requests_become_friends(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _as(c, luffy).post("/friends/requests", json={"username": "Zoro"})
    assert _as(c, zoro).post("/friends/requests", json={"username": "Luffy"}).json()["status"] == "accepted"
    assert [f["username"] for f in _as(c, luffy).get("/friends").json()["friends"]] == ["Zoro"]


def test_remove_friend_ends_friendship_for_both(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    assert _as(c, zoro).delete(f"/friends/{luffy}").status_code == 204
    assert _as(c, luffy).get("/friends").json()["friends"] == []


def test_presence_requires_ingest_secret(client):
    c, S = client
    luffy = _user(S, "Luffy")
    r = c.put("/duel/presence", json={"instance_id": "gs-1", "entries": [{"user_id": luffy, "room_id": "r1"}]}, headers={"X-Duel-Ingest-Token": "wrong"})
    assert r.status_code == 401
    with S() as db:
        assert db.query(DuelPresence).count() == 0


def test_friend_status_follows_presence_snapshots(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")

    assert _snapshot(c, [{"user_id": zoro, "room_id": "room-a", "phase": "playing"}]).status_code == 204
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("in_game", "room-a")

    # Next snapshot no longer lists Zoro: the game ended and the room closed.
    _snapshot(c, [])
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("offline", None)

    # Zoro opens the lobby (which polls /friends): now online.
    _as(c, zoro).get("/friends")
    assert _as(c, luffy).get("/friends").json()["friends"][0]["status"] == "online"


def test_waiting_room_is_not_exposed(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    _snapshot(c, [{"user_id": zoro, "room_id": "room-w", "phase": "waiting"}])
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("waiting", None)


def test_spectator_in_waiting_room_does_not_expose_it(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    _snapshot(c, [{"user_id": zoro, "room_id": "room-w", "role": "spectator", "phase": "waiting"}])
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("spectating", None)

    _snapshot(c, [{"user_id": zoro, "room_id": "room-w", "role": "spectator", "phase": "playing"}])
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("spectating", "room-w")


def test_stale_presence_and_seen_read_as_offline(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    _snapshot(c, [{"user_id": zoro, "room_id": "room-a"}])
    _as(c, zoro).get("/friends")  # Zoro was in the lobby too

    later = datetime.now(timezone.utc) + timedelta(minutes=5)
    monkeypatch.setattr(friends_router, "utcnow", lambda: later)
    f = _as(c, luffy).get("/friends").json()["friends"][0]
    assert (f["status"], f["room_id"]) == ("offline", None)


def test_presence_ignores_non_friends(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _as(c, luffy).post("/friends/requests", json={"username": "Zoro"})  # never accepted
    _snapshot(c, [{"user_id": zoro, "room_id": "room-a"}])
    body = _as(c, luffy).get("/friends").json()
    assert body["friends"] == []
    assert "room-a" not in str(body)


def test_invite_only_friends(client):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    r = _as(c, luffy).post(f"/friends/{zoro}/invite", json={"room_id": "room-p"})
    assert r.status_code == 403
    assert _as(c, zoro).get("/friends").json()["invites"] == []


def test_invite_reaches_friend_until_inviter_leaves_room(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    luffy, zoro = _user(S, "Luffy"), _user(S, "Zoro")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    assert _as(c, luffy).post(f"/friends/{zoro}/invite", json={"room_id": "room-p"}).status_code == 200

    invites = _as(c, zoro).get("/friends").json()["invites"]
    assert [(i["from_username"], i["room_id"]) for i in invites] == [("Luffy", "room-p")]

    # A minute later Luffy is still waiting in the room: invite stands.
    later = datetime.now(timezone.utc) + timedelta(minutes=1)
    monkeypatch.setattr(friends_router, "utcnow", lambda: later)
    with S() as db:
        db.add(DuelPresence(user_id=luffy, room_id="room-p", instance_id="gs-1", role="player", phase="waiting", updated_at=later))
        db.commit()
    assert len(_as(c, zoro).get("/friends").json()["invites"]) == 1

    # Luffy left the room: the invite goes away.
    with S() as db:
        db.query(DuelPresence).delete()
        db.commit()
    assert _as(c, zoro).get("/friends").json()["invites"] == []


def test_dismissed_invite_is_gone_but_others_cannot_dismiss(client):
    c, S = client
    luffy, zoro, nami = _user(S, "Luffy"), _user(S, "Zoro"), _user(S, "Nami")
    _befriend(c, luffy, zoro, "Zoro", "Luffy")
    invite_id = _as(c, luffy).post(f"/friends/{zoro}/invite", json={"room_id": "room-p"}).json()["id"]

    _as(c, nami).delete(f"/friends/invites/{invite_id}")
    with S() as db:
        assert db.get(DuelInvite, invite_id) is not None

    _as(c, zoro).delete(f"/friends/invites/{invite_id}")
    assert _as(c, zoro).get("/friends").json()["invites"] == []
