"""Who is calling the analyst endpoints: personal connector tokens and short-lived in-app chat tokens.

Lived in routers/analyst.py; the chat, bot and sim-game routers depend on it too, so it sits here
and no router imports another (refactor D-02).
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analyst.access import chat_enabled_for
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.models import AnalystToken, User
from app.roles import is_banned


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


CHAT_TOKEN_SECONDS = 30 * 60


def _chat_sig(settings: Settings, uid: int, exp: int) -> str:
    return hmac.new(settings.analyst_service_secret.encode(), f"chat.{uid}.{exp}".encode(), hashlib.sha256).hexdigest()


def mint_chat_token(settings: Settings, user: User, now: int) -> tuple[str, int]:
    """A short-lived token the browser hands the analyst's /chat; signed with the service secret."""
    exp = now + CHAT_TOKEN_SECONDS
    return f"chat.{user.id}.{exp}.{_chat_sig(settings, user.id, exp)}", exp


def _chat_token_user(db: Session, settings: Settings, token: str) -> User | None:
    parts = token.split(".")
    if len(parts) != 4 or not settings.analyst_service_secret:
        return None
    _, uid, exp, sig = parts
    if not (uid.isdigit() and exp.isdigit()):
        return None
    if not hmac.compare_digest(sig, _chat_sig(settings, int(uid), int(exp))):
        return None
    if int(exp) < int(datetime.now(timezone.utc).timestamp()):
        return None
    user = db.get(User, int(uid))
    return user if user is not None and chat_enabled_for(settings, user, db) else None


def analyst_user(
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    x_analyst_token: Annotated[str | None, Header()] = None,
) -> User:
    """The player whose personal connector token (or in-app chat token) is in X-Analyst-Token."""
    if not x_analyst_token:
        raise HTTPException(status_code=401, detail="Missing analyst token")
    if x_analyst_token.startswith("chat."):
        user = _chat_token_user(db, settings, x_analyst_token)
        if user is None:
            raise HTTPException(status_code=401, detail="Expired or invalid chat token")
        if is_banned(user):
            raise HTTPException(status_code=403, detail="Account banned")
        return user
    row = db.scalar(select(AnalystToken).where(AnalystToken.token_hash == hash_token(x_analyst_token)))
    user = db.get(User, row.user_id) if row else None
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown or revoked analyst token")
    if is_banned(user):
        raise HTTPException(status_code=403, detail="Account banned")
    return user
