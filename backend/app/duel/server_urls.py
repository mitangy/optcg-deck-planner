"""Validation for game-server URLs the API stores or hands to clients."""

from __future__ import annotations

from urllib.parse import urlsplit

from app.core import redis_client
from app.core.config import Settings

_LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def normalize_server_url(raw: object) -> str | None:
    """The URL without a trailing slash, or None when it is not a safe game-server address.

    https only (http for localhost, in dev), with no credentials, query or fragment:
    clients send their game token to whatever address they are given.
    """
    if not isinstance(raw, str):
        return None
    url = raw.strip().rstrip("/")
    try:
        parts = urlsplit(url)
        host = parts.hostname
        _ = parts.port  # raises ValueError on a malformed port
    except ValueError:
        return None
    if (
        not host
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or not (parts.scheme == "https" or (parts.scheme == "http" and host in _LOCAL_HOSTS))
    ):
        return None
    return url


# Redis key holding the game-server pool new games go to (blue/green switch).
GAME_SERVER_POOL_KEY = "duel:gs:current"
# Every address the pointer has named (never expires), so invites to rooms on an older pool still resolve.
GAME_SERVER_KNOWN_KEY = "duel:gs:known"


def game_server_url(settings: Settings) -> str | None:
    """The pool pointer in Redis, else GAME_SERVER_URL, else None (clients use their build default)."""
    r = redis_client.get_redis()
    if r is not None:
        try:
            pointer = r.get(GAME_SERVER_POOL_KEY)
        except redis_client.RedisError:
            redis_client.report_failure("game-server pool read")
            pointer = None
        if pointer:
            return pointer
    return settings.game_server_url.strip() or None


def known_game_server_urls(settings: Settings) -> set[str]:
    """Every pool address the API has handed out: the current assignment plus each one the pointer ever named.

    A friend's invite names the pool its room is on, and the recipient's client
    dials it with a game token, so only addresses from this set are accepted.
    """
    urls = {u for u in (game_server_url(settings),) if u}
    r = redis_client.get_redis()
    if r is not None:
        try:
            urls |= set(r.smembers(GAME_SERVER_KNOWN_KEY))
        except redis_client.RedisError:
            redis_client.report_failure("game-server pool read")
    return urls
