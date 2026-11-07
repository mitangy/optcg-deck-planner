"""The catalog sync token and the ops admin token open different routes (refactor 0.4, D-06)."""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import get_db
from app.main import app
from tests.db_support import make_test_engine

CATALOG = {"X-Catalog-Token": "catalog-secret"}
OPS = {"X-Ops-Token": "ops-secret"}
# The ops token in the old header too, so existing curl users and the workflow keep working.
OPS_LEGACY_HEADER = {"X-Catalog-Token": "ops-secret"}

# One route per guarded family: (method, path, json)
CATALOG_ROUTES = [
    ("GET", "/admin/sync-catalog/status", None),
    ("POST", "/catalog/price-history/import", {"day": "2026-01-01", "prices": {}}),
]
OPS_ROUTES = [
    ("GET", "/duel/admin/game-server-pool", None),
    ("GET", "/duel/card-reports", None),
    ("PATCH", "/duel/card-reports/1", {"status": "fixed"}),
    ("GET", "/feedback", None),
    ("PATCH", "/feedback/1", {"status": "fixed"}),
]


def _client(monkeypatch: pytest.MonkeyPatch, ops: str | None):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "catalog-secret")
    if ops is None:
        monkeypatch.delenv("OPS_ADMIN_TOKEN", raising=False)
    else:
        monkeypatch.setenv("OPS_ADMIN_TOKEN", ops)
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    SessionLocal = sessionmaker(bind=make_test_engine(), autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


@pytest.fixture()
def split_client(monkeypatch: pytest.MonkeyPatch):
    with _client(monkeypatch, "ops-secret") as c:
        yield c
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture()
def fallback_client(monkeypatch: pytest.MonkeyPatch):
    with _client(monkeypatch, None) as c:
        yield c
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.mark.parametrize(("method", "path", "body"), OPS_ROUTES)
def test_catalog_token_is_refused_on_ops_routes_once_ops_token_is_set(split_client, method, path, body):
    r = split_client.request(method, path, json=body, headers=CATALOG)
    assert r.status_code == 401, r.text


@pytest.mark.parametrize(("method", "path", "body"), OPS_ROUTES)
def test_ops_token_is_accepted_on_ops_routes_in_either_header(split_client, method, path, body):
    for headers in (OPS, OPS_LEGACY_HEADER):
        r = split_client.request(method, path, json=body, headers=headers)
        assert r.status_code not in (401, 503), (path, headers, r.text)


@pytest.mark.parametrize(("method", "path", "body"), CATALOG_ROUTES)
def test_ops_token_is_refused_on_catalog_routes(split_client, method, path, body):
    for headers in (OPS, OPS_LEGACY_HEADER):
        r = split_client.request(method, path, json=body, headers=headers)
        assert r.status_code == 401, (path, headers, r.text)
    ok = split_client.request(method, path, json=body, headers=CATALOG)
    assert ok.status_code not in (401, 503), ok.text


@pytest.mark.parametrize(("method", "path", "body"), OPS_ROUTES)
def test_ops_routes_fall_back_to_the_catalog_token_while_ops_token_is_unset(fallback_client, method, path, body):
    assert fallback_client.request(method, path, json=body).status_code == 401
    assert fallback_client.request(method, path, json=body, headers={"X-Catalog-Token": "guess"}).status_code == 401
    r = fallback_client.request(method, path, json=body, headers=CATALOG)
    assert r.status_code not in (401, 503), r.text


def test_unset_ops_token_logs_the_fallback_warning_once(monkeypatch: pytest.MonkeyPatch, caplog):
    monkeypatch.delenv("OPS_ADMIN_TOKEN", raising=False)
    get_settings.cache_clear()
    with caplog.at_level(logging.WARNING, logger="app.config"):
        get_settings()
        get_settings()
    get_settings.cache_clear()
    hits = [m for m in caplog.messages if "OPS_ADMIN_TOKEN unset; falling back to CATALOG_SYNC_TOKEN" in m]
    assert len(hits) == 1


def test_starting_a_catalog_sync_needs_the_catalog_token_not_the_ops_token(split_client, monkeypatch: pytest.MonkeyPatch):
    from app.routers import api

    monkeypatch.setattr(api, "try_claim_sync_slot", lambda: False)  # never start a real sync
    for headers in ({}, OPS, OPS_LEGACY_HEADER):
        assert split_client.post("/admin/sync-catalog", headers=headers).status_code == 401, headers
    ok = split_client.post("/admin/sync-catalog", headers=CATALOG)
    assert ok.status_code == 202 and ok.json()["status"] == "already_running"
