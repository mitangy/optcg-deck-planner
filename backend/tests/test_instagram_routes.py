from __future__ import annotations

from datetime import date

from app.instagram.models import InstagramPost
from tests.test_admin import ADMIN_EMAIL, api, login, mk  # noqa: F401
from tests.test_duel import client  # noqa: F401  (fixture used by api)


def add_post(S, token="tok-abc") -> None:
    with S() as db:
        db.add(
            InstagramPost(
                kind="feature", slot_date=date(2026, 11, 25), caption="cap", image_jpeg=b"\xff\xd8jpegbytes",
                media_token=token, subject="bot", status="published", ig_media_id="m1",
            )
        )
        db.commit()


def test_public_image_is_served_by_its_token_and_unknown_tokens_404_1477(api):
    c, S = api
    add_post(S)
    ok = c.get("/social-media/tok-abc.jpg")
    assert ok.status_code == 200 and ok.content == b"\xff\xd8jpegbytes"
    assert ok.headers["content-type"] == "image/jpeg" and "max-age" in ok.headers["cache-control"]
    assert c.get("/social-media/nope.jpg").status_code == 404


def test_post_list_and_preview_are_admin_only_and_list_has_no_image_or_token_1477(api):
    c, S = api
    add_post(S)
    admin, plain = mk(S, ADMIN_EMAIL, "admin"), mk(S, "p@x.test")
    assert c.get("/admin/instagram/posts").status_code == 401
    assert c.post("/admin/instagram/preview?kind=feature").status_code == 401
    login(c, S, plain)
    assert c.get("/admin/instagram/posts").status_code == 403
    assert c.post("/admin/instagram/preview?kind=feature").status_code == 403
    login(c, S, admin)
    listed = c.get("/admin/instagram/posts")
    assert listed.status_code == 200
    post = listed.json()["posts"][0]
    assert post["status"] == "published" and post["ig_media_id"] == "m1"
    assert "image_jpeg" not in post and "media_token" not in post and "tok-abc" not in listed.text
    preview = c.post("/admin/instagram/preview?kind=feature")
    assert preview.status_code == 200 and preview.headers["content-type"] == "image/jpeg"
    with S() as db:
        assert db.query(InstagramPost).count() == 1
