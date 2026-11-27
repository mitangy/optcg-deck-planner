"""Instagram routes (#1477, #1482): the public image and Reel video Instagram fetches, and admin tools."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

import re
import secrets

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import Admin
from app.instagram import captions, client, content, mp4, poster
from app.instagram.models import InstagramPost, InstagramReel

public_router = APIRouter(tags=["instagram"])
admin_router = APIRouter(prefix="/admin/instagram", tags=["instagram"])

DB = Annotated[Session, Depends(get_db)]

MAX_REEL_BYTES = 100 * 1024 * 1024
MAX_TITLE = 120


@public_router.get("/social-media/{media_token}.jpg", include_in_schema=False)
def post_image(media_token: str, db: DB) -> Response:
    """No auth: Instagram's servers fetch this. The random token is the only key."""
    jpeg = db.scalar(select(InstagramPost.image_jpeg).where(InstagramPost.media_token == media_token))
    if jpeg is None:  # unknown token, or a Reel row (no image)
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _byte_range(header: str | None, size: int) -> tuple[int, int] | None:
    """(first, last) of a single ``Range: bytes=`` request; None when absent or not understood (serve it whole).

    Raises 416 for a range that lies outside the file.
    """
    m = _RANGE.match((header or "").strip())
    if m is None or (not m.group(1) and not m.group(2)):
        return None
    if not m.group(1):  # bytes=-N: the last N bytes
        first, last = max(0, size - int(m.group(2))), size - 1
    else:
        first, last = int(m.group(1)), min(int(m.group(2)) if m.group(2) else size - 1, size - 1)
    if first >= size or first > last:
        raise HTTPException(status_code=416, detail="Range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
    return first, last


@public_router.api_route("/social-media/reel/{media_token}.mp4", methods=["GET", "HEAD"], include_in_schema=False)
def reel_video(media_token: str, request: Request, db: DB) -> Response:
    """No auth: Instagram's servers fetch this, in ranges when they like. The random token is the only key."""
    video = db.scalar(select(InstagramReel.video).where(InstagramReel.media_token == media_token))
    if video is None:
        raise HTTPException(status_code=404, detail="Not found")
    headers = {"Cache-Control": "public, max-age=86400", "Accept-Ranges": "bytes"}
    span = _byte_range(request.headers.get("range"), len(video))
    if span is None:
        return Response(content=video, media_type="video/mp4", headers=headers)
    first, last = span
    headers["Content-Range"] = f"bytes {first}-{last}/{len(video)}"
    return Response(content=video[first : last + 1], status_code=206, media_type="video/mp4", headers=headers)


class PostOut(BaseModel):
    id: int
    kind: str
    slot_date: str
    subject: str
    status: str
    attempts: int
    ig_media_id: str | None
    error: str | None
    caption: str
    created_at: str | None
    published_at: str | None
    reel_id: int | None
    audio_id: str | None
    audio_title: str | None
    audio_artist: str | None
    reel_error: str | None


class PostsOut(BaseModel):
    posts: list[PostOut]


class ReelOut(BaseModel):
    id: int
    title: str
    caption: str
    size_bytes: int
    duration_ms: int | None
    uploaded_at: str | None
    posted_count: int
    last_posted_at: str | None
    active: bool


class ReelsOut(BaseModel):
    reels: list[ReelOut]


class ReelPatch(BaseModel):
    title: str | None = None
    caption: str | None = None
    active: bool | None = None


def _reel_out(r: InstagramReel) -> ReelOut:
    return ReelOut(
        id=r.id,
        title=r.title,
        caption=r.caption,
        size_bytes=r.size_bytes,
        duration_ms=r.duration_ms,
        uploaded_at=r.uploaded_at.isoformat() if r.uploaded_at else None,
        posted_count=r.posted_count or 0,
        last_posted_at=r.last_posted_at.isoformat() if r.last_posted_at else None,
        active=r.active,
    )


class ReelsCheckOut(BaseModel):
    ready: bool
    token_kind: Literal["facebook", "instagram_login", "none"]
    user_id: str | None
    username: str | None
    song_count: int
    first_song: str | None
    message: str


def _song_label(song: dict) -> str:
    title, artist = str(song.get("title") or "Untitled"), str(song.get("display_artist") or "").strip()
    return f"{title} \u2014 {artist}" if artist else title


def _check_out(kind: str, message: str, ready: bool = False, **kw) -> ReelsCheckOut:
    base = dict(user_id=None, username=None, song_count=0, first_song=None)
    return ReelsCheckOut(ready=ready, token_kind=kind, message=message, **{**base, **kw})  # type: ignore[arg-type]


@admin_router.get("/reels/check")
async def check_reels(_: Admin, db: DB) -> ReelsCheckOut:
    """Will Reels with songs work? One trending-music call with the live token; nothing is stored or posted."""
    settings = get_settings()
    if not settings.instagram_enabled:
        return _check_out("none", "Instagram posting is not set up (no access token).")
    token = poster.current_token(db, settings)
    if not client.is_facebook_token(token):
        return _check_out("instagram_login", "Reels with songs need a Facebook-style token (starting with EAA). This token is an Instagram Login token.")
    async with client.make_client(settings) as http:
        try:
            user_id = await poster.resolve_user_id(settings, http, token)
        except client.InstagramError as exc:
            return _check_out("facebook", f"The Instagram account could not be found: {exc}")
        try:
            username = str((await client.account_info(http, user_id, token, settings.ig_api_version)).get("username") or "") or None
        except client.InstagramError:
            username = None
        try:
            songs = await client.trending_music(http, user_id, token, settings.ig_api_version)
        except client.InstagramError as exc:
            return _check_out("facebook", f"{exc}. Link the Instagram account to a Facebook Page.", user_id=user_id, username=username)
    if not songs:
        return _check_out("facebook", "Instagram returned no trending songs.", user_id=user_id, username=username)
    first = _song_label(songs[0])
    return _check_out("facebook", "Trending songs found.", True, user_id=user_id, username=username, song_count=len(songs), first_song=first)


def _clean_title(title: str) -> str:
    title = title.strip()
    if not title or len(title) > MAX_TITLE:
        raise HTTPException(status_code=422, detail=f"Give the reel a title of 1 to {MAX_TITLE} characters")
    return title


@admin_router.get("/reels")
def list_reels(_: Admin, db: DB) -> ReelsOut:
    rows = db.scalars(select(InstagramReel).order_by(InstagramReel.uploaded_at.desc(), InstagramReel.id.desc())).all()
    return ReelsOut(reels=[_reel_out(r) for r in rows])


@admin_router.post("/reels", status_code=201)
async def upload_reel(
    _: Admin, db: DB, file: Annotated[UploadFile, File()], title: Annotated[str, Form()], caption: Annotated[str, Form()] = ""
) -> ReelOut:
    """An mp4 trailer, 100 MB at most. The caption is stored in the image posts' shape (disclaimer first, hashtags last)."""
    title = _clean_title(title)
    if (file.content_type or "").split(";")[0].strip().lower() != "video/mp4":
        raise HTTPException(status_code=415, detail="Upload an mp4 video")
    data = await file.read(MAX_REEL_BYTES + 1)
    if len(data) > MAX_REEL_BYTES:
        raise HTTPException(status_code=413, detail="The video is over 100 MB")
    if not mp4.looks_like_mp4(data):
        raise HTTPException(status_code=415, detail="That file is not an mp4 video")
    reel = InstagramReel(
        title=title,
        caption=captions.reel_caption(caption),
        video=data,
        media_token=secrets.token_urlsafe(24),
        size_bytes=len(data),
        duration_ms=mp4.duration_ms(data),
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)
    return _reel_out(reel)


@admin_router.patch("/reels/{reel_id}")
def patch_reel(reel_id: int, body: ReelPatch, _: Admin, db: DB) -> ReelOut:
    reel = db.get(InstagramReel, reel_id)
    if reel is None:
        raise HTTPException(status_code=404, detail="Reel not found")
    if body.title is not None:
        reel.title = _clean_title(body.title)
    if body.caption is not None:
        reel.caption = captions.reel_caption(body.caption)
    if body.active is not None:
        reel.active = body.active
    db.commit()
    db.refresh(reel)
    return _reel_out(reel)


@admin_router.delete("/reels/{reel_id}", status_code=204)
def delete_reel(reel_id: int, _: Admin, db: DB) -> Response:
    reel = db.get(InstagramReel, reel_id)
    if reel is None:
        raise HTTPException(status_code=404, detail="Reel not found")
    # Past posts keep their song and status; only the link to the deleted video goes.
    db.execute(update(InstagramPost).where(InstagramPost.reel_id == reel_id).values(reel_id=None))
    db.delete(reel)
    db.commit()
    return Response(status_code=204)


@admin_router.get("/posts")
def list_posts(_: Admin, db: DB, limit: Annotated[int, Query(ge=1, le=100)] = 30) -> PostsOut:
    rows = db.scalars(select(InstagramPost).order_by(InstagramPost.slot_date.desc()).limit(limit)).all()
    return PostsOut(
        posts=[
            PostOut(
                id=r.id,
                kind=r.kind,
                slot_date=r.slot_date.isoformat(),
                subject=r.subject,
                status=r.status,
                attempts=r.attempts,
                ig_media_id=r.ig_media_id,
                error=r.error,
                caption=r.caption,
                created_at=r.created_at.isoformat() if r.created_at else None,
                published_at=r.published_at.isoformat() if r.published_at else None,
                reel_id=r.reel_id,
                audio_id=r.audio_id,
                audio_title=r.audio_title,
                audio_artist=r.audio_artist,
                reel_error=r.reel_error,
            )
            for r in rows
        ]
    )


@admin_router.post("/preview")
async def preview(_: Admin, db: DB, kind: Annotated[Literal["meta_chart", "card_spotlight", "feature"], Query()]) -> Response:
    """A freshly rendered post image, not saved or published. The caption comes back in X-Caption (url-quoted)."""
    from urllib.parse import quote

    today = datetime.now(timezone.utc).date()
    async with httpx.AsyncClient() as http:
        post = await content.build_post(db, kind, today, http)
    if post is None:
        raise HTTPException(status_code=422, detail="Nothing to post for that kind right now")
    return Response(content=post.image, media_type="image/jpeg", headers={"X-Caption": quote(post.caption)})
