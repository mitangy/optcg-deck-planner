"""Session cookie auth helpers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User

SESSION_COOKIE = "optcg_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
LOGIN_TICKET_MAX_AGE_SECONDS = 120
OAUTH_STATE_MAX_AGE_SECONDS = 600


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-auth")


def _oauth_serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-oauth")


def create_session_token(
    user_id: int,
    session_version: int = 0,
    settings: Settings | None = None,
) -> str:
    settings = settings or get_settings()
    return _serializer(settings).dumps({"uid": user_id, "sv": int(session_version)})


def read_session_token(
    token: str, settings: Settings | None = None
) -> tuple[int, int] | None:
    """Return (user_id, session_version) or None if invalid."""
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    if uid is None:
        return None
    # Missing sv means pre-hardening cookie; treat as version 0.
    sv = data.get("sv", 0)
    try:
        return int(uid), int(sv)
    except (TypeError, ValueError):
        return None


def create_oauth_state(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return _oauth_serializer(settings).dumps({"v": 1})


def verify_oauth_state(state: str, settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    try:
        _oauth_serializer(settings).loads(state, max_age=OAUTH_STATE_MAX_AGE_SECONDS)
        return True
    except (BadSignature, SignatureExpired):
        return False


def create_login_ticket(user_id: int, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return _serializer(settings).dumps({"uid": user_id, "purpose": "login"})


def read_login_ticket(ticket: str, settings: Settings | None = None) -> int | None:
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(ticket, max_age=LOGIN_TICKET_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    if data.get("purpose") != "login":
        return None
    uid = data.get("uid")
    return int(uid) if uid is not None else None


def resolve_google_user(
    db: Session,
    *,
    email: str,
    sub: str,
    name: str,
) -> User:
    """Find or create a user for a verified Google identity.

    Refuses to rebind an email that is already linked to a different google_sub.
    """
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, name=name, google_sub=sub)
        db.add(user)
    else:
        if user.google_sub and user.google_sub != sub:
            raise HTTPException(
                status_code=403,
                detail="Email already linked to another Google account",
            )
        user.email = email
        user.name = name
        user.google_sub = sub
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    parsed = read_session_token(token, settings)
    if parsed is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    user_id, session_version = parsed
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if int(user.session_version or 0) != session_version:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


def get_optional_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    parsed = read_session_token(token, settings)
    if parsed is None:
        return None
    user_id, session_version = parsed
    user = db.get(User, user_id)
    if user is None:
        return None
    if int(user.session_version or 0) != session_version:
        return None
    return user


def email_allowed(email: str, settings: Settings) -> bool:
    # ALLOW_ANY_GOOGLE_USER=true opens the app to any signed-in Google account.
    # Otherwise only emails in ALLOWED_EMAILS (comma-separated) may sign in.
    if settings.allow_any_google_user:
        return True
    return email.strip().lower() in settings.allowed_email_set
