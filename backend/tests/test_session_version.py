from __future__ import annotations

from app.auth import create_session_token, read_session_token
from app.config import Settings
from tests.conftest import make_user


def _settings() -> Settings:
    return Settings(session_secret="test-secret-for-session-version")


def test_session_token_embeds_version():
    settings = _settings()
    token = create_session_token(9, session_version=3, settings=settings)
    assert read_session_token(token, settings) == (9, 3)


def test_missing_sv_defaults_to_zero():
    settings = _settings()
    # Simulate a pre-hardening cookie that only carried uid.
    from itsdangerous import URLSafeTimedSerializer

    raw = URLSafeTimedSerializer(settings.session_secret, salt="optcg-auth").dumps(
        {"uid": 5}
    )
    assert read_session_token(raw, settings) == (5, 0)


def test_user_session_version_defaults(db):
    user = make_user(db, email="sv@example.com", name="SV", sub="sub-sv")
    assert int(user.session_version or 0) == 0
