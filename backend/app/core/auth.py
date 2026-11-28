
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.models import LoginTicket, User, is_placeholder_user
from app.core.time import as_utc
from app.roles import Role, is_banned

SESSION_COOKIE = "optcg_session"
OAUTH_NONCE_COOKIE = "optcg_oauth_nonce"
OAUTH_RETURN_COOKIE = "optcg_oauth_return"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24 * 7
LOGIN_TICKET_MAX_AGE_SECONDS = 120
# A handoff ticket rides in a URL fragment between our two apps, so it lives much shorter than an OAuth return ticket.
HANDOFF_TICKET_MAX_AGE_SECONDS = 60
HANDOFF_AUDIENCES = ("planner", "duel")
OAUTH_STATE_MAX_AGE_SECONDS = 600


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-auth")


def _ticket_serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-login-ticket")


def _handoff_serializer(settings: Settings) -> URLSafeTimedSerializer:
    # Its own salt: a handoff ticket fails signature checks everywhere a login ticket or session is read, and the reverse.
    return URLSafeTimedSerializer(settings.session_secret, salt="optcg-handoff-ticket")


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
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    if data.get("purpose") is not None:
        return None
    uid = data.get("uid")
    if uid is None:
        return None
    sv = data.get("sv", 0)
    try:
        return int(uid), int(sv)
    except (TypeError, ValueError):
        return None


def session_token_age_seconds(token: str, settings: Settings | None = None) -> float | None:
    settings = settings or get_settings()
    try:
        _data, issued_at = _serializer(settings).loads(
            token, max_age=SESSION_MAX_AGE_SECONDS, return_timestamp=True
        )
    except (BadSignature, SignatureExpired):
        return None
    return (datetime.now(timezone.utc) - as_utc(issued_at)).total_seconds()


def new_oauth_nonce() -> str:
    return secrets.token_urlsafe(24)


def create_oauth_state(nonce: str, settings: Settings | None = None) -> str:
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
    settings = settings or get_settings()
    jti = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc)
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


def _take_ticket_row(db: Session, jti: str, user_id: int) -> bool:
    """Deletes the ticket row in one statement and reports whether this call was the one that did.

    A read-then-delete would let two concurrent claims both see the row; the DELETE's row count is the single arbiter.
    """
    result = db.execute(
        delete(LoginTicket).where(
            LoginTicket.jti == jti,
            LoginTicket.user_id == user_id,
            LoginTicket.expires_at > datetime.now(timezone.utc),
        )
    )
    db.commit()
    return result.rowcount == 1


def consume_login_ticket(
    db: Session,
    ticket: str,
    settings: Settings | None = None,
) -> int | None:
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
    if not _take_ticket_row(db, jti, int(uid)):
        return None
    return int(uid)


def read_login_ticket(ticket: str, settings: Settings | None = None) -> int | None:
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


def resolve_google_user(
    db: Session,
    *,
    email: str,
    sub: str,
    name: str,
) -> User:
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
    if user is not None and is_placeholder_user(user):
        raise HTTPException(status_code=403, detail="Account cannot sign in")
    if user is None:
        user = User(email=email, name=name, google_sub=sub)
        if email.strip().lower() in get_settings().admin_email_set:
            user.role = Role.ADMIN
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
    if user is None or is_placeholder_user(user):
        raise HTTPException(status_code=401, detail="User not found")
    if is_banned(user):
        raise HTTPException(status_code=403, detail="Account banned")
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
    if user is None or is_banned(user) or is_placeholder_user(user):
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


def create_handoff_ticket(
    db: Session,
    user_id: int,
    audience: str,
    session_version: int = 0,
    settings: Settings | None = None,
) -> str:
    """A single-use ticket that signs `user_id` in on the *other* app (#1502); `audience` names the app that may claim it."""
    if audience not in HANDOFF_AUDIENCES:
        raise ValueError(f"unknown handoff audience: {audience}")
    settings = settings or get_settings()
    jti = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc)
    db.execute(delete(LoginTicket).where(LoginTicket.expires_at < now))
    db.add(
        LoginTicket(
            jti=jti,
            user_id=user_id,
            expires_at=now + timedelta(seconds=HANDOFF_TICKET_MAX_AGE_SECONDS),
        )
    )
    db.commit()
    return _handoff_serializer(settings).dumps(
        {"uid": user_id, "sv": int(session_version), "purpose": "handoff", "aud": audience, "jti": jti}
    )


def consume_handoff_ticket(
    db: Session,
    ticket: str,
    audience: str,
    settings: Settings | None = None,
) -> tuple[int, int] | None:
    """Returns (user id, session version the ticket was minted under), or None."""
    settings = settings or get_settings()
    try:
        data = _handoff_serializer(settings).loads(
            ticket, max_age=HANDOFF_TICKET_MAX_AGE_SECONDS
        )
    except (BadSignature, SignatureExpired):
        return None
    if data.get("purpose") != "handoff" or data.get("aud") != audience:
        return None
    uid = data.get("uid")
    jti = data.get("jti")
    if uid is None or not jti:
        return None
    if not _take_ticket_row(db, jti, int(uid)):
        return None
    return int(uid), int(data.get("sv", 0))
