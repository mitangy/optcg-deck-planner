from __future__ import annotations

import asyncio
import functools
import json
from urllib.parse import parse_qs
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.core.time import as_utc
from app.instagram import client, poster
from app.instagram.models import InstagramPost, InstagramToken


def aio(fn):
    """Run an async test body (no async pytest plugin is installed)."""

    @functools.wraps(fn)
    def run_it(*args, **kwargs):
        return asyncio.run(fn(*args, **kwargs))

    return run_it

WED = datetime(2026, 11, 25, 18, 0, tzinfo=timezone.utc)
TOKEN = "SECRETTOKEN123"


def settings(**kw) -> Settings:
    base = dict(ig_access_token=TOKEN, ig_user_id="1789", ig_post_hour_utc=17, ig_media_base_url="https://api.example")
    return Settings(**{**base, **kw})


class FakeInstagram:
    def __init__(self, statuses=("FINISHED",), refresh_status=200, publish_error: str | None = None):
        self.statuses = list(statuses)
        self.refresh_status = refresh_status
        self.publish_error = publish_error
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path == "/refresh_access_token":
            if self.refresh_status != 200:
                return httpx.Response(self.refresh_status, json={"error": {"message": "token too new"}})
            return httpx.Response(200, json={"access_token": "newtok", "expires_in": 5184000})
        if self.publish_error and path.endswith("/media"):
            return httpx.Response(400, json={"error": {"message": self.publish_error}})
        if path.endswith("/1789/media"):
            return httpx.Response(200, json={"id": "container1"})
        if path.endswith("/container1"):
            return httpx.Response(200, json={"status_code": self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]})
        if path.endswith("/media_publish"):
            return httpx.Response(200, json={"id": "media1"})
        return httpx.Response(404)

    def http(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler), base_url=f"{client.GRAPH_HOST}/v23.0")

    def calls(self, suffix: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path.endswith(suffix)]


async def run(db, fake: FakeInstagram, now=WED, **kw) -> str:
    async with fake.http() as http:
        return await poster.tick(db, settings(**kw), http, now)


def seed_token(db, age_days: int, access_token="oldtok") -> None:
    db.add(InstagramToken(id=1, access_token=access_token, refreshed_at=WED - timedelta(days=age_days)))
    db.commit()


@aio
async def test_one_post_per_utc_day_even_when_run_again_1477(db):
    fake = FakeInstagram()
    assert await run(db, fake) == "published"
    assert await run(db, fake, now=WED + timedelta(hours=3)) == "done"
    assert len(db.scalars(select(InstagramPost)).all()) == 1
    assert len(fake.calls("/media_publish")) == 1
    row = db.scalars(select(InstagramPost)).one()
    assert (row.status, row.ig_media_id) == ("published", "media1")
    sent = parse_qs(fake.calls("/1789/media")[0].content.decode())
    assert sent["image_url"] == [f"https://api.example/social-media/{row.media_token}.jpg"]
    assert sent["caption"][0] == row.caption


@aio
async def test_next_utc_day_gets_its_own_post_1477(db):
    fake = FakeInstagram()
    await run(db, fake)
    await run(db, fake, now=WED + timedelta(days=1))
    assert len(db.scalars(select(InstagramPost)).all()) == 2


@aio
async def test_nothing_is_posted_before_the_post_hour_1477(db):
    fake = FakeInstagram()
    assert await run(db, fake, now=WED.replace(hour=16, minute=59)) == "too_early"
    assert db.scalars(select(InstagramPost)).all() == []
    assert fake.requests == []


@aio
async def test_dry_run_renders_and_stores_but_never_publishes_1477(db):
    fake = FakeInstagram()
    assert await run(db, fake, ig_dry_run=True) == "dry_run"
    assert await run(db, fake, ig_dry_run=True, now=WED + timedelta(hours=1)) == "done"
    row = db.scalars(select(InstagramPost)).one()
    assert row.status == "dry_run" and row.image_jpeg[:2] == b"\xff\xd8"
    assert fake.requests == []


@aio
async def test_disabled_without_token_or_user_id_1477(db):
    for kw in ({"ig_access_token": ""}, {"ig_user_id": " "}):
        s = settings(**kw)
        assert not s.instagram_enabled
        assert poster.start_background(s) is None
        async with FakeInstagram().http() as http:
            assert await poster.tick(db, s, http, WED) == "disabled"
    assert db.scalars(select(InstagramPost)).all() == []


@aio
async def test_token_older_than_20_days_is_refreshed_and_the_new_one_stored_1477(db):
    seed_token(db, age_days=21)
    fake = FakeInstagram()
    assert await run(db, fake) == "published"
    row = db.get(InstagramToken, 1)
    assert row.access_token == "newtok" and as_utc(row.refreshed_at) == WED
    assert fake.calls("/media_publish")[0].headers["Authorization"] == "Bearer newtok"


@aio
async def test_token_younger_than_20_days_is_not_refreshed_1477(db):
    seed_token(db, age_days=19)
    fake = FakeInstagram()
    await run(db, fake)
    assert fake.calls("/refresh_access_token") == []
    assert fake.calls("/media_publish")[0].headers["Authorization"] == "Bearer oldtok"


@aio
async def test_refresh_refusal_keeps_the_current_token_and_still_posts_1477(db):
    fake = FakeInstagram(refresh_status=400)
    assert await run(db, fake) == "published"
    assert fake.calls("/media_publish")[0].headers["Authorization"] == f"Bearer {TOKEN}"
    assert db.get(InstagramToken, 1).access_token == TOKEN


@aio
async def test_container_error_stops_before_media_publish_1477(db):
    fake = FakeInstagram(statuses=("ERROR",))
    assert await run(db, fake) == "failed"
    assert fake.calls("/media_publish") == []
    row = db.scalars(select(InstagramPost)).one()
    assert row.status == "failed" and "ERROR" in row.error


@aio
async def test_waits_for_the_container_before_publishing_1477(db, monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(client.asyncio, "sleep", fake_sleep)
    fake = FakeInstagram(statuses=("IN_PROGRESS", "IN_PROGRESS", "FINISHED"))
    assert await run(db, fake) == "published"
    assert sleeps == [10.0, 10.0]
    assert len(fake.calls("/container1")) == 3


@aio
async def test_failed_post_is_retried_at_most_three_times_a_day_1477(db):
    fake = FakeInstagram(statuses=("ERROR",))
    results = [await run(db, fake, now=WED + timedelta(minutes=10 * i)) for i in range(5)]
    assert results == ["failed", "failed", "failed", "gave_up", "gave_up"]
    assert db.scalars(select(InstagramPost)).one().attempts == 3
    assert len(fake.calls("/1789/media")) == 3


@aio
async def test_a_failed_post_publishes_on_a_later_try_1477(db):
    fake = FakeInstagram(statuses=("ERROR",))
    await run(db, fake)
    fake.statuses = ["FINISHED"]
    assert await run(db, fake, now=WED + timedelta(minutes=10)) == "published"
    row = db.scalars(select(InstagramPost)).one()
    assert (row.status, row.error) == ("published", None)


@aio
async def test_stored_error_never_holds_the_token_1477(db):
    seed_token(db, age_days=1, access_token=TOKEN)
    fake = FakeInstagram(publish_error=f"Invalid OAuth access token {TOKEN}")
    assert await run(db, fake) == "failed"
    error = db.scalars(select(InstagramPost)).one().error
    assert TOKEN not in error and "Invalid OAuth access token" in error


@aio
async def test_refresh_error_text_never_holds_the_token_or_url_1477():
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("failed for " + str(request.url))

    async with httpx.AsyncClient(transport=httpx.MockTransport(boom)) as http:
        with pytest.raises(client.InstagramError) as err:
            await client.refresh_token(http, TOKEN)
    assert TOKEN not in str(err.value) and "http" not in str(err.value)


def test_refresh_response_is_parsed_into_a_new_token_and_expiry_1477():
    async def go():
        def ok(request: httpx.Request) -> httpx.Response:
            assert request.url.params["grant_type"] == "ig_refresh_token"
            return httpx.Response(200, content=json.dumps({"access_token": "fresh", "expires_in": 3600}))

        async with httpx.AsyncClient(transport=httpx.MockTransport(ok)) as http:
            return await client.refresh_token(http, "t", WED)

    token, expires = asyncio.run(go())
    assert token == "fresh" and expires == WED + timedelta(hours=1)
