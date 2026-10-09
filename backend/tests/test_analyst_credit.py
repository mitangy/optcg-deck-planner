"""Log Pose's monthly credit, free spots, top-ups, usage analytics and thread deletion (#446)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.analyst_credit import month_key, month_start
from app.config import get_settings
from app.models import AnalystAccess, AnalystMessage, AnalystThread, AnalystUsage
from tests.test_analyst_access import SERVICE, _as, _decide, _owner, _player, _session  # noqa: F401
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_analyst_chat import chat  # noqa: F401  (fixture: DEV@localhost is an owner)
from tests.test_duel import client  # noqa: F401  (fixture)

TOKEN = "X-Analyst-Token"


def _approved(c, SessionLocal, name: str) -> tuple[int, str]:
    """A player an owner approved by hand, with their chat token."""
    uid = _player(SessionLocal, name)
    _as(c, uid)
    c.post("/analyst/access/request", json={})
    _owner(c)
    _decide(c, uid, "approved")
    _as(c, uid)
    return uid, _session(c)["token"]


def _spend(SessionLocal, uid: int, cost: float, when: datetime | None = None, **extra) -> None:
    db = SessionLocal()
    try:
        db.add(AnalystUsage(user_id=uid, kind="chat", cost_usd=cost, **({"created_at": when} if when else {}), **extra))
        db.commit()
    finally:
        db.close()


def _budget(c, token: str, **params) -> dict:
    r = c.get("/analyst/chat/budget", params=params, headers={TOKEN: token, **SERVICE})
    assert r.status_code == 200, r.text
    return r.json()


def _caps(monkeypatch, daily="100", monthly="1000", spots=None):
    monkeypatch.setenv("ANALYST_CHAT_DAILY_USD", daily)
    monkeypatch.setenv("ANALYST_CHAT_MONTHLY_USD", monthly)
    if spots is not None:
        monkeypatch.setenv("ANALYST_FREE_SPOTS", str(spots))
    get_settings.cache_clear()


def test_a_player_who_used_their_credit_is_refused_with_credit_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 4.9)
    b = _budget(c, token)
    assert (b["refusal"], b["allowed"], b["credit_usd"]) == (None, True, 5.0)
    assert b["credit_spent_usd"] == pytest.approx(4.9)
    _spend(SessionLocal, uid, 0.1)
    b = _budget(c, token)
    assert (b["refusal"], b["allowed"]) == ("credit", False)
    assert b["credit_resets_at"] > datetime.now(timezone.utc).isoformat()


def test_spend_from_last_month_does_not_count_against_this_months_credit_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 5.0, month_start(datetime.now(timezone.utc)) - timedelta(days=1))
    b = _budget(c, token)
    assert b["credit_spent_usd"] == 0 and b["refusal"] is None and b["allowed"] is True


def test_a_running_answers_cost_counts_toward_the_credit_446(chat, monkeypatch):
    """The analyst passes what the answer has cost so far, so a long answer can't run past the credit."""
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 4.9)
    assert _budget(c, token, extra=0.05)["refusal"] is None
    assert _budget(c, token, extra=0.2)["refusal"] == "credit"


def test_monthly_beats_credit_beats_daily_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch, daily="1", monthly="1000")
    uid, token = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 1.5)
    assert _budget(c, token)["refusal"] == "daily"
    _spend(SessionLocal, uid, 3.5)
    assert _budget(c, token)["refusal"] == "credit"  # daily is also over; credit wins
    _caps(monkeypatch, daily="1", monthly="5")
    assert _budget(c, token)["refusal"] == "monthly"  # all three are over; monthly wins


def test_owners_have_no_credit_to_run_out_of_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    me = c.post("/auth/dev-login").json()
    token = _session(c)["token"]
    _spend(SessionLocal, me["id"], 50.0)
    b = _budget(c, token)
    assert (b["credit_usd"], b["refusal"], b["allowed"]) == (None, None, True)


def test_free_spots_approve_the_first_players_then_waitlist_and_a_revoked_player_keeps_theirs_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch, spots=2)
    ids = {n: _player(SessionLocal, n) for n in ("a1", "b2", "c3", "d4", "e5")}
    results = {}
    for n in ("a1", "b2", "c3"):
        _as(c, ids[n])
        assert _session(c)["spots_left"] == (2 if n == "a1" else 1 if n == "b2" else 0)
        r = c.post("/analyst/access/request", json={})
        results[n] = r.json()["access"]
    assert results == {"a1": "approved", "b2": "approved", "c3": "pending"}
    _as(c, ids["a1"])
    assert _session(c)["enabled"] is True  # no owner touched it

    _owner(c)
    assert _decide(c, ids["a1"], "denied").json()["status"] == "denied"  # revoked
    _as(c, ids["d4"])
    assert c.post("/analyst/access/request", json={}).json()["access"] == "pending"  # a1's spot is still used

    _owner(c)
    body = c.get("/analyst/access/requests").json()
    assert (body["free_spots"], body["spots_used"]) == (2, 2)
    assert c.put("/analyst/access/free-spots", json={"free_spots": 3}).json() == {"free_spots": 3, "spots_used": 2}
    _as(c, ids["e5"])
    assert c.post("/analyst/access/request", json={}).json()["access"] == "approved"
    db = SessionLocal()
    try:
        assert {r.user_id for r in db.query(AnalystAccess).filter(AnalystAccess.auto_approved.is_(True))} == {ids["a1"], ids["b2"], ids["e5"]}
    finally:
        db.close()


def test_only_owners_change_the_free_spots_446(chat):
    c, SessionLocal = chat
    _as(c, _player(SessionLocal, "nami"))
    assert c.put("/analyst/access/free-spots", json={"free_spots": 500}).status_code == 403


def test_a_player_out_of_credit_can_ask_for_a_top_up_and_an_owner_adds_5_for_this_month_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    assert c.post("/analyst/access/topup").status_code == 409  # still has credit
    _spend(SessionLocal, uid, 5.0)
    assert c.post("/analyst/access/topup").status_code == 204
    assert c.post("/analyst/access/topup").status_code == 204  # asking twice is one request
    assert _budget(c, token)["topup_requested"] is True

    _owner(c)
    assert _session(c)["pending_requests"] == 1
    row = next(r for r in c.get("/analyst/access/requests").json()["requests"] if r["user_id"] == uid)
    assert row["topup_requested_at"] and row["credit_usd"] == 5.0 and row["credit_spent_usd"] == pytest.approx(5.0)
    granted = c.post(f"/analyst/access/requests/{uid}/topup", json={"action": "add"}).json()
    assert granted["credit_usd"] == 10.0 and granted["topup_requested_at"] is None
    assert c.post(f"/analyst/access/requests/{uid}/topup", json={"action": "add"}).status_code == 404  # nothing waiting

    _as(c, uid)
    b = _budget(c, token)
    assert (b["credit_usd"], b["refusal"], b["topup_requested"]) == (10.0, None, False)

    # A top-up lasts the month it was granted in.
    db = SessionLocal()
    try:
        row = db.query(AnalystAccess).filter_by(user_id=uid).one()
        assert row.topup_month == month_key(datetime.now(timezone.utc))
        row.topup_month = "2000-01"
        db.commit()
    finally:
        db.close()
    assert _budget(c, token)["credit_usd"] == 5.0


def test_an_owner_can_dismiss_a_top_up_without_adding_credit_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 5.0)
    c.post("/analyst/access/topup")
    _owner(c)
    assert c.post(f"/analyst/access/requests/{uid}/topup", json={"action": "dismiss"}).json()["topup_requested_at"] is None
    assert _budget(c, token)["credit_usd"] == 5.0
    _as(c, uid)
    assert c.post(f"/analyst/access/requests/{uid}/topup", json={"action": "add"}).status_code == 403


def test_refused_requests_are_logged_as_free_rows_with_their_reason_446(chat):
    c, SessionLocal = chat
    me = c.post("/auth/dev-login").json()
    token = _session(c)["token"]
    r = c.post(
        "/analyst/chat/usage",
        json={"kind": "chat", "cost_usd": 0, "outcome": "refused", "refusal": "credit", "duration_ms": 12},
        headers={TOKEN: token, **SERVICE},
    )
    assert r.status_code == 204
    c.post(
        "/analyst/chat/usage",
        json={"kind": "chat", "model": "claude-sonnet-5-5", "cost_usd": 0.07, "tool_calls": 3, "duration_ms": 4100},
        headers={TOKEN: token, **SERVICE},
    )
    db = SessionLocal()
    try:
        refused, ok = db.query(AnalystUsage).order_by(AnalystUsage.id).all()
        assert (refused.outcome, refused.refusal, refused.cost_usd, refused.user_id) == ("refused", "credit", 0, me["id"])
        assert (ok.outcome, ok.refusal, ok.tool_calls, ok.duration_ms) == ("ok", None, 3, 4100)
    finally:
        db.close()
    assert c.post(
        "/analyst/chat/usage", json={"kind": "chat", "cost_usd": 0, "outcome": "refused", "refusal": "nope"}, headers={TOKEN: token, **SERVICE}
    ).status_code == 422


def test_usage_summary_is_for_owners_and_counts_what_players_cost_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, _ = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 0.5, model="claude-sonnet-5-5")
    _spend(SessionLocal, uid, 0.25, datetime.now(timezone.utc) - timedelta(days=90), model="claude-opus-5-5")
    _spend(SessionLocal, uid, 0.0, outcome="refused", refusal="daily")
    assert c.get("/analyst/usage/summary").status_code == 403  # nami is not an owner
    _owner(c)
    body = c.get("/analyst/usage/summary").json()
    assert body["total_usd"] == pytest.approx(0.75) and body["month_usd"] == pytest.approx(0.5) and body["today_usd"] == pytest.approx(0.5)
    p = body["players"][0]
    assert (p["name"], p["questions"], p["refused"], p["credit_usd"]) == ("nami", 2, 1, 5.0)
    assert p["spent_usd"] == pytest.approx(0.75) and p["credit_spent_usd"] == pytest.approx(0.5)
    assert {(g["kind"], g["model"], g["requests"]) for g in body["groups"]} == {
        ("chat", "claude-sonnet-5-5", 1), ("chat", "claude-opus-5-5", 1),
    }


def test_deleting_a_thread_removes_its_messages_but_keeps_what_it_cost_446(chat):
    c, SessionLocal = chat
    me = c.post("/auth/dev-login").json()
    token = _session(c)["token"]
    h = {TOKEN: token, **SERVICE}
    tid = c.post("/analyst/chat/threads", json={"title": "Zoro"}, headers=h).json()["id"]
    c.post(f"/analyst/chat/threads/{tid}/messages", json={"messages": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}]}, headers=h)
    c.post("/analyst/chat/usage", json={"kind": "chat", "cost_usd": 0.3, "thread_id": tid}, headers=h)
    # Someone else can't delete it.
    _as(c, _player(SessionLocal, "nami"))
    assert c.delete(f"/analyst/chat/threads/{tid}").status_code == 404
    c.cookies.clear()
    c.post("/auth/dev-login")
    assert c.delete(f"/analyst/chat/threads/{tid}").status_code == 204
    assert c.get(f"/analyst/chat/threads/{tid}").status_code == 404
    db = SessionLocal()
    try:
        assert db.query(AnalystThread).count() == 0 and db.query(AnalystMessage).count() == 0
        row = db.query(AnalystUsage).one()
        assert (row.cost_usd, row.thread_id) == (0.3, None)
    finally:
        db.close()
    assert c.get("/analyst/chat/budget", headers=h).json()["spent_today_usd"] == pytest.approx(0.3)


def test_a_usage_row_only_attaches_to_the_players_own_thread_446(chat):
    c, SessionLocal = chat
    c.post("/auth/dev-login")
    token = _session(c)["token"]
    other = _player(SessionLocal, "nami")
    db = SessionLocal()
    try:
        t = AnalystThread(user_id=other, title="theirs")
        db.add(t)
        db.commit()
        tid = t.id
    finally:
        db.close()
    c.post("/analyst/chat/usage", json={"kind": "chat", "cost_usd": 0.1, "thread_id": tid}, headers={TOKEN: token, **SERVICE})
    db = SessionLocal()
    try:
        assert db.query(AnalystUsage).one().thread_id is None
    finally:
        db.close()


def test_the_credit_refills_on_the_first_of_the_next_month_446():
    from app.analyst_credit import next_month_start

    assert next_month_start(datetime(2026, 10, 9, 15, 30, tzinfo=timezone.utc)) == datetime(2026, 11, 1, tzinfo=timezone.utc)
    assert next_month_start(datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc)) == datetime(2027, 1, 1, tzinfo=timezone.utc)


def test_the_average_chat_cost_ignores_refused_rows_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    uid, token = _approved(c, SessionLocal, "nami")
    assert _budget(c, token)["avg_chat_cost_usd"] is None
    _spend(SessionLocal, uid, 0.1)
    _spend(SessionLocal, uid, 0.3)
    _spend(SessionLocal, uid, 0.0, outcome="refused", refusal="daily")
    assert _budget(c, token)["avg_chat_cost_usd"] == pytest.approx(0.2)


def test_the_panel_reads_its_own_credit_only_when_log_pose_is_on_for_the_player_446(chat, monkeypatch):
    c, SessionLocal = chat
    _caps(monkeypatch)
    nobody = _player(SessionLocal, "zoro")
    _as(c, nobody)
    assert c.get("/analyst/chat/credit").status_code == 403
    uid, _ = _approved(c, SessionLocal, "nami")
    _spend(SessionLocal, uid, 1.6)
    body = c.get("/analyst/chat/credit").json()
    assert (body["credit_usd"], body["refusal"]) == (5.0, None) and body["credit_spent_usd"] == pytest.approx(1.6)
