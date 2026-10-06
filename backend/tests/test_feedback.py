from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.db_support import make_test_engine
from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.game_tokens import mint_game_token
from app.main import app
from app.models import User
from app.routers import feedback

ADMIN = {"X-Catalog-Token": "test-admin-token"}
BODY = {
    "kind": "bug",
    "message": "The match menu does not close after I pick an item.",
    "app": "duel",
    "page": "/demo",
    "client_build": "abc1234",
    "viewport": "390x844",
    "user_agent": "Mozilla/5.0 test",
    "room_id": "room-1",
}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "test-admin-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    feedback._feedback_rate._hits.clear()
    feedback._feedback_global_rate._hits.clear()

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
    feedback._feedback_rate._hits.clear()
    feedback._feedback_global_rate._hits.clear()


def _user(SessionLocal, email: str, name: str) -> int:
    with SessionLocal() as db:
        user = User(email=email, name=name, google_sub=f"sub-{email}")
        db.add(user)
        db.commit()
        return user.id


def test_game_token_holder_is_recorded_as_sender_371(client):
    c, SessionLocal = client
    uid = _user(SessionLocal, "guest-abc@localhost", "Guest abc")
    token = mint_game_token(user_id=uid, email="guest-abc@localhost")["token"]
    r = c.post("/feedback", json=BODY, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == uid
    assert r.json()["room_id"] == "room-1"


def test_session_user_takes_precedence_over_game_token_371(client):
    c, SessionLocal = client
    session_uid = _user(SessionLocal, "miko@example.com", "Miko")
    token_uid = _user(SessionLocal, "guest-xyz@localhost", "Guest xyz")
    token = mint_game_token(user_id=token_uid, email="guest-xyz@localhost")["token"]
    c.cookies.set(SESSION_COOKIE, create_session_token(session_uid))
    r = c.post("/feedback", json=BODY, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == session_uid


def test_anonymous_feedback_is_accepted_371(client):
    c, _ = client
    r = c.post("/feedback", json=BODY)
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] is None
    assert r.json()["reporter"] == "anonymous"


def test_padded_short_message_is_rejected_371(client):
    c, _ = client
    r = c.post("/feedback", json={**BODY, "message": "  broken" + " " * 20})
    assert r.status_code == 422


def test_unknown_kind_is_rejected_371(client):
    c, _ = client
    assert c.post("/feedback", json={**BODY, "kind": "rant"}).status_code == 422


def test_feedback_is_rate_limited_per_client_371(client):
    c, _ = client
    codes = [c.post("/feedback", json=BODY).status_code for _ in range(11)]
    assert codes[:10] == [201] * 10
    assert codes[10] == 429


def test_feedback_is_capped_in_total_across_clients_371(client, monkeypatch: pytest.MonkeyPatch):
    from app.rate_limit import RateLimiter

    c, _ = client
    monkeypatch.setattr(feedback, "_feedback_global_rate", RateLimiter(max_calls=2, period_s=3600))
    codes = [
        c.post("/feedback", json=BODY, headers={"X-Forwarded-For": f"192.0.2.{i}"}).status_code
        for i in range(3)
    ]
    assert codes == [201, 201, 429]


def test_listing_feedback_requires_admin_token_371(client):
    c, _ = client
    c.post("/feedback", json=BODY)
    assert c.get("/feedback").status_code == 401
    r = c.get("/feedback", headers=ADMIN)
    assert r.status_code == 200
    assert [row["message"] for row in r.json()] == [BODY["message"]]


def test_fixed_feedback_leaves_the_default_open_list_371(client):
    c, _ = client
    first = c.post("/feedback", json={**BODY, "kind": "idea"}).json()
    c.post("/feedback", json={**BODY, "kind": "other"})
    assert c.patch(f"/feedback/{first['id']}", json={"status": "fixed"}).status_code == 401
    r = c.patch(f"/feedback/{first['id']}", json={"status": "fixed"}, headers=ADMIN)
    assert r.status_code == 200
    assert [row["kind"] for row in c.get("/feedback", headers=ADMIN).json()] == ["other"]
    all_kinds = [row["kind"] for row in c.get("/feedback?status=all", headers=ADMIN).json()]
    assert sorted(all_kinds) == ["idea", "other"]
