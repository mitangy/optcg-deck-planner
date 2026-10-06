"""Who filed a report: shared by card reports and feedback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import Settings
from app.game_tokens import verify_game_token
from app.models import User


def identify_reporter(
    db: Session,
    settings: Settings,
    session_user: User | None,
    authorization: str | None,
) -> User | None:
    """Session user, else the holder of a valid game token, else anonymous.

    Guests never get a session cookie, but every tester in a match holds a game
    token, so accepting it ties most reports to a player.
    """
    if session_user is not None:
        return session_user
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    payload = verify_game_token(token.strip(), settings)
    if payload is None:
        return None
    return db.get(User, payload["uid"])
