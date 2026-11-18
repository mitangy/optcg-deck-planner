
from __future__ import annotations

import logging
import threading
import time

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from app.core.config import get_settings

log = logging.getLogger(__name__)

RedisError = redis.RedisError
FAILURE_COOLDOWN_S = 5.0

_lock = threading.Lock()
_client: redis.Redis | None = None
_client_url: str = ""
_down_until = 0.0
_override: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
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
                retry=Retry(NoBackoff(), 1),
            )
            _client_url = url
        return _client


def report_failure(what: str) -> None:
    global _down_until
    _down_until = time.monotonic() + FAILURE_COOLDOWN_S
    log.warning("Redis unavailable (%s); using the fallback for %.0fs", what, FAILURE_COOLDOWN_S)


def reset_failure() -> None:
    global _down_until
    _down_until = 0.0
