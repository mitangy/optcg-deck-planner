"""Session cookie auth helpers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import User

SESSION_COOKIE = "optcg_session"


def _serializer(settings: Settings) -> URLSafeSerializer:
    return URLSafeSerializer(settings.session_secret, salt="optcg-auth")


def create_session_token(user_id: int, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return _serializer(settings).dumps({"uid": user_id})


def read_session_token(token: str, settings: Settings | None = None) -> int | None:
    settings = settings or get_settings()
    try:
        data = _serializer(settings).loads(token)
    except BadSignature:
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
    if settings.allow_any_google_user and not settings.allowed_email_set:
        return True
    return email.strip().lower() in settings.allowed_email_set
