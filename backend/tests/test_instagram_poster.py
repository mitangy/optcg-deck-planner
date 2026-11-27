from __future__ import annotations

import asyncio
import functools
import hashlib
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
    def __init__(self, statuses=("FINISHED",), refresh_status=200, publish_error: str | None = None, assigned=({"id": "5555", "username": "optcgduel"},)):
        self.assigned = list(assigned)
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
        if path.endswith("/me/assigned_instagram_accounts"):
            return httpx.Response(200, json={"data": self.assigned})
        if path.endswith("/5555/media"):
            return httpx.Response(200, json={"id": "container1"})
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
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))

    def calls(self, suffix: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path.endswith(suffix)]


async def run(db, fake: FakeInstagram, now=WED, **kw) -> str:
    async with fake.http() as http:
        return await poster.tick(db, settings(**kw), http, now)


def env_hash(token: str = TOKEN) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def seed_token(db, age_days: int, access_token="oldtok", env_token: str = TOKEN) -> None:
    db.add(InstagramToken(id=1, access_token=access_token, refreshed_at=WED - timedelta(days=age_days), env_token_sha256=env_hash(env_token)))
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


def test_enabled_with_facebook_token_and_no_user_id_1477():
    assert settings(ig_access_token=FB_TOKEN, ig_user_id="").instagram_enabled


def test_disabled_with_instagram_login_token_and_no_user_id_1477():
    assert not settings(ig_user_id="").instagram_enabled


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


FB_TOKEN = "EAAfacebooksystemusertoken"


@aio
async def test_facebook_token_publishes_through_graph_facebook_com_1477(db):
    fake = FakeInstagram()
    assert await run(db, fake, ig_access_token=FB_TOKEN) == "published"
    hosts = {r.url.host for r in fake.requests}
    assert hosts == {"graph.facebook.com"}
    assert fake.calls("/media_publish")[0].url.path == "/v23.0/1789/media_publish"
    assert fake.calls("/media_publish")[0].headers["Authorization"] == f"Bearer {FB_TOKEN}"


@aio
async def test_instagram_login_token_still_publishes_through_graph_instagram_com_1477(db):
    fake = FakeInstagram()
    assert await run(db, fake, ig_api_version="v24.0") == "published"
    assert {r.url.host for r in fake.requests} == {"graph.instagram.com"}
    assert fake.calls("/media_publish")[0].url.path == "/v24.0/1789/media_publish"


@aio
async def test_facebook_token_is_never_refreshed_or_stored_1477(db):
    fake = FakeInstagram()
    for days in (0, 30):
        await run(db, fake, ig_access_token=FB_TOKEN, now=WED + timedelta(days=days))
    assert fake.calls("/refresh_access_token") == []
    assert db.get(InstagramToken, 1) is None


def test_is_facebook_token_1477():
    assert client.is_facebook_token("EAAB123") and client.is_facebook_token(" EAAB123 ")
    assert not client.is_facebook_token("IGAA123") and not client.is_facebook_token("")


@aio
async def test_new_env_token_replaces_a_stored_refreshed_token_1477(db):
    seed_token(db, age_days=1, access_token="oldrefreshed", env_token="PREVIOUSENVTOKEN")
    fake = FakeInstagram(refresh_status=400)
    assert await run(db, fake) == "published"
    assert fake.calls("/media_publish")[0].headers["Authorization"] == f"Bearer {TOKEN}"
    assert db.get(InstagramToken, 1).env_token_sha256 == env_hash()


@aio
async def test_stored_refreshed_token_wins_while_the_env_token_is_unchanged_1477(db):
    seed_token(db, age_days=1, access_token="oldrefreshed")
    fake = FakeInstagram()
    await run(db, fake)
    assert fake.calls("/media_publish")[0].headers["Authorization"] == "Bearer oldrefreshed"
    assert poster.current_token(db, settings()) == "oldrefreshed"
    assert poster.current_token(db, settings(ig_access_token="NEWENV")) == "NEWENV"


@aio
async def test_refreshed_token_is_stored_with_the_env_token_hash_not_the_token_1477(db):
    seed_token(db, age_days=1, access_token="oldrefreshed", env_token="PREVIOUSENVTOKEN")
    fake = FakeInstagram()
    await run(db, fake)  # new env token: refresh runs on the env token, row is overwritten
    assert [r.url.params.get("access_token") for r in fake.calls("/refresh_access_token")] == [TOKEN]
    row = db.get(InstagramToken, 1)
    assert (row.access_token, row.env_token_sha256) == ("newtok", env_hash())


@pytest.fixture
def fresh_id_cache(monkeypatch):
    monkeypatch.setattr(poster, "_resolved_user_id", {})


@aio
async def test_facebook_token_without_user_id_publishes_to_the_assigned_account_1477(db, fresh_id_cache):
    fake = FakeInstagram()
    assert await run(db, fake, ig_access_token=FB_TOKEN, ig_user_id="") == "published"
    lookup = fake.calls("/me/assigned_instagram_accounts")[0]
    assert lookup.url.host == "graph.facebook.com" and lookup.url.params["fields"] == "id,username"
    assert lookup.headers["Authorization"] == f"Bearer {FB_TOKEN}"
    assert fake.calls("/media")[0].url.path == "/v23.0/5555/media"
    assert fake.calls("/media_publish")[0].url.path == "/v23.0/5555/media_publish"


@aio
async def test_explicit_user_id_skips_the_assigned_account_lookup_1477(db, fresh_id_cache):
    fake = FakeInstagram()
    assert await run(db, fake, ig_access_token=FB_TOKEN) == "published"
    assert fake.calls("/me/assigned_instagram_accounts") == []
    assert fake.calls("/media")[0].url.path == "/v23.0/1789/media"


@aio
async def test_assigned_account_is_looked_up_once_per_process_1477(db, fresh_id_cache):
    fake = FakeInstagram()
    await run(db, fake, ig_access_token=FB_TOKEN, ig_user_id="")
    await run(db, fake, ig_access_token=FB_TOKEN, ig_user_id="", now=WED + timedelta(days=1))
    assert len(fake.calls("/me/assigned_instagram_accounts")) == 1
    assert len(fake.calls("/media_publish")) == 2


@aio
async def test_no_assigned_account_fails_the_post_without_publishing_1477(db, fresh_id_cache):
    fake = FakeInstagram(assigned=())
    assert await run(db, fake, ig_access_token=FB_TOKEN, ig_user_id="") == "failed"
    row = db.scalars(select(InstagramPost)).one()
    assert row.error == "No Instagram account is assigned to this token" and row.attempts == 1
    assert fake.calls("/media") == [] and fake.calls("/media_publish") == []


# --- republish (#1486) ---------------------------------------------------------------------------------------------

EARLY = WED.replace(hour=10)


def republish_row(db) -> InstagramPost:
    """An old spotlight of OP15-010 marked for republish while a newer, unfeatured card (OP16-002) exists that a fresh pick would choose."""
    from app.planner.models import CatalogCard

    for cid in ("OP15-010", "OP16-002"):
        db.add(CatalogCard(card_id=cid, name=f"Card {cid}", rarity="SR", color="Red", card_type="Character", image_url=""))
    row = InstagramPost(
        kind="card_spotlight", slot_date=WED.date() - timedelta(days=1), caption="old caption", image_jpeg=b"old", media_token="oldtoken",
        subject="OP15-010", status="republish", attempts=2, error="boom", ig_media_id="oldmedia",
    )
    db.add(row)
    db.commit()
    return row


@aio
async def test_republish_reposts_the_same_card_with_a_new_media_token_and_publishes_once_1486(db):
    row = republish_row(db)
    fake = FakeInstagram()
    await run(db, fake, now=EARLY)
    db.refresh(row)
    assert row.subject == "OP15-010" and "OP15-010" in row.caption and "OP16-002" not in row.caption
    assert row.image_jpeg[:2] == b"\xff\xd8"
    assert row.media_token != "oldtoken"
    assert (row.status, row.attempts, row.error, row.ig_media_id) == ("published", 1, None, "media1")
    assert row.published_at is not None
    assert len(fake.calls("/media_publish")) == 1
    sent = parse_qs(fake.calls("/1789/media")[0].content.decode())
    assert sent["image_url"] == [f"https://api.example/social-media/{row.media_token}.jpg"]
    assert sent["caption"][0] == row.caption


@aio
async def test_a_republish_row_is_processed_once_not_every_wake_1486(db):
    republish_row(db)
    fake = FakeInstagram()
    await run(db, fake, now=EARLY)
    await run(db, fake, now=EARLY + timedelta(minutes=10))
    assert len(fake.calls("/media_publish")) == 1


@aio
async def test_failed_republish_is_marked_failed_and_not_retried_by_the_republish_path_1486(db):
    row = republish_row(db)
    fake = FakeInstagram(publish_error="nope")
    await run(db, fake, now=EARLY)
    await run(db, fake, now=EARLY + timedelta(minutes=10))
    db.refresh(row)
    assert (row.status, row.attempts) == ("failed", 1) and "nope" in row.error
    assert len(fake.calls("/1789/media")) == 1


@aio
async def test_republish_dry_run_rebuilds_but_never_publishes_1486(db):
    row = republish_row(db)
    fake = FakeInstagram()
    await run(db, fake, now=EARLY, ig_dry_run=True)
    db.refresh(row)
    assert row.status == "dry_run" and row.media_token != "oldtoken" and row.image_jpeg != b"old"
    assert not [r for r in fake.requests if "graph" in r.url.host or r.url.path.endswith(("/media", "/media_publish"))]


@aio
async def test_republish_does_not_replace_or_block_the_days_own_post_1486(db):
    old = republish_row(db)
    fake = FakeInstagram()
    assert await run(db, fake, now=WED) == "published"
    assert len(fake.calls("/media_publish")) == 2
    rows = db.scalars(select(InstagramPost).order_by(InstagramPost.slot_date)).all()
    assert [r.slot_date for r in rows] == [old.slot_date, WED.date()]
    assert await run(db, fake, now=WED + timedelta(hours=1)) == "done"
    assert len(fake.calls("/media_publish")) == 2


@aio
async def test_republish_commits_the_new_media_token_before_instagram_fetches_the_image_1488(tmp_path):
    """Instagram fetches /social-media/<token>.jpg from another connection while we wait on /media: the row must already be committed."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.all_models import Base
    from app.core.db import get_db
    from app.instagram.router import public_router

    engine = create_engine(f"sqlite:///{tmp_path}/ig.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def other_session():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app = FastAPI()
    app.include_router(public_router)
    app.dependency_overrides[get_db] = other_session
    web = TestClient(app)

    fetched: list[int] = []

    class FetchingInstagram(FakeInstagram):
        def handler(self, request):
            if request.url.path.endswith("/1789/media"):
                url = parse_qs(request.content.decode())["image_url"][0]
                res = web.get(url.removeprefix("https://api.example"))
                fetched.append(res.status_code)
                if res.status_code != 200:
                    return httpx.Response(400, json={"error": {"message": "Only photo or video can be accepted as media type."}})
            return super().handler(request)

    db = Session()
    try:
        seed_token(db, age_days=1)  # a fresh stored token: no refresh write commits the session behind our back
        row = republish_row(db)
        await run(db, FetchingInstagram(), now=EARLY)
        db.refresh(row)
        assert fetched == [200]
        assert (row.status, row.error) == ("published", None)
    finally:
        db.close()
        engine.dispose()
