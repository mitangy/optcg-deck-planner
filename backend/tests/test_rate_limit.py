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


def test_named_limiter_budget_is_shared_across_workers_with_redis(fake_redis):
    # Two workers each build the same module-level limiter; Redis makes them one budget.
    worker_a = RateLimiter(max_calls=2, period_s=60, name="shared-test")
    worker_b = RateLimiter(max_calls=2, period_s=60, name="shared-test")
    assert worker_a.allow("ip") is True
    assert worker_b.allow("ip") is True
    assert worker_a.allow("ip") is False
    assert worker_b.allow("ip") is False
    # A refused call does not spend budget, and other keys are untouched.
    assert fake_redis.zcard("rl:shared-test:ip") == 2
    assert worker_b.allow("other-ip") is True


def test_named_limiter_counts_in_process_when_redis_is_down(monkeypatch):
    import redis
    from redis.backoff import NoBackoff
    from redis.retry import Retry

    from app import redis_client

    down = redis.Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2, retry=Retry(NoBackoff(), 0))
    monkeypatch.setattr(redis_client, "_override", down)
    limiter = RateLimiter(max_calls=1, period_s=60, name="down-test")
    assert limiter.allow("ip") is True
    # The failure parks Redis for a while, so the next call never waits on it.
    assert redis_client.get_redis() is None
    assert limiter.allow("ip") is False


class _Client:
    host = "10.0.0.5"


class _Request:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = {k.lower(): v for k, v in headers.items()}
        self.client = _Client()


def test_forwarded_for_is_ignored_without_the_proxy_secret_323(monkeypatch):
    from app.rate_limit import client_ip

    monkeypatch.setenv("PROXY_SHARED_SECRET", "s3cret-from-vercel")
    spoofed = {"X-Forwarded-For": "203.0.113.7", "CF-Connecting-IP": "198.51.100.9"}
    # Calling the Render URL directly: the caller-chosen first hop is not trusted.
    assert client_ip(_Request(spoofed)) == "198.51.100.9"
    assert client_ip(_Request({**spoofed, "X-Optcg-Proxy-Secret": "guess"})) == "198.51.100.9"


def test_forwarded_for_is_trusted_with_the_proxy_secret_323(monkeypatch):
    from app.rate_limit import client_ip

    monkeypatch.setenv("PROXY_SHARED_SECRET", "s3cret-from-vercel")
    via_vercel = {
        "X-Forwarded-For": "203.0.113.7, 76.76.21.21",
        "CF-Connecting-IP": "76.76.21.21",
        "X-Optcg-Proxy-Secret": "s3cret-from-vercel",
    }
    assert client_ip(_Request(via_vercel)) == "203.0.113.7"


def test_forwarded_for_is_trusted_until_a_proxy_secret_is_configured_323(monkeypatch):
    from app.rate_limit import client_ip

    monkeypatch.delenv("PROXY_SHARED_SECRET", raising=False)
    assert client_ip(_Request({"X-Forwarded-For": "203.0.113.7", "CF-Connecting-IP": "76.76.21.21"})) == "203.0.113.7"
