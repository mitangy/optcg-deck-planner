from __future__ import annotations

from app.core.auth import create_session_token, read_session_token
from app.core.config import Settings


def _settings() -> Settings:
    return Settings(session_secret="test-secret-for-session-version")


def test_session_token_embeds_version():
    settings = _settings()
    token = create_session_token(9, session_version=3, settings=settings)
    assert read_session_token(token, settings) == (9, 3)


def test_missing_sv_defaults_to_zero():
    settings = _settings()
    from itsdangerous import URLSafeTimedSerializer

    raw = URLSafeTimedSerializer(settings.session_secret, salt="optcg-auth").dumps(
        {"uid": 5}
    )
    assert read_session_token(raw, settings) == (5, 0)


def _client_with_user():
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app.core.db import get_db
    from app.core.models import User
    from app.main import app
    from tests.db_support import make_test_engine

    engine = make_test_engine()
    S = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with S() as db:
        user = User(email="renew@x.test", name="Renew", google_sub="sub-renew")
        db.add(user)
        db.commit()
        uid = user.id

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    return TestClient(app), uid, S


def _token_issued_days_ago(uid: int, days: float, sv: int = 0) -> str:
    from itsdangerous import TimestampSigner

    now = int(__import__("time").time())
    original = TimestampSigner.get_timestamp
    TimestampSigner.get_timestamp = lambda self: now - int(days * 86400)
    try:
        return create_session_token(uid, sv)
    finally:
        TimestampSigner.get_timestamp = original


def test_me_renews_a_session_older_than_a_week_1346(monkeypatch):
    from app.core.auth import SESSION_COOKIE
    from app.core.config import get_settings
    from app.main import app

    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    get_settings.cache_clear()
    try:
        c, uid, _ = _client_with_user()
        old = _token_issued_days_ago(uid, 8)
        c.cookies.set(SESSION_COOKIE, old)
        res = c.get("/auth/me")
        assert res.status_code == 200 and res.json()["id"] == uid
        renewed = res.cookies.get(SESSION_COOKIE)
        assert renewed and renewed != old
        assert read_session_token(renewed) == (uid, 0)

        fresh = _token_issued_days_ago(uid, 2)
        c.cookies.clear()
        c.cookies.set(SESSION_COOKIE, fresh)
        res = c.get("/auth/me")
        assert res.status_code == 200
        assert SESSION_COOKIE not in res.cookies

        c.cookies.clear()
        c.cookies.set(SESSION_COOKIE, _token_issued_days_ago(uid, 8, sv=5))
        res = c.get("/auth/me")
        assert res.json() is None
        assert SESSION_COOKIE not in res.cookies
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
