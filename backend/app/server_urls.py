"""Validation for game-server URLs the API stores or hands to clients."""

from __future__ import annotations

from urllib.parse import urlsplit

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
