from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi.testclient import TestClient

from app.auth import (
    OAUTH_NONCE_COOKIE,
    OAUTH_RETURN_COOKIE,
    create_oauth_state,
    new_oauth_nonce,
)
from app.config import get_settings
from app.main import app

PLANNER_API = "https://planner.example/api"
DUEL = "https://duel.example"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    # https:// BACKEND_PUBLIC_URL marks settings as production; satisfy its checks.
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "test-sync-token")
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("ENABLE_DEV_LOGIN", "false")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("BACKEND_PUBLIC_URL", PLANNER_API)
    monkeypatch.setenv("DUEL_CORS_ORIGINS", f"{DUEL},https://proxyless.example")
    monkeypatch.setenv("OAUTH_CALLBACK_ORIGINS", DUEL)
    get_settings.cache_clear()
    yield TestClient(app, base_url="https://api.example")
    get_settings.cache_clear()


def _redirect_uri(client: TestClient, query: str = "") -> str:
    r = client.get(f"/auth/google{query}", follow_redirects=False)
    assert r.status_code in (302, 307)
    return parse_qs(urlparse(r.headers["location"]).query)["redirect_uri"][0]


def test_planner_login_uses_backend_public_url(client: TestClient):
    assert _redirect_uri(client) == f"{PLANNER_API}/auth/callback"


def test_proxied_spa_gets_its_own_callback(client: TestClient):
    assert _redirect_uri(client, f"?return_to={DUEL}") == f"{DUEL}/api/auth/callback"


def test_return_to_without_proxy_keeps_planner_callback(client: TestClient):
    assert (
        _redirect_uri(client, "?return_to=https://proxyless.example")
        == f"{PLANNER_API}/auth/callback"
    )


def test_unlisted_return_to_cannot_pick_callback(client: TestClient):
    assert (
        _redirect_uri(client, "?return_to=https://evil.example")
        == f"{PLANNER_API}/auth/callback"
    )


def test_callback_exchanges_code_with_matching_redirect_uri(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    seen: dict[str, str] = {}

    async def fake_fetch_token(self, url, **kwargs):
        seen["authorization_response"] = kwargs["authorization_response"]
        seen["redirect_uri"] = self.redirect_uri
        raise RuntimeError("stop before calling Google")

    monkeypatch.setattr(AsyncOAuth2Client, "fetch_token", fake_fetch_token)
    nonce = new_oauth_nonce()
    state = create_oauth_state(nonce, get_settings())
    client.cookies.set(OAUTH_NONCE_COOKIE, nonce)
    client.cookies.set(OAUTH_RETURN_COOKIE, DUEL)

    r = client.get(f"/auth/callback?code=abc&state={state}", follow_redirects=False)

    assert r.status_code == 400
    assert seen["redirect_uri"] == f"{DUEL}/api/auth/callback"
    assert seen["authorization_response"].startswith(f"{DUEL}/api/auth/callback?code=abc")
