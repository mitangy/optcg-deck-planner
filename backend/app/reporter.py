
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.duel.tokens import verify_game_token
from app.core.models import User


def identify_reporter(
    db: Session,
    settings: Settings,
    session_user: User | None,
    authorization: str | None,
) -> User | None:
    if session_user is not None:
        return session_user
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    payload = verify_game_token(token.strip(), settings)
    if payload is None:
        return None
    return db.get(User, payload["uid"])
