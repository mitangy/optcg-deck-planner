"""Instagram Reels with a trending song (#1482)."""

from __future__ import annotations

import json
import struct
from datetime import datetime, timedelta
from urllib.parse import parse_qs

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.instagram import captions, mp4, poster, router as ig_router
from app.instagram.models import InstagramPost, InstagramReel
from tests.test_admin import ADMIN_EMAIL, api, login, mk  # noqa: F401
from tests.test_duel import client  # noqa: F401  (fixture used by api)
from tests.test_instagram_poster import FB_TOKEN, WED, FakeInstagram, aio, run

SONGS = [
    {"audio_id": "short1", "title": "Short Song", "display_artist": "Ann", "duration_in_ms": 1000},
    {"audio_id": "long2", "title": "Long Song", "display_artist": "Bob", "duration_in_ms": 90000},
]
TRIAL_DAY = {"ig_access_token": FB_TOKEN, "ig_reel_weekdays": "2,3"}  # Wednesday and Thursday; Trial Reels on by default (#1490)
REEL_DAY = {**TRIAL_DAY, "ig_reel_trial": "off"}  # the plain-Reel tests below (#1482) predate Trial Reels


class FakeReelInstagram(FakeInstagram):
    def __init__(self, songs=SONGS, audio_error: str | None = None, **kw):
        super().__init__(**kw)
        self.songs = songs
        self.audio_error = audio_error

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/ig_audio"):
            self.requests.append(request)
            if self.audio_error:
                return httpx.Response(400, json={"error": {"message": self.audio_error}})
            return httpx.Response(200, json={"audio": self.songs})
        if path.endswith("/1789") and request.method == "GET":
            self.requests.append(request)
            return httpx.Response(200, json={"username": "optcgduel"})
        return super().handler(request)


class FakeTrialRefusingInstagram(FakeReelInstagram):
    """Meta refuses every container that carries trial_params (e.g. the account is not eligible)."""

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/1789/media") and b"trial_params" in request.content:
            self.requests.append(request)
            return httpx.Response(400, json={"error": {"message": "Trial reels are not available for this account"}})
        return super().handler(request)


def add_reel(db, title="Trailer", token="rt", last: datetime | None = None, active=True, duration_ms=None, posted=0) -> InstagramReel:
    reel = InstagramReel(
        title=title, caption=captions.reel_caption(title), video=b"\x00\x00\x00\x18ftypmp42" + b"x" * 40, media_token=token,
        size_bytes=52, duration_ms=duration_ms, last_posted_at=last, active=active, posted_count=posted,
    )
    db.add(reel)
    db.commit()
    return reel


def sent(fake: FakeInstagram, nth: int = 0) -> dict[str, list[str]]:
    return parse_qs(fake.calls("/1789/media")[nth].content.decode())


@aio
async def test_reel_day_posts_the_least_recently_posted_active_reel_with_the_first_song_1482(db):
    add_reel(db, "old", "tok-old", last=WED - timedelta(days=30), posted=2)
    add_reel(db, "recent", "tok-recent", last=WED - timedelta(days=3), posted=3)
    add_reel(db, "off", "tok-off", active=False)
    add_reel(db, "never", "tok-never")
    fake = FakeReelInstagram()
    assert await run(db, fake, **REEL_DAY) == "published"
    assert sent(fake)["video_url"] == ["https://api.example/social-media/reel/tok-never.mp4"]
    assert await run(db, fake, now=WED + timedelta(days=1), **REEL_DAY) == "published"
    assert sent(fake, 1)["video_url"] == ["https://api.example/social-media/reel/tok-old.mp4"]
    rows = {r.title: r for r in db.scalars(select(InstagramReel)).all()}
    assert (rows["never"].posted_count, rows["old"].posted_count, rows["recent"].posted_count, rows["off"].posted_count) == (1, 3, 3, 0)
    post = db.scalars(select(InstagramPost).order_by(InstagramPost.slot_date)).first()
    assert (post.kind, post.status, post.image_jpeg, post.reel_id) == ("reel", "published", None, rows["never"].id)


@aio
async def test_reel_is_sent_with_the_chosen_song_and_reel_fields_1482(db):
    add_reel(db, duration_ms=5000)
    fake = FakeReelInstagram()
    assert await run(db, fake, **REEL_DAY) == "published"
    form = sent(fake)
    assert form["media_type"] == ["REELS"]
    assert json.loads(form["audio_configuration"][0]) == {"audio_id": "long2", "audio_volume": 100, "video_volume": 1}
    assert form["caption"][0].startswith(captions.DISCLAIMER)
    trending = fake.calls("/ig_audio")[0]
    assert trending.url.host == "graph.facebook.com" and trending.url.params["audio_type"] == "music" and trending.url.params["user_id"] == "1789"
    row = db.scalars(select(InstagramPost)).one()
    assert (row.audio_id, row.audio_title, row.audio_artist) == ("long2", "Long Song", "Bob")


def test_song_must_be_at_least_as_long_as_the_video_unless_its_length_is_unknown_1482():
    assert poster.pick_audio(SONGS, 1000)["audio_id"] == "short1"
    assert poster.pick_audio(SONGS, 1001)["audio_id"] == "long2"
    assert poster.pick_audio(SONGS, None)["audio_id"] == "short1"
    assert poster.pick_audio(SONGS, 100000) is None


@aio
async def test_instagram_login_token_never_posts_a_reel_1482(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, ig_reel_weekdays="2") == "published"
    assert fake.calls("/ig_audio") == []
    row = db.scalars(select(InstagramPost)).one()
    assert row.kind != "reel" and row.image_jpeg is not None
    assert "image_url" in sent(fake)


@aio
async def test_other_weekdays_and_no_active_reel_post_an_image_1482(db):
    fake = FakeReelInstagram()
    assert await run(db, fake, **REEL_DAY) == "published"  # no reel uploaded
    add_reel(db, active=False)
    assert await run(db, fake, now=WED + timedelta(days=1), **REEL_DAY) == "published"  # only an inactive one
    add_reel(db, "x", "tok-x")
    assert await run(db, fake, now=WED + timedelta(days=2), **REEL_DAY) == "published"  # Friday
    assert {r.kind for r in db.scalars(select(InstagramPost)).all()}.isdisjoint({"reel"})
    assert fake.calls("/ig_audio") == []


@aio
async def test_audio_search_failure_posts_the_image_the_same_day_1482(db):
    add_reel(db)
    fake = FakeReelInstagram(audio_error="no page linked")
    assert await run(db, fake, **REEL_DAY) == "published"
    row = db.scalars(select(InstagramPost)).one()
    assert row.kind != "reel" and row.image_jpeg is not None and row.status == "published"
    assert "image_url" in sent(fake) and "media_type" not in sent(fake)
    assert db.scalars(select(InstagramReel)).one().posted_count == 0


@aio
async def test_no_song_long_enough_posts_the_image_1482(db):
    add_reel(db, duration_ms=500000)
    fake = FakeReelInstagram()
    assert await run(db, fake, **REEL_DAY) == "published"
    assert db.scalars(select(InstagramPost)).one().kind != "reel"


@aio
async def test_reel_container_error_turns_the_same_row_into_the_image_post_1482(db):
    add_reel(db)
    fake = FakeReelInstagram(statuses=("ERROR", "FINISHED"))
    assert await run(db, fake, **REEL_DAY) == "published"
    posts = db.scalars(select(InstagramPost)).all()
    assert len(posts) == 1
    row = posts[0]
    assert (row.kind != "reel", row.status, row.error, row.reel_id, row.audio_id, row.attempts) == (True, "published", None, None, None, 1)
    assert "ERROR" in row.reel_error and row.image_jpeg is not None
    assert len(fake.calls("/media_publish")) == 1
    assert "media_type" not in sent(fake, 1) and "image_url" in sent(fake, 1)
    assert db.scalars(select(InstagramReel)).one().posted_count == 0


@aio
async def test_reel_publish_error_never_leaks_the_token_and_falls_back_1482(db):
    add_reel(db)
    fake = FakeReelInstagram(publish_error=f"bad token {FB_TOKEN}")
    assert await run(db, fake, **REEL_DAY) == "failed"  # the image publish fails too, with the same fake
    row = db.scalars(select(InstagramPost)).one()
    assert row.kind != "reel" and FB_TOKEN not in (row.reel_error or "") + (row.error or "")
    assert "bad token" in row.reel_error


@aio
async def test_dry_run_reel_day_stores_a_reel_row_and_makes_no_calls_1482(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, ig_dry_run=True, **REEL_DAY) == "dry_run"
    assert fake.requests == []
    assert db.scalars(select(InstagramPost)).one().kind == "reel"


def _box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I4s", 8 + len(payload), kind) + payload


def make_mp4(duration_ms: int = 5000) -> bytes:
    mvhd = _box(b"mvhd", b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, 1000, duration_ms))
    return _box(b"ftyp", b"mp42\x00\x00\x00\x00") + _box(b"moov", mvhd) + _box(b"mdat", b"\x00" * 16)


def test_mp4_length_is_read_from_the_header_and_garbage_is_not_an_mp4_1482():
    assert mp4.duration_ms(make_mp4(12345)) == 12345
    assert mp4.looks_like_mp4(make_mp4()) and not mp4.looks_like_mp4(b"\xff\xd8\xff\xe0" + b"\x00" * 20)
    assert mp4.duration_ms(b"not a video at all") is None


def test_reel_caption_starts_with_the_disclaimer_keeps_own_hashtags_and_is_stable_1482():
    first = captions.reel_caption("Watch the new trailer #Luffy #OPTCG")
    assert first.startswith(captions.DISCLAIMER + "\n")
    assert "Watch the new trailer" in first and "#Luffy" in first and "#OnePieceCardGame" in first
    assert first.count(captions.DISCLAIMER) == 1 and first.count(captions.CTA) == 1
    assert captions.reel_caption(first) == first
    assert captions.reel_caption("Unofficial fan-made OPTCG sim, not affiliated with Bandai. Hi").count(captions.DISCLAIMER) == 1


def upload(c, data: bytes, ctype="video/mp4", title="Trailer", caption="Hello #Zoro", name="t.mp4"):
    return c.post("/admin/instagram/reels", files={"file": (name, data, ctype)}, data={"title": title, "caption": caption})


def test_reel_upload_accepts_only_mp4_and_stores_the_caption_in_post_shape_1482(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    login(c, S, admin)
    bad_type = upload(c, make_mp4(), ctype="video/quicktime")
    bad_magic = upload(c, b"\xff\xd8\xff\xe0" + b"\x00" * 40)
    assert (bad_type.status_code, bad_magic.status_code) == (415, 415)
    assert upload(c, make_mp4(), title="  ").status_code == 422
    ok = upload(c, make_mp4(7000))
    assert ok.status_code == 201
    body = ok.json()
    assert body["caption"].startswith(captions.DISCLAIMER) and "#Zoro" in body["caption"]
    assert (body["title"], body["duration_ms"], body["active"], body["posted_count"]) == ("Trailer", 7000, True, 0)
    listed = c.get("/admin/instagram/reels").json()["reels"]
    assert [r["id"] for r in listed] == [body["id"]] and "video" not in listed[0] and "media_token" not in listed[0]


def test_reel_upload_over_the_size_cap_is_refused_1482(api, monkeypatch):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    monkeypatch.setattr(ig_router, "MAX_REEL_BYTES", 100)
    assert upload(c, make_mp4() + b"\x00" * 200).status_code == 413
    assert c.get("/admin/instagram/reels").json() == {"reels": []}


def test_reel_admin_routes_are_admin_only_1482(api):
    c, S = api
    admin, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test")
    calls = [
        lambda: c.get("/admin/instagram/reels"),
        lambda: upload(c, make_mp4()),
        lambda: c.patch("/admin/instagram/reels/1", json={"active": False}),
        lambda: c.delete("/admin/instagram/reels/1"),
        lambda: c.get("/admin/instagram/reels/check"),
    ]
    assert [f().status_code for f in calls] == [401] * 5
    login(c, S, plain)
    assert [f().status_code for f in calls] == [403] * 5
    login(c, S, admin)
    assert upload(c, make_mp4()).status_code == 201


def test_reel_patch_and_delete_keep_past_posts_1482(api):
    c, S = api
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    rid = upload(c, make_mp4()).json()["id"]
    patched = c.patch(f"/admin/instagram/reels/{rid}", json={"active": False, "title": "New", "caption": "Fresh words"}).json()
    assert (patched["active"], patched["title"]) == (False, "New") and patched["caption"].startswith(captions.DISCLAIMER)
    with S() as db:
        db.add(InstagramPost(kind="reel", slot_date=WED.date(), caption="c", media_token="pt", status="published", reel_id=rid, audio_title="S", audio_artist="A"))
        db.commit()
    assert c.delete(f"/admin/instagram/reels/{rid}").status_code == 204
    assert c.delete(f"/admin/instagram/reels/{rid}").status_code == 404
    post = c.get("/admin/instagram/posts").json()["posts"][0]
    assert (post["kind"], post["reel_id"], post["audio_title"], post["audio_artist"]) == ("reel", None, "S", "A")


def test_public_reel_video_serves_ranges_and_hides_unknown_tokens_1482(api):
    c, S = api
    with S() as db:
        add_reel(db, token="vid-tok")
    full = c.get("/social-media/reel/vid-tok.mp4")
    assert full.status_code == 200 and full.headers["content-type"] == "video/mp4"
    assert full.headers["accept-ranges"] == "bytes" and "max-age" in full.headers["cache-control"]
    size = len(full.content)
    part = c.get("/social-media/reel/vid-tok.mp4", headers={"Range": "bytes=4-7"})
    assert (part.status_code, part.content, part.headers["content-range"]) == (206, full.content[4:8], f"bytes 4-7/{size}")
    tail = c.get("/social-media/reel/vid-tok.mp4", headers={"Range": "bytes=-5"})
    assert (tail.status_code, tail.content) == (206, full.content[-5:])
    assert c.get("/social-media/reel/vid-tok.mp4", headers={"Range": f"bytes={size}-"}).status_code == 416
    assert c.get("/social-media/reel/nope.mp4").status_code == 404
    assert c.get("/social-media/vid-tok.jpg").status_code == 404


def test_image_route_404s_for_a_reel_row_1482(api):
    c, S = api
    with S() as db:
        db.add(InstagramPost(kind="reel", slot_date=WED.date(), caption="c", media_token="reel-row", status="rendered"))
        db.commit()
    assert c.get("/social-media/reel-row.jpg").status_code == 404


def check(api, monkeypatch, fake: FakeInstagram, **env):
    c, S = api
    for k, v in {"IG_ACCESS_TOKEN": FB_TOKEN, "IG_USER_ID": "1789", **env}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    monkeypatch.setattr(ig_router.client, "make_client", lambda settings: fake.http())
    login(c, S, mk(S, ADMIN_EMAIL, "admin"))
    return c.get("/admin/instagram/reels/check")


def test_reels_check_is_ready_when_trending_songs_come_back_1482(api, monkeypatch):
    res = check(api, monkeypatch, FakeReelInstagram())
    assert res.status_code == 200
    assert res.json() == {
        "ready": True, "token_kind": "facebook", "user_id": "1789", "username": "optcgduel",
        "song_count": 2, "first_song": "Short Song — Ann", "message": "Trending songs found.",
    }
    assert FB_TOKEN not in res.text


def test_reels_check_is_not_ready_with_meta_s_reason_when_audio_is_refused_1482(api, monkeypatch):
    res = check(api, monkeypatch, FakeReelInstagram(audio_error="Unsupported get request, no page"))
    body = res.json()
    assert (body["ready"], body["token_kind"], body["song_count"], body["username"]) == (False, "facebook", 0, "optcgduel")
    assert "Unsupported get request, no page" in body["message"] and "Facebook Page" in body["message"]


def test_reels_check_is_not_ready_for_an_instagram_login_token_and_makes_no_audio_call_1482(api, monkeypatch):
    fake = FakeReelInstagram()
    body = check(api, monkeypatch, fake, IG_ACCESS_TOKEN="IGAAinstagramlogintoken").json()
    assert (body["ready"], body["token_kind"]) == (False, "instagram_login")
    assert fake.requests == []


def test_reels_check_is_not_ready_when_no_songs_come_back_1482(api, monkeypatch):
    body = check(api, monkeypatch, FakeReelInstagram(songs=[])).json()
    assert (body["ready"], body["song_count"], body["first_song"]) == (False, 0, None)
    assert "no trending songs" in body["message"]


@aio
async def test_reel_is_sent_as_a_trial_reel_for_non_followers_by_default_graduating_on_performance_1490(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, **TRIAL_DAY) == "published"
    form = sent(fake)
    assert form["media_type"] == ["REELS"]
    assert json.loads(form["trial_params"][0]) == {"graduation_strategy": "SS_PERFORMANCE"}
    assert db.scalars(select(InstagramPost)).one().reel_error is None


@aio
async def test_trial_off_in_any_case_sends_no_trial_params_1490(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, **{**TRIAL_DAY, "ig_reel_trial": "Off"}) == "published"
    assert "trial_params" not in sent(fake) and sent(fake)["media_type"] == ["REELS"]


@aio
async def test_manual_trial_strategy_passes_through_in_any_case_1490(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, **{**TRIAL_DAY, "ig_reel_trial": "manual"}) == "published"
    assert json.loads(sent(fake)["trial_params"][0]) == {"graduation_strategy": "MANUAL"}


@aio
async def test_unknown_trial_setting_behaves_like_the_default_1490(db):
    add_reel(db)
    fake = FakeReelInstagram()
    assert await run(db, fake, **{**TRIAL_DAY, "ig_reel_trial": "sometimes"}) == "published"
    assert json.loads(sent(fake)["trial_params"][0]) == {"graduation_strategy": "SS_PERFORMANCE"}


@aio
async def test_refused_trial_reel_is_retried_once_as_a_normal_reel_and_the_reason_is_recorded_1490(db):
    reel = add_reel(db)
    fake = FakeTrialRefusingInstagram()
    assert await run(db, fake, **TRIAL_DAY) == "published"
    assert len(fake.calls("/1789/media")) == 2
    assert "trial_params" in sent(fake, 0) and "trial_params" not in sent(fake, 1)
    assert sent(fake, 1)["media_type"] == ["REELS"] and sent(fake, 1)["video_url"] == sent(fake, 0)["video_url"]
    row = db.scalars(select(InstagramPost)).one()
    assert (row.kind, row.status, row.reel_id) == ("reel", "published", reel.id)
    assert row.reel_error.startswith("trial failed: ") and "not available" in row.reel_error
    assert db.get(InstagramReel, reel.id).posted_count == 1
    assert fake.calls("/media_publish") and len(fake.calls("/media_publish")) == 1


@aio
async def test_trial_retry_failing_too_still_falls_back_to_the_image_with_both_reasons_1490(db):
    add_reel(db)
    fake = FakeReelInstagram(publish_error="boom")
    assert await run(db, fake, **TRIAL_DAY) == "failed"  # the image publish fails too with this fake
    row = db.scalars(select(InstagramPost)).one()
    assert row.kind != "reel" and row.reel_error.startswith("trial failed: ") and "; Reel failed: " in row.reel_error
    assert len(fake.calls("/1789/media")) == 3  # trial, plain retry, image
