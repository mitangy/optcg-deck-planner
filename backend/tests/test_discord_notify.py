"""Feedback and card reports are forwarded to a Discord webhook (#979)."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import discord_notify
from app.config import get_settings
from app.db import get_db
from app.game_tokens import mint_game_token
from app.main import app
from app.models import User
from app.routers import duel, feedback
from tests.db_support import make_test_engine

HOOK = "https://discord.test/api/webhooks/1/secret-token"
FEEDBACK = {
    "kind": "bug",
    "message": "The match menu does not close after I pick an item.",
    "app": "duel",
    "page": "/demo",
    "client_build": "abc1234",
    "viewport": "390x844",
    "user_agent": "DistinctiveAgent/9.9",
    "room_id": "room-1",
}
REPORT = {"card_id": "op01-060", "description": "On Play search never offers a choice."}


def _reset():
    get_settings.cache_clear()
    feedback._feedback_rate._hits.clear()
    feedback._feedback_global_rate._hits.clear()
    duel._report_rate._hits.clear()
    duel._report_global_rate._hits.clear()


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("GAME_TOKEN_SECRET", "test-game-token")
    monkeypatch.setenv("CATALOG_SYNC_TOKEN", "test-admin-token")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.delenv("DISCORD_FEEDBACK_WEBHOOK_URL", raising=False)
    _reset()
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
    _reset()


@pytest.fixture()
def posted(monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[str, dict]] = []

    def fake(url, body):
        calls.append((url, body))

    monkeypatch.setattr(feedback, "post_to_discord", fake)
    monkeypatch.setattr(duel, "post_to_discord", fake)
    return calls


def _enable(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DISCORD_FEEDBACK_WEBHOOK_URL", HOOK)
    get_settings.cache_clear()


def _token(SessionLocal, name: str) -> dict:
    with SessionLocal() as db:
        user = User(email=f"{name}@localhost", name=name, google_sub=f"sub-{name}")
        db.add(user)
        db.commit()
        uid = user.id
    return {"Authorization": f"Bearer {mint_game_token(user_id=uid, email=f'{name}@localhost')['token']}"}


def test_feedback_is_posted_to_discord_with_title_message_and_reporter_979(client, posted, monkeypatch):
    c, SessionLocal = client
    _enable(monkeypatch)
    r = c.post("/feedback", json=FEEDBACK, headers=_token(SessionLocal, "Miko"))
    assert r.status_code == 201, r.text
    assert len(posted) == 1
    url, body = posted[0]
    assert url == HOOK
    embed = body["embeds"][0]
    assert embed["title"] == "Bug report · Duel app"
    assert embed["description"] == FEEDBACK["message"]
    fields = {f["name"]: f["value"] for f in embed["fields"]}
    assert fields["Reporter"] == "Miko"
    assert fields["Page"] == "/demo" and fields["Room"] == "room-1" and fields["Build"] == "abc1234"
    assert fields["Viewport"] == "390x844"
    assert embed["footer"]["text"] == f"Feedback #{r.json()['id']}"
    assert body["username"] == "Den Den Mushi"


def test_discord_post_never_carries_the_user_agent_or_user_id_979(client, posted, monkeypatch):
    c, SessionLocal = client
    _enable(monkeypatch)
    c.post("/feedback", json=FEEDBACK, headers=_token(SessionLocal, "Miko"))
    assert "DistinctiveAgent" not in repr(posted[0][1])
    assert "user_id" not in repr(posted[0][1])


def test_nothing_is_posted_when_the_webhook_is_not_configured_979(client, posted):
    c, _ = client
    assert c.post("/feedback", json=FEEDBACK).status_code == 201
    assert c.post("/duel/card-reports", json=REPORT).status_code == 201
    assert posted == []


def test_card_report_is_posted_with_the_card_id_in_the_title_979(client, posted, monkeypatch):
    c, _ = client
    _enable(monkeypatch)
    r = c.post("/duel/card-reports", json={**REPORT, "source": "practice"})
    assert r.status_code == 201, r.text
    assert len(posted) == 1
    embed = posted[0][1]["embeds"][0]
    assert embed["title"] == "Card report · OP01-060"
    assert embed["description"] == REPORT["description"]
    fields = {f["name"]: f["value"] for f in embed["fields"]}
    assert fields["Reporter"] == "anonymous" and fields["Source"] == "practice"
    assert embed["footer"]["text"] == f"Card report #{r.json()['id']}"


def test_discord_messages_never_ping_anyone_979(client, posted, monkeypatch):
    c, _ = client
    _enable(monkeypatch)
    c.post("/feedback", json={**FEEDBACK, "message": "@everyone this menu is broken"})
    c.post("/duel/card-reports", json={**REPORT, "description": "@everyone this card is broken"})
    assert len(posted) == 2
    assert all(body["allowed_mentions"] == {"parse": []} for _, body in posted)


def test_blank_optional_fields_are_left_out_of_the_discord_embed_979(client, posted, monkeypatch):
    c, _ = client
    _enable(monkeypatch)
    c.post("/feedback", json={"kind": "idea", "message": "Add a dark mode please!", "app": "planner"})
    c.post("/duel/card-reports", json=REPORT)
    for _, body in posted:
        names = [f["name"] for f in body["embeds"][0]["fields"]]
        assert names == ["Reporter"]
        assert all(f["value"] for f in body["embeds"][0]["fields"])
    assert posted[0][1]["embeds"][0]["title"] == "Idea · Deck planner"


def test_long_text_is_cut_to_what_discord_accepts_979():
    row = type("Row", (), dict(
        id=1, kind="bug", app="duel", message="x" * 5000, page="p" * 2000,
        room_id="", client_build="", viewport="",
    ))()
    embed = discord_notify.feedback_message(row, "Miko")["embeds"][0]
    assert len(embed["description"]) == 4000
    assert all(len(f["value"]) <= 1024 for f in embed["fields"])


def test_a_discord_outage_does_not_fail_the_players_feedback_979(client, monkeypatch):
    c, _ = client
    _enable(monkeypatch)
    seen = []

    def boom(url, **kw):
        seen.append(url)
        raise httpx.ConnectError("discord is down")

    monkeypatch.setattr(httpx, "post", boom)
    assert c.post("/feedback", json=FEEDBACK).status_code == 201
    assert c.post("/duel/card-reports", json=REPORT).status_code == 201
    assert seen == [HOOK, HOOK]


def test_post_to_discord_swallows_errors_and_bad_statuses_979(monkeypatch, caplog):
    def bad_status(url, **kw):
        return httpx.Response(500, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", bad_status)
    discord_notify.post_to_discord(HOOK, {"a": 1})

    def boom(url, **kw):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(httpx, "post", boom)
    discord_notify.post_to_discord(HOOK, {"a": 1})
    assert "secret-token" not in caplog.text
    assert "Discord webhook" in caplog.text
