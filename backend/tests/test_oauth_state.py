from __future__ import annotations

from app.auth import create_oauth_state, new_oauth_nonce, verify_oauth_state
from app.config import Settings


def _settings() -> Settings:
    return Settings(session_secret="test-secret-for-oauth-state")


def test_oauth_state_requires_matching_nonce():
    settings = _settings()
    nonce = new_oauth_nonce()
    state = create_oauth_state(nonce, settings)
    assert verify_oauth_state(state, nonce, settings) is True
    assert verify_oauth_state(state, "wrong-nonce", settings) is False
    assert verify_oauth_state(state, None, settings) is False


def test_oauth_state_rejects_tampered_payload():
    settings = _settings()
    nonce = new_oauth_nonce()
    state = create_oauth_state(nonce, settings)
    assert verify_oauth_state(state + "x", nonce, settings) is False
