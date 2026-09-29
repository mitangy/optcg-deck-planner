"""Duel usernames: validation, availability, suggestions, and display names.

Rules (kept in sync with duel-web/src/auth/username.ts):
- 3–20 characters of ASCII letters, digits, underscore, or hyphen.
- Unique case-insensitively (``ix_users_username_lower``); the chosen casing is kept.
- Reserved words (``admin``, ``moderator``, …) and a small profanity list are
  rejected. Checks run on a normalized form (lowercase, ``_``/``-`` removed,
  common leetspeak folded) so ``Adm1n`` or ``f_u_c_k`` do not slip through.
"""

from __future__ import annotations

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User

USERNAME_MIN_LEN = 3
USERNAME_MAX_LEN = 20
USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{3,20}$")

# Exact (normalized) matches that would confuse players or impersonate staff/UI.
_RESERVED_EXACT = frozenset(
    {
        "admin",
        "administrator",
        "root",
        "system",
        "sysop",
        "moderator",
        "mod",
        "staff",
        "support",
        "help",
        "official",
        "optcg",
        "onepiece",
        "bandai",
        "owner",
        "server",
        "bot",
        "guest",
        "anonymous",
        "anon",
        "null",
        "undefined",
        "none",
        "me",
        "you",
        "opponent",
        "player",
        "spectator",
        "api",
        "auth",
        "settings",
    }
)

# Substrings that signal impersonation anywhere in the name (e.g. "the_admin").
_RESERVED_SUBSTRINGS = ("admin", "moderator", "official", "optcgstaff")

# Deliberately small and conservative to limit false positives (Scunthorpe problem).
_PROFANITY_SUBSTRINGS = (
    "fuck",
    "shit",
    "cunt",
    "nigger",
    "nigga",
    "faggot",
    "bitch",
    "whore",
    "slut",
    "rapist",
    "retard",
    "hitler",
    "nazi",
    "kike",
    "chink",
    "wetback",
    "tranny",
    "porn",
    "penis",
    "vagina",
    "dildo",
    "jizz",
    "asshole",
    "bastard",
    "motherf",
    "pussy",
)

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "$": "s", "@": "a"})


class UsernameError(ValueError):
    """Raised when a username fails validation (maps to HTTP 422)."""


def normalize_username(value: str) -> str:
    """Folded form used for reserved/profanity checks (not for uniqueness)."""
    return value.lower().replace("_", "").replace("-", "").translate(_LEET)


def _is_blocked(value: str) -> bool:
    norm = normalize_username(value)
    plain = value.lower().replace("_", "").replace("-", "")
    if norm in _RESERVED_EXACT or plain in _RESERVED_EXACT:
        return True
    if any(w in norm or w in plain for w in _RESERVED_SUBSTRINGS):
        return True
    return any(w in norm or w in plain for w in _PROFANITY_SUBSTRINGS)


def validate_username(raw: str) -> str:
    """Return the trimmed username or raise UsernameError with a user-facing message."""
    if not isinstance(raw, str):
        raise UsernameError("Username must be a string.")
    value = raw.strip()
    if len(value) < USERNAME_MIN_LEN or len(value) > USERNAME_MAX_LEN:
        raise UsernameError(
            f"Username must be {USERNAME_MIN_LEN}–{USERNAME_MAX_LEN} characters."
        )
    if not USERNAME_RE.match(value):
        raise UsernameError("Use only letters, numbers, underscores, and hyphens.")
    if _is_blocked(value):
        raise UsernameError("That username isn't allowed. Please pick another.")
    return value


def username_taken(db: Session, username: str, *, exclude_user_id: int | None = None) -> bool:
    stmt = select(User.id).where(func.lower(User.username) == username.lower())
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    return db.scalar(stmt.limit(1)) is not None


def _base_from_user(user: User) -> str:
    source = (user.name or "").strip() or (user.email or "").split("@", 1)[0]
    cleaned = re.sub(r"\s+", "_", source)
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", cleaned).strip("_-")
    cleaned = cleaned[:16]
    try:
        return validate_username(cleaned)
    except UsernameError:
        return "Pirate"


def suggest_username(db: Session, user: User) -> str:
    """An available, valid username derived from the user's name/email."""
    base = _base_from_user(user)
    if not username_taken(db, base, exclude_user_id=user.id) and base != "Pirate":
        return base
    stem = base[: USERNAME_MAX_LEN - 5]
    for _ in range(25):
        candidate = f"{stem}_{secrets.randbelow(10_000):04d}"
        if not username_taken(db, candidate, exclude_user_id=user.id):
            return candidate
    return f"{stem[:10]}_{secrets.token_hex(4)}"


def duel_display_name(user: User) -> str:
    """Name shown to other players: username, else the legacy account name."""
    if user.username:
        return user.username
    name = (user.name or "").strip()
    return name[:40] if name else "Player"
