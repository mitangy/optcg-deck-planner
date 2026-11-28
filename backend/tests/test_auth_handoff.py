"""One sign-in across the planner and the duel app: handoff tickets (#1502)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import itsdangerous.timed
from sqlalchemy import select

from app.core.auth import (
    SESSION_COOKIE,
    consume_handoff_ticket,
    consume_login_ticket,
    create_login_ticket,
    read_session_token,
)
from app.core.config import get_settings
from app.core.models import LoginTicket
from tests.test_admin import login, mk
from tests.test_duel import client  # noqa: F401  (fixture)


def _handoff(c, audience="planner"):
    r = c.post("/auth/handoff", json={"audience": audience})
    assert r.status_code == 200, r.text
    return r.json()


def _claim(c, ticket, audience="planner"):
    return c.post("/auth/claim", json={"ticket": ticket, "handoff_audience": audience})


def test_a_handoff_ticket_signs_the_same_account_in_on_the_other_app_once_1502(client):
    c, S = client
    uid = mk(S, "hand@x.test")
    login(c, S, uid)
    ticket = _handoff(c)["ticket"]
    c.cookies.clear()
    first = _claim(c, ticket)
    assert first.status_code == 200 and first.json()["id"] == uid
    session = first.cookies.get(SESSION_COOKIE)
    assert session and read_session_token(session, get_settings())[0] == uid
    again = _claim(c, ticket)
    assert again.status_code == 400 and SESSION_COOKIE not in again.cookies


def test_a_handoff_ticket_lives_at_most_a_minute_1502(client, monkeypatch):
    c, S = client
    uid = mk(S, "ttl@x.test")
    login(c, S, uid)
    body = _handoff(c)
    assert body["expires_in"] <= 60
    # Only the signature age moves: the row's own expiry is still in the future, so this isolates the signed TTL.
    real = time.time
    monkeypatch.setattr(itsdangerous.timed, "time", SimpleNamespace(time=lambda: real() + 61))
    assert _claim(c, body["ticket"]).status_code == 400


def test_a_handoff_ticket_whose_row_expired_is_refused_1502(client):
    c, S = client
    uid = mk(S, "row@x.test")
    login(c, S, uid)
    ticket = _handoff(c)["ticket"]
    with S() as db:
        row = db.scalar(select(LoginTicket))
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert _claim(c, ticket).status_code == 400


def test_handoff_and_login_tickets_cannot_stand_in_for_each_other_1502(client):
    c, S = client
    uid = mk(S, "mix@x.test")
    login(c, S, uid)
    handoff = _handoff(c)["ticket"]
    with S() as db:
        sign_in = create_login_ticket(db, uid, get_settings())
    c.cookies.clear()
    assert c.post("/auth/claim", json={"ticket": handoff}).status_code == 400
    assert _claim(c, sign_in).status_code == 400
    # Neither failed claim burned the other kind: each still works on its own path.
    assert _claim(c, handoff).status_code == 200
    assert c.post("/auth/claim", json={"ticket": sign_in}).status_code == 200


def test_a_ticket_for_one_app_cannot_be_claimed_as_the_other_1502(client):
    c, S = client
    uid = mk(S, "aud@x.test")
    login(c, S, uid)
    ticket = _handoff(c, "planner")["ticket"]
    c.cookies.clear()
    assert _claim(c, ticket, "duel").status_code == 400
    assert _claim(c, ticket, "planner").status_code == 200


def test_a_guest_without_a_session_gets_no_handoff_ticket_1502(client):
    c, S = client
    c.cookies.clear()
    assert c.post("/auth/handoff", json={"audience": "planner"}).status_code == 401
    with S() as db:
        assert db.scalar(select(LoginTicket)) is None


def test_claiming_is_rate_limited_per_caller_ip_1502(client):
    c, S = client
    body = {"ticket": "nope", "handoff_audience": "planner"}
    a, b = {"X-Forwarded-For": "203.0.113.1"}, {"X-Forwarded-For": "203.0.113.2"}
    codes = [c.post("/auth/claim", json=body, headers=a).status_code for _ in range(35)]
    assert codes[0] == 400 and codes[-1] == 429
    assert c.post("/auth/claim", json=body, headers=b).status_code == 400


def test_a_ticket_already_taken_by_another_session_cannot_be_taken_again_1502(client):
    c, S = client
    uid = mk(S, "race@x.test")
    login(c, S, uid)
    handoff = _handoff(c)["ticket"]
    with S() as db:
        login_ticket = create_login_ticket(db, uid, get_settings())
    settings = get_settings()
    with S() as stale, S() as other:
        # `stale` has already loaded both rows, as a request that is mid-way through a claim would have.
        for row in db_rows(stale):
            assert row is not None
        assert consume_handoff_ticket(other, handoff, "planner", settings) is not None
        assert consume_login_ticket(other, login_ticket, settings) == uid
        assert consume_handoff_ticket(stale, handoff, "planner", settings) is None
        assert consume_login_ticket(stale, login_ticket, settings) is None


def db_rows(db):
    return list(db.scalars(select(LoginTicket)).all())


def test_a_handoff_ticket_does_not_survive_a_sign_out_1502(client):
    c, S = client
    uid = mk(S, "sv@x.test")
    login(c, S, uid)
    ticket = _handoff(c)["ticket"]
    assert c.post("/auth/logout").status_code == 200
    c.cookies.clear()
    r = _claim(c, ticket)
    assert r.status_code == 400 and SESSION_COOKIE not in r.cookies
