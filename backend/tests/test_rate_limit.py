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
