from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.cors import TieredCORSMiddleware

EXACT = "https://optcgduel.app"
BRANCH = "https://optcg-duel-web-git-feat-x-miko21.vercel.app"
BRANCH_RE = r"https://optcg-duel-web-git-[a-z0-9-]+-miko21\.vercel\.app"


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()

    @app.post("/ping")
    def ping():
        return {"ok": True}

    app.add_middleware(
        TieredCORSMiddleware,
        credentialed_origins=[EXACT],
        credentialless_regex=BRANCH_RE,
    )
    return TestClient(app)


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/ping",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


def test_exact_origin_gets_credentialed_cors(client: TestClient):
    r = _preflight(client, EXACT)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == EXACT
    assert r.headers["access-control-allow-credentials"] == "true"

    r = client.post("/ping", headers={"Origin": EXACT})
    assert r.headers["access-control-allow-origin"] == EXACT
    assert r.headers["access-control-allow-credentials"] == "true"


def test_branch_origin_gets_cors_without_credentials(client: TestClient):
    r = _preflight(client, BRANCH)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == BRANCH
    assert "access-control-allow-credentials" not in r.headers

    r = client.post("/ping", headers={"Origin": BRANCH})
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == BRANCH
    assert "access-control-allow-credentials" not in r.headers


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        f"{BRANCH}.evil.example",
        f"https://evil.example/{BRANCH}",
    ],
)
def test_unknown_origin_is_rejected(client: TestClient, origin: str):
    r = _preflight(client, origin)
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers
