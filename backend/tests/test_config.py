from __future__ import annotations

import pytest

from app.core.config import get_settings


@pytest.fixture()
def prod_env(monkeypatch):
    """Base production-like environment with strong secrets; tests weaken one at a time."""
    monkeypatch.setenv("FRONTEND_ORIGIN", "https://optcg.example.com")
    monkeypatch.setenv("SESSION_SECRET", "a-strong-session-secret")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "a-strong-sync-token")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "a-strong-duel-ingest-secret")
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


def test_production_rejects_default_duel_ingest_secret(prod_env, monkeypatch):
    monkeypatch.setenv("DUEL_INGEST_SECRET", "dev-duel-ingest")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="DUEL_INGEST_SECRET"):
        get_settings()


def test_production_rejects_dev_login(prod_env, monkeypatch):
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "true")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="ENABLE_DEV_LOGIN"):
        get_settings()


def test_https_backend_url_counts_as_production(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("BACKEND_PUBLIC_URL", "https://api.example.com")
    monkeypatch.setenv("SESSION_SECRET", "a-strong-session-secret")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "a-strong-sync-token")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "a-strong-duel-ingest-secret")
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    get_settings.cache_clear()
    assert get_settings().is_production is True
    get_settings.cache_clear()


def test_postgres_database_counts_as_production(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("BACKEND_PUBLIC_URL", "http://localhost:8000")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("SESSION_SECRET", "a-strong-session-secret")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "a-strong-sync-token")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "a-strong-duel-ingest-secret")
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    get_settings.cache_clear()
    assert get_settings().is_production is True
    get_settings.cache_clear()


def test_local_sqlite_http_is_not_production(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("BACKEND_PUBLIC_URL", "http://localhost:8000")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./optcg.db")
    monkeypatch.delenv("SESSION_SECRET", raising=False)
    monkeypatch.delenv("CATALOG_SYNC_TOKEN", raising=False)
    monkeypatch.delenv("ENABLE_DEV_LOGIN", raising=False)
    get_settings.cache_clear()
    assert get_settings().is_production is False
    get_settings.cache_clear()


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:p@db.example.com/app",
        "postgresql://u:p@db.example.com/app",
        "postgresql+psycopg2://u:p@db.example.com/app",
    ],
)
def test_postgres_urls_use_the_installed_psycopg2_driver(url):
    # SQLAlchemy 2.1 made psycopg (v3) the default for bare postgresql:// URLs,
    # but only psycopg2-binary is installed; the app must name its driver.
    from sqlalchemy import create_engine

    from app.core.config import Settings

    engine = create_engine(Settings(database_url=url).sqlalchemy_url)
    assert engine.dialect.driver == "psycopg2"
    engine.dispose()


def test_production_rejects_ops_token_equal_to_catalog_token(prod_env, monkeypatch):
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "a-strong-sync-token")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="OPS_ADMIN_TOKEN"):
        get_settings()


def test_production_rejects_default_ops_token(prod_env, monkeypatch):
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "dev-sync-token")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="OPS_ADMIN_TOKEN"):
        get_settings()


def test_production_starts_with_a_distinct_ops_token_or_none(prod_env, monkeypatch):
    assert get_settings().ops_admin_token == ""
    monkeypatch.setenv("OPS_ADMIN_TOKEN", "a-different-strong-ops-token")
    get_settings.cache_clear()
    assert get_settings().ops_admin_token == "a-different-strong-ops-token"
