"""Instagram Graph API: publish one image, refresh the token (#1477).

Two token kinds exist. "Instagram Login" tokens (refreshable, 60 days) talk to graph.instagram.com. Facebook-style
tokens (start with "EAA", e.g. a never-expiring system-user token from the unified login setup) talk to
graph.facebook.com with the same paths and params and are never refreshed here.

The token is sent in an Authorization header for publishing, and as the query parameter the refresh
endpoint documents. Errors raised here never carry the token or a URL.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

GRAPH_HOST = "https://graph.instagram.com"
FACEBOOK_GRAPH_HOST = "https://graph.facebook.com"
REFRESH_URL = f"{GRAPH_HOST}/refresh_access_token"
DEFAULT_API_VERSION = "v23.0"
POLL_EVERY_S = 10.0
POLL_MAX_S = 300.0
TIMEOUT_S = 30.0


class InstagramError(Exception):
    """A failed Instagram call. The message is safe to store and log."""


class _HideToken(logging.Filter):
    """httpx logs every request URL at INFO, and the refresh URL holds the token."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "access_token" not in record.getMessage()


logging.getLogger("httpx").addFilter(_HideToken())


def is_facebook_token(token: str) -> bool:
    return (token or "").strip().startswith("EAA")


def graph_base(token: str, api_version: str = DEFAULT_API_VERSION) -> str:
    host = FACEBOOK_GRAPH_HOST if is_facebook_token(token) else GRAPH_HOST
    return f"{host}/{api_version.strip()}"


def make_client(settings) -> httpx.AsyncClient:
    """No host baked in: the host depends on the token, so every call builds an absolute URL."""
    return httpx.AsyncClient(timeout=TIMEOUT_S)


def _scrub(text: str, token: str) -> str:
    return text.replace(token, "***") if token else text


def _fail(exc: Exception, token: str) -> InstagramError:
    """Only the exception type, the HTTP status and Instagram's own message: httpx's text holds the URL."""
    if isinstance(exc, httpx.HTTPStatusError):
        detail = ""
        try:
            detail = str(exc.response.json().get("error", {}).get("message", ""))
        except (ValueError, AttributeError):
            pass
        return InstagramError(_scrub(f"HTTP {exc.response.status_code} {detail}".strip()[:300], token))
    return InstagramError(f"{type(exc).__name__} talking to Instagram")


async def _call(http: httpx.AsyncClient, method: str, url: str, token: str, **kwargs) -> dict:
    try:
        resp = await http.request(method, url, headers={"Authorization": f"Bearer {token}"}, **kwargs)
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise _fail(exc, token) from None
    return data if isinstance(data, dict) else {}


async def assigned_instagram_account_id(http: httpx.AsyncClient, token: str, api_version: str = DEFAULT_API_VERSION) -> str:
    """The Instagram account a Facebook-style (system-user) token is assigned to: first of me/assigned_instagram_accounts."""
    data = await _call(
        http, "GET", f"{FACEBOOK_GRAPH_HOST}/{api_version.strip()}/me/assigned_instagram_accounts", token, params={"fields": "id,username"}
    )
    accounts = data.get("data")
    first = accounts[0] if isinstance(accounts, list) and accounts else None
    account_id = str(first.get("id") or "") if isinstance(first, dict) else ""
    if not account_id:
        raise InstagramError("No Instagram account is assigned to this token")
    return account_id


async def publish_image(
    http: httpx.AsyncClient,
    user_id: str,
    token: str,
    image_url: str,
    caption: str,
    *,
    poll_every_s: float = POLL_EVERY_S,
    poll_max_s: float = POLL_MAX_S,
    api_version: str = DEFAULT_API_VERSION,
) -> str:
    """Create the media container, wait until Instagram has fetched it, publish it. Returns the media id."""
    base = graph_base(token, api_version)
    created = await _call(http, "POST", f"{base}/{user_id}/media", token, data={"image_url": image_url, "caption": caption})
    container = str(created.get("id") or "")
    if not container:
        raise InstagramError("Instagram returned no container id")
    waited = 0.0
    while True:
        status = await _call(http, "GET", f"{base}/{container}", token, params={"fields": "status_code"})
        code = str(status.get("status_code") or "")
        if code == "FINISHED":
            break
        if code in ("ERROR", "EXPIRED"):
            raise InstagramError(f"Instagram container {code}")
        if waited >= poll_max_s:
            raise InstagramError("Instagram container not ready in time")
        await asyncio.sleep(poll_every_s)
        waited += poll_every_s
    published = await _call(http, "POST", f"{base}/{user_id}/media_publish", token, data={"creation_id": container})
    media_id = str(published.get("id") or "")
    if not media_id:
        raise InstagramError("Instagram returned no media id")
    return media_id


async def refresh_token(http: httpx.AsyncClient, token: str, now: datetime | None = None) -> tuple[str, datetime]:
    """Returns the new token (always store this one) and when it expires."""
    try:
        resp = await http.get(REFRESH_URL, params={"grant_type": "ig_refresh_token", "access_token": token})
        resp.raise_for_status()
        data = resp.json()
        new_token = str(data["access_token"])
        expires_in = int(data.get("expires_in", 60 * 24 * 3600))
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise _fail(exc, token) from None
    return new_token, (now or datetime.now(timezone.utc)) + timedelta(seconds=expires_in)
