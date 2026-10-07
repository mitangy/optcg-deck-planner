"""Asking for the Log Pose chat panel: request, approve, deny, revoke (#393)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.models import AnalystAccess, User
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_analyst_chat import chat  # noqa: F401  (fixture: DEV@localhost is an owner)
from tests.test_analyst_stats import SERVICE
from tests.test_duel import client  # noqa: F401  (fixture)


def _player(SessionLocal, name: str) -> int:
    db = SessionLocal()
    try:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}", username=name)
        db.add(u)
        db.commit()
        return u.id
    finally:
        db.close()


def _as(c, uid: int) -> None:
    c.cookies.clear()
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))


def _owner(c) -> None:
    c.cookies.clear()
    c.post("/auth/dev-login")


def _session(c) -> dict:
    return c.post("/analyst/chat/session").json()


def _decide(c, uid: int, status: str):
    return c.post(f"/analyst/access/requests/{uid}", json={"status": status})


def test_a_request_is_stored_as_pending_and_the_session_reports_it_393(chat):
    c, SessionLocal = chat
    me = _player(SessionLocal, "nami")
    _as(c, me)
    assert _session(c)["access"] == "none"
    r = c.post("/analyst/access/request", json={"note": "  deck help  "})
    assert r.status_code == 201 and r.json() == {"access": "pending"}
    body = _session(c)
    assert body["enabled"] is False and body["access"] == "pending" and body["token"] is None
    assert c.post("/analyst/access/request", json={"note": "again"}).status_code == 409
    db = SessionLocal()
    try:
        row = db.query(AnalystAccess).one()
        assert row.user_id == me and row.note == "deck help" and row.status == "pending"
    finally:
        db.close()


def test_only_owners_can_list_or_decide_requests_393(chat):
    c, SessionLocal = chat
    nami, zoro = _player(SessionLocal, "nami"), _player(SessionLocal, "zoro")
    _as(c, nami)
    c.post("/analyst/access/request", json={"note": "please"})
    _as(c, zoro)
    assert c.get("/analyst/access/requests").status_code == 403
    assert _decide(c, nami, "approved").status_code == 403
    _owner(c)
    rows = c.get("/analyst/access/requests").json()["requests"]
    assert [(r["user_id"], r["status"], r["note"]) for r in rows] == [(nami, "pending", "please")]
    assert rows[0]["name"] == "nami"
    assert _decide(c, zoro, "approved").status_code == 404  # no request, nothing created
    db = SessionLocal()
    try:
        assert db.query(AnalystAccess).count() == 1
    finally:
        db.close()


def test_requests_list_pending_first_then_approved_then_denied_393(chat):
    c, SessionLocal = chat
    ids = [_player(SessionLocal, n) for n in ("a1", "b2", "c3", "d4")]
    for uid in ids:
        _as(c, uid)
        assert c.post("/analyst/access/request", json={}).status_code == 201
    _owner(c)
    _decide(c, ids[2], "denied")
    _decide(c, ids[3], "approved")
    order = [(r["user_id"], r["status"]) for r in c.get("/analyst/access/requests").json()["requests"]]
    assert order == [(ids[1], "pending"), (ids[0], "pending"), (ids[3], "approved"), (ids[2], "denied")]


def test_an_approved_player_gets_a_working_chat_token_and_denying_ends_it_393(chat):
    c, SessionLocal = chat
    me, other = _player(SessionLocal, "nami"), _player(SessionLocal, "zoro")
    _as(c, me)
    c.post("/analyst/access/request", json={"note": ""})
    _as(c, other)
    c.post("/analyst/access/request", json={"note": ""})
    _owner(c)
    assert _session(c) | {"token": None, "expires_at": None} == {
        "enabled": True, "token": None, "expires_at": None, "chat_url": "https://analyst.example",
        "access": None, "owner": True, "pending_requests": 2,
    }
    assert _decide(c, me, "approved").json()["status"] == "approved"
    assert _session(c)["pending_requests"] == 1

    _as(c, me)
    body = _session(c)
    assert body["enabled"] is True and body["owner"] is False and body["pending_requests"] == 0
    token = body["token"]
    assert c.get("/analyst/me", headers={"X-Analyst-Token": token}).status_code == 200

    _owner(c)
    _decide(c, me, "denied")
    assert c.get("/analyst/me", headers={"X-Analyst-Token": token, **SERVICE}).status_code == 401
    _as(c, me)
    assert _session(c)["access"] == "denied" and _session(c)["enabled"] is False


def test_no_request_form_is_offered_when_nobody_can_approve_393(analyst, monkeypatch):  # noqa: F811
    c, SessionLocal = analyst
    monkeypatch.setenv("ANALYST_CHAT_EMAILS", "")
    get_settings.cache_clear()
    _as(c, _player(SessionLocal, "nami"))
    assert _session(c)["access"] is None
    assert c.post("/analyst/access/request", json={}).status_code == 403


def test_a_denied_player_must_wait_a_day_to_ask_again_393(chat):
    c, SessionLocal = chat
    me = _player(SessionLocal, "nami")
    _as(c, me)
    c.post("/analyst/access/request", json={"note": "first"})
    _owner(c)
    _decide(c, me, "denied")
    _as(c, me)
    r = c.post("/analyst/access/request", json={"note": "second"})
    assert r.status_code == 429 and "tomorrow" in r.json()["detail"]

    db = SessionLocal()
    try:
        db.query(AnalystAccess).one().decided_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
    finally:
        db.close()
    assert c.post("/analyst/access/request", json={"note": "second"}).status_code == 201
    assert _session(c)["access"] == "pending"


def test_owners_and_approved_players_cannot_request_393(chat):
    c, SessionLocal = chat
    _owner(c)
    assert c.post("/analyst/access/request", json={}).status_code == 409
    me = _player(SessionLocal, "nami")
    _as(c, me)
    c.post("/analyst/access/request", json={})
    _owner(c)
    _decide(c, me, "approved")
    _as(c, me)
    assert c.post("/analyst/access/request", json={}).status_code == 409


def test_requests_are_rate_limited_per_ip_393(chat):
    c, SessionLocal = chat
    for i in range(5):
        _as(c, _player(SessionLocal, f"p{i}"))
        assert c.post("/analyst/access/request", json={}).status_code == 201
    _as(c, _player(SessionLocal, "p5"))
    assert c.post("/analyst/access/request", json={}).status_code == 429


def test_a_note_over_500_characters_is_refused_393(chat):
    c, SessionLocal = chat
    _as(c, _player(SessionLocal, "nami"))
    assert c.post("/analyst/access/request", json={"note": "x" * 501}).status_code == 422
