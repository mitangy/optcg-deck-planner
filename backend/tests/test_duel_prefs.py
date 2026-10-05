from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from tests.db_support import make_test_engine
from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import User
from app.routers import duel_prefs

JPEG = b"\xff\xd8\xff\xe0" + b"jpeg-bytes"
PNG = b"\x89PNG\r\n\x1a\n" + b"png-bytes"
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"webp-bytes"


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    duel_prefs._upload_rate._hits.clear()

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


def _user(SessionLocal, name: str) -> int:
    with SessionLocal() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}")
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _upload(c: TestClient, kind: str, data: bytes, **params) -> dict:
    res = c.post(f"/duel/cosmetics/{kind}", content=data, params=params)
    assert res.status_code == 201, res.text
    return res.json()


def test_settings_follow_the_account_without_device_only_fields(client):
    c, S = client
    luffy = _user(S, "luffy")
    assert _as(c, luffy).get("/duel/settings").json()["settings"] is None

    saved = c.put(
        "/duel/settings",
        json={"settings": {"handLayout": "grid", "turnSound": True, "joinSecret": "s3cret", "serverUrl": "ws://x"}},
    )
    assert saved.status_code == 200
    assert c.get("/duel/settings").json()["settings"] == {"handLayout": "grid", "turnSound": True}


def test_upload_becomes_active_and_older_uploads_can_be_picked_again(client):
    c, S = client
    luffy = _user(S, "luffy")
    first = _upload(_as(c, luffy), "playmat", JPEG)
    first_id = first["active"]["playmat"]
    second = _upload(c, "playmat", PNG)
    second_id = second["active"]["playmat"]
    assert second_id != first_id
    assert [i["id"] for i in second["items"]] == [second_id, first_id]
    assert second["active"]["cardBack"] is None

    back = c.put("/duel/cosmetics/active", json={"kind": "playmat", "id": first_id}).json()
    assert back["active"]["playmat"] == first_id
    img = c.get(f"/duel/cosmetics/{first_id}/image")
    assert img.status_code == 200
    assert img.content == JPEG
    assert img.headers["content-type"] == "image/jpeg"


def test_images_are_private_to_their_owner(client):
    c, S = client
    luffy, zoro = _user(S, "luffy"), _user(S, "zoro")
    mat = _upload(_as(c, luffy), "playmat", JPEG)["active"]["playmat"]

    assert _as(c, zoro).get(f"/duel/cosmetics/{mat}/image").status_code == 404
    assert c.put("/duel/cosmetics/active", json={"kind": "playmat", "id": mat}).status_code == 404
    assert c.delete(f"/duel/cosmetics/{mat}").status_code == 404
    assert c.get("/duel/cosmetics").json()["items"] == []


def test_only_real_images_are_accepted(client):
    c, S = client
    luffy = _user(S, "luffy")
    res = _as(c, luffy).post(
        "/duel/cosmetics/cardBack", content=b"<html><script>x</script></html>",
        headers={"Content-Type": "image/png"},
    )
    assert res.status_code == 415
    assert _upload(c, "cardBack", WEBP)["active"]["cardBack"] is not None


def test_oversized_uploads_are_refused(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    monkeypatch.setitem(duel_prefs.MAX_BYTES, "cardBack", 64)
    luffy = _user(S, "luffy")
    res = _as(c, luffy).post("/duel/cosmetics/cardBack", content=JPEG + b"x" * 100)
    assert res.status_code == 413
    assert c.get("/duel/cosmetics").json()["items"] == []


def test_history_is_capped_but_never_drops_the_image_in_use(client, monkeypatch: pytest.MonkeyPatch):
    c, S = client
    monkeypatch.setattr(duel_prefs, "MAX_PER_KIND", 3)
    luffy = _user(S, "luffy")
    oldest = _upload(_as(c, luffy), "playmat", JPEG)["active"]["playmat"]
    for _ in range(4):
        out = _upload(c, "playmat", JPEG, activate="false")
    ids = [i["id"] for i in out["items"]]
    assert len(ids) == 3
    assert oldest in ids
    assert out["active"]["playmat"] == oldest


def test_deleting_the_active_image_falls_back_to_default(client):
    c, S = client
    luffy = _user(S, "luffy")
    back = _upload(_as(c, luffy), "cardBack", WEBP)["active"]["cardBack"]
    out = c.delete(f"/duel/cosmetics/{back}").json()
    assert out["items"] == []
    assert out["active"]["cardBack"] is None



def test_uploads_stop_once_all_accounts_fill_the_image_budget_SEC(client, monkeypatch: pytest.MonkeyPatch):
    c, SessionLocal = client
    a, b = _user(SessionLocal, "budget-a"), _user(SessionLocal, "budget-b")
    monkeypatch.setattr(duel_prefs, "MAX_TOTAL_COSMETIC_BYTES", len(JPEG) + len(PNG) - 1)
    _upload(_as(c, a), "playmat", JPEG)
    res = _as(c, b).post("/duel/cosmetics/cardBack", content=PNG)
    assert res.status_code == 507
    assert _as(c, b).get("/duel/cosmetics").json()["items"] == []
