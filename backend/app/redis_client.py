"""Optional shared Redis client (``REDIS_URL``).

Every caller treats ``get_redis() is None`` as "no Redis": rate limits stay
in-process and presence / live-game progress stay in Postgres, exactly as
before Redis existed. A caller whose Redis call fails reports it with
``report_failure()`` and falls back the same way; for a few seconds after that
``get_redis()`` returns None, so an outage costs one timeout, not one per request.
"""

from __future__ import annotations

import logging
import threading
import time

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from app.config import get_settings

log = logging.getLogger(__name__)

# Raised by any failed Redis call (connection refused, timeout, ...).
RedisError = redis.RedisError
# How long to skip Redis after a failed call.
FAILURE_COOLDOWN_S = 5.0

_lock = threading.Lock()
_client: redis.Redis | None = None
_client_url: str = ""
_down_until = 0.0
# Tests install an in-memory server (fakeredis) here.
_override: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    """The shared client (string responses), or None when REDIS_URL is unset or just failed."""
    global _client, _client_url
    if time.monotonic() < _down_until:
        return None
    if _override is not None:
        return _override
    url = get_settings().redis_url.strip()
    if not url:
        return None
    with _lock:
        if _client is None or _client_url != url:
            _client = redis.Redis.from_url(
                url,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
                health_check_interval=30,
                # One quick retry for a dropped pooled connection; no long backoff in a request.
                retry=Retry(NoBackoff(), 1),
            )
            _client_url = url
        return _client


def report_failure(what: str) -> None:
    """A Redis call failed: log it and skip Redis for FAILURE_COOLDOWN_S."""
    global _down_until
    _down_until = time.monotonic() + FAILURE_COOLDOWN_S
    log.warning("Redis unavailable (%s); using the fallback for %.0fs", what, FAILURE_COOLDOWN_S)


def reset_failure() -> None:
    global _down_until
    _down_until = 0.0
