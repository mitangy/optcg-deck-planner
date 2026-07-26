"""Session cookie auth helpers."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import LoginTicket, User

SESSION_COOKIE = "optcg_session"
OAUTH_NONCE_COOKIE = "optcg_oauth_nonce"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
LOGIN_TICKET_MAX_AGE_SECONDS = 120
OAUTH_STATE_MAX_AGE_SECONDS = 600


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-auth")


def _ticket_serializer(settings: Settings) -> URLSafeTimedSerializer:
    # Separate salt so login tickets can never verify as session cookies.
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-login-ticket")


def _oauth_serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-oauth")


def create_session_token(user_id: int, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return _serializer(settings).dumps({"uid": user_id})


def read_session_token(token: str, settings: Settings | None = None) -> int | None:
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    # Defense in depth: session cookies must not carry a login purpose.
    if data.get("purpose") is not None:
        return None
    uid = data.get("uid")
    return int(uid) if uid is not None else None


def new_oauth_nonce() -> str:
    return secrets.token_urlsafe(24)


def create_oauth_state(nonce: str, settings: Settings | None = None) -> str:
    """Signed OAuth state bound to a browser-held nonce cookie."""
    settings = settings or get_settings()
    return _oauth_serializer(settings).dumps({"v": 1, "n": nonce})


def verify_oauth_state(
    state: str,
    nonce: str | None,
    settings: Settings | None = None,
) -> bool:
    settings = settings or get_settings()
    if not nonce:
        return False
    try:
        data = _oauth_serializer(settings).loads(state, max_age=OAUTH_STATE_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return False
    return data.get("n") == nonce


def create_login_ticket(
    db: Session,
    user_id: int,
    settings: Settings | None = None,
) -> str:
    """Issue a short-lived, single-use login ticket stored in the DB by jti."""
    settings = settings or get_settings()
    jti = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc)
    # Drop expired rows opportunistically so the table stays small.
    db.execute(delete(LoginTicket).where(LoginTicket.expires_at < now))
    db.add(
        LoginTicket(
            jti=jti,
            user_id=user_id,
            expires_at=now + timedelta(seconds=LOGIN_TICKET_MAX_AGE_SECONDS),
        )
    )
    db.commit()
    return _ticket_serializer(settings).dumps(
        {"uid": user_id, "purpose": "login", "jti": jti}
    )


def consume_login_ticket(
    db: Session,
    ticket: str,
    settings: Settings | None = None,
) -> int | None:
    """Validate and atomically consume a login ticket. Returns user_id or None."""
    settings = settings or get_settings()
    try:
        data = _ticket_serializer(settings).loads(
            ticket, max_age=LOGIN_TICKET_MAX_AGE_SECONDS
        )
    except (BadSignature, SignatureExpired):
        return None
    if data.get("purpose") != "login":
        return None
    uid = data.get("uid")
    jti = data.get("jti")
    if uid is None or not jti:
        return None
    row = db.get(LoginTicket, jti)
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc) or row.user_id != int(uid):
        db.delete(row)
        db.commit()
        return None
    db.delete(row)
    db.commit()
    return int(uid)


def read_login_ticket(ticket: str, settings: Settings | None = None) -> int | None:
    """Validate ticket signature/age without consuming (tests / introspection)."""
    settings = settings or get_settings()
    try:
        data = _ticket_serializer(settings).loads(
            ticket, max_age=LOGIN_TICKET_MAX_AGE_SECONDS
        )
    except (BadSignature, SignatureExpired):
        return None
    if data.get("purpose") != "login":
        return None
    uid = data.get("uid")
    return int(uid) if uid is not None else None


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = read_session_token(token, settings)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_optional_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    user_id = read_session_token(token, settings)
    if user_id is None:
        return None
    return db.get(User, user_id)


def email_allowed(email: str, settings: Settings) -> bool:
    # ALLOW_ANY_GOOGLE_USER=true opens the app to any signed-in Google account.
    # Otherwise only emails in ALLOWED_EMAILS (comma-separated) may sign in.
    if settings.allow_any_google_user:
        return True
    return email.strip().lower() in settings.allowed_email_set
