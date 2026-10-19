"""Sliding-window rate limiter: in-process, or shared through Redis when REDIS_URL is set."""

from __future__ import annotations

import hmac
import os
import threading
import time
import uuid
import weakref
from collections import defaultdict, deque

from app import redis_client


class RateLimiter:
    _all: "weakref.WeakSet[RateLimiter]" = weakref.WeakSet()

    def __init__(self, max_calls: int, period_s: float, name: str | None = None) -> None:
        """``name`` makes the budget shared by every worker when Redis is configured.

        Unnamed limiters always count in-process (each worker has its own budget).
        """
        self.max_calls = max_calls
        self.period_s = period_s
        self.name = name
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_sweep = time.monotonic()
        RateLimiter._all.add(self)

    @classmethod
    def reset_all(cls) -> None:
        """Forget every limiter's history (tests start each case with fresh budgets)."""
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
        """One sorted set per key (score = wall-clock time), the same window as the local path."""
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
            # Over budget: a refused call does not count against later ones.
            r.zrem(rkey, member)
            return False
        return True

    def _allow_local(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            cutoff = now - self.period_s
            if now - self._last_sweep >= self.period_s:
                # Keys are client-chosen (IPs, ids), so drop idle ones or the map grows forever.
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


# Set by the Vercel /api rewrite (vercel.json transforms) from the PROXY_SHARED_SECRET env var.
PROXY_SECRET_HEADER = "x-optcg-proxy-secret"


def _from_vercel(request) -> bool:
    secret = os.environ.get("PROXY_SHARED_SECRET", "")
    if not secret:
        return True  # Not configured yet: keep trusting X-Forwarded-For as before.
    sent = request.headers.get(PROXY_SECRET_HEADER, "")
    return hmac.compare_digest(sent.encode(), secret.encode())


def client_ip(request) -> str:
    """Client IP for rate limits.

    Vercel overwrites X-Forwarded-For with the visitor's IP, so behind the /api rewrite its first
    hop is real. Render keeps whatever X-Forwarded-For a caller sends, so on the onrender.com URL
    the first hop is caller-chosen; there Cloudflare's CF-Connecting-IP is the real caller.
    """
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
