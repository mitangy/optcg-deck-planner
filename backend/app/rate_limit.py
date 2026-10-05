"""Simple in-process sliding-window rate limiter."""

from __future__ import annotations

import hmac
import os
import threading
import time
import weakref
from collections import defaultdict, deque


class RateLimiter:
    _all: "weakref.WeakSet[RateLimiter]" = weakref.WeakSet()

    def __init__(self, max_calls: int, period_s: float) -> None:
        self.max_calls = max_calls
        self.period_s = period_s
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
