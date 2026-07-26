from __future__ import annotations

import pytest

from app.config import get_settings


@pytest.fixture()
def prod_env(monkeypatch):
    """Base production-like environment with strong secrets; tests weaken one at a time."""
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://optcg.example.com")
    monkeypatch.setenv("SESSION_SECRET", "a-strong-session-secret")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "a-strong-sync-token")
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_production_with_strong_secrets_starts(prod_env):
    settings = get_settings()
    assert settings.is_production is True


def test_production_rejects_default_catalog_sync_token(prod_env, monkeypatch):
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "dev-sync-token")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="CATALOG_SYNC_TOKEN"):
        get_settings()


def test_production_rejects_default_session_secret(prod_env, monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "dev-secret-change-me")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        get_settings()


def test_production_rejects_dev_login(prod_env, monkeypatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="ENABLE_DEV_LOGIN"):
        get_settings()
