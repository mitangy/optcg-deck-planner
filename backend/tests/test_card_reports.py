from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.game_tokens import mint_game_token
from app.main import app
from app.models import Base, User
from app.routers import duel

ADMIN = {"X-Catalog-Token": "test-admin-token"}
REPORT = {"card_id": "op01-060", "description": "On Play search never offers a choice."}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "test-admin-token")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    duel._report_rate._hits.clear()

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
    duel._report_rate._hits.clear()


def _user(SessionLocal, email: str, name: str) -> int:
    with SessionLocal() as db:
        user = User(email=email, name=name, google_sub=f"sub-{email}")
        db.add(user)
        db.commit()
        return user.id


def test_game_token_holder_is_recorded_as_reporter(client):
    c, SessionLocal = client
    uid = _user(SessionLocal, "guest-abc@localhost", "Guest abc")
    token = mint_game_token(user_id=uid, email="guest-abc@localhost")["token"]
    r = c.post("/duel/card-reports", json=REPORT, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == uid


def test_session_user_takes_precedence_over_game_token(client):
    c, SessionLocal = client
    session_uid = _user(SessionLocal, "miko@example.com", "Miko")
    token_uid = _user(SessionLocal, "guest-xyz@localhost", "Guest xyz")
    token = mint_game_token(user_id=token_uid, email="guest-xyz@localhost")["token"]
    c.cookies.set(SESSION_COOKIE, create_session_token(session_uid))
    r = c.post("/duel/card-reports", json=REPORT, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    assert r.json()["user_id"] == session_uid


def test_padded_short_description_is_rejected(client):
    c, _ = client
    r = c.post(
        "/duel/card-reports",
        json={"card_id": "OP01-060", "description": "  broken" + " " * 20},
    )
    assert r.status_code == 422


def test_reports_are_rate_limited_per_client(client):
    c, _ = client
    codes = [c.post("/duel/card-reports", json=REPORT).status_code for _ in range(11)]
    assert codes[:10] == [201] * 10
    assert codes[10] == 429


def test_listing_reports_requires_admin_token(client):
    c, _ = client
    c.post("/duel/card-reports", json=REPORT)
    assert c.get("/duel/card-reports").status_code == 401
    r = c.get("/duel/card-reports", headers=ADMIN)
    assert r.status_code == 200
    assert [row["description"] for row in r.json()] == [REPORT["description"]]


def test_fixed_reports_leave_the_default_open_list(client):
    c, _ = client
    first = c.post("/duel/card-reports", json=REPORT).json()
    c.post("/duel/card-reports", json={**REPORT, "card_id": "ST01-005"})
    assert c.patch(f"/duel/card-reports/{first['id']}", json={"status": "fixed"}).status_code == 401
    r = c.patch(f"/duel/card-reports/{first['id']}", json={"status": "fixed"}, headers=ADMIN)
    assert r.status_code == 200
    open_ids = [row["card_id"] for row in c.get("/duel/card-reports", headers=ADMIN).json()]
    assert open_ids == ["ST01-005"]
    all_ids = [
        row["card_id"]
        for row in c.get("/duel/card-reports?status=all", headers=ADMIN).json()
    ]
    assert sorted(all_ids) == ["OP01-060", "ST01-005"]
