
from __future__ import annotations

import hmac
import threading
import time
import uuid
import weakref
from collections import defaultdict, deque

from app.core import redis_client
from app.core.config import get_settings


class RateLimiter:
    _all: "weakref.WeakSet[RateLimiter]" = weakref.WeakSet()

    def __init__(self, max_calls: int, period_s: float, name: str | None = None) -> None:
        self.max_calls = max_calls
        self.period_s = period_s
        self.name = name
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()
        RateLimiter._all.add(self)

    @classmethod
    def reset_all(cls) -> None:
        for limiter in list(cls._all):
            with limiter._lock:
                limiter._hits.clear()

    def allow(self, key: str) -> bool:
        r = redis_client.get_redis() if self.name else None
        if r is not None:
            try:
                return self._allow_shared(r, key)
            except redis_client.RedisError:
                redis_client.report_failure(f"rate limit {self.name}")
        return self._allow_local(key)

    def _allow_shared(self, r, key: str) -> bool:
        rkey = f"rl:{self.name}:{key}"
        now = time.time()
        member = f"{now:.6f}:{uuid.uuid4().hex}"
        pipe = r.pipeline(transaction=True)
        pipe.zremrangebyscore(rkey, "-inf", now - self.period_s)
        pipe.zadd(rkey, {member: now})
        pipe.zcard(rkey)
        pipe.pexpire(rkey, max(1, int(self.period_s * 1000)))
        count = pipe.execute()[2]
        if count > self.max_calls:
            r.zrem(rkey, member)
            return False
        return True

    def _allow_local(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            cutoff = now - self.period_s
            if now - self._last_sweep >= self.period_s:
                self._last_sweep = now
                for stale in [k for k, hits in self._hits.items() if not hits or hits[-1] <= cutoff]:
                    del self._hits[stale]
            q = self._hits[key]
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.max_calls:
                return False
            q.append(now)
            return True


PROXY_SECRET_HEADER = "x-optcg-proxy-secret"


def _from_vercel(request) -> bool:
    secret = get_settings().proxy_shared_secret
    if not secret:
        return True
    sent = request.headers.get(PROXY_SECRET_HEADER, "")
    return hmac.compare_digest(sent.encode(), secret.encode())


def client_ip(request) -> str:
    if _from_vercel(request):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip() or "unknown"
    for header in ("cf-connecting-ip", "true-client-ip"):
        value = (request.headers.get(header) or "").strip()
        if value:
            return value
    if request.client and request.client.host:
        return request.client.host
    return "unknown"
