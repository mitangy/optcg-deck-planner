from __future__ import annotations

from app.rate_limit import RateLimiter


def test_rate_limiter_allows_until_cap():
    limiter = RateLimiter(max_calls=3, period_s=60)
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is True
    assert limiter.allow("ip") is False


def test_rate_limiter_keys_are_independent():
    limiter = RateLimiter(max_calls=1, period_s=60)
    assert limiter.allow("a") is True
    assert limiter.allow("b") is True
    assert limiter.allow("a") is False
