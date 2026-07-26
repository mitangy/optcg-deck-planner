from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.auth import (
    consume_login_ticket,
    create_login_ticket,
    create_session_token,
    read_login_ticket,
    read_session_token,
)
from app.config import Settings
from app.models import LoginTicket
from tests.conftest import make_user


def _settings() -> Settings:
    return Settings(session_secret="test-secret-for-auth-tickets")


def test_login_ticket_is_not_a_valid_session(db):
    user = make_user(db, email="a@example.com", name="A", sub="sub-a")
    settings = _settings()
    ticket = create_login_ticket(db, user.id, settings)
    assert read_login_ticket(ticket, settings) == user.id
    assert read_session_token(ticket, settings) is None


def test_session_token_is_not_a_valid_login_ticket(db):
    settings = _settings()
    session = create_session_token(7, settings=settings)
    assert read_session_token(session, settings) == (7, 0)
    assert read_login_ticket(session, settings) is None


def test_login_ticket_is_single_use(db):
    user = make_user(db, email="b@example.com", name="B", sub="sub-b")
    settings = _settings()
    ticket = create_login_ticket(db, user.id, settings)
    assert consume_login_ticket(db, ticket, settings) == user.id
    assert consume_login_ticket(db, ticket, settings) is None


def test_expired_login_ticket_row_is_rejected(db):
    user = make_user(db, email="c@example.com", name="C", sub="sub-c")
    settings = _settings()
    ticket = create_login_ticket(db, user.id, settings)
    uid = read_login_ticket(ticket, settings)
    assert uid == user.id
    # Expire the DB row while keeping a valid signature window.
    row = db.scalar(select(LoginTicket))
    assert row is not None
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert consume_login_ticket(db, ticket, settings) is None
