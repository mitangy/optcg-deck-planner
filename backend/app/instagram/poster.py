"""Instagram auto-poster for @optcgduel (#1477): about one post a day, no human approval.

A loop wakes every ten minutes. Once per UTC day, after ``ig_post_hour_utc``, it builds the day's post,
stores it in ``instagram_posts`` (unique ``slot_date``: redeploys and extra workers cannot double-post)
and publishes it through the Instagram API. One worker runs at a time (Postgres advisory lock).
``ig_dry_run`` renders and stores posts without publishing them.

On the weekdays in ``ig_reel_weekdays`` (#1482) the day's post is a Reel instead: an uploaded trailer
(``instagram_reels``) with a trending song from the Audio API, when the token is Facebook-style and a reel is
active. Anything that goes wrong with the Reel turns the same row into the normal image post, so a day is
never skipped.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.time import as_utc
from app.instagram import client, content
from app.instagram.models import InstagramPost, InstagramReel, InstagramToken

log = logging.getLogger("uvicorn.error")

WAKE_S = 600
FIRST_RUN_DELAY_S = 30
MAX_ATTEMPTS = 3
TOKEN_REFRESH_AFTER = timedelta(days=20)
TOKEN_ROW_ID = 1


def _media_base(settings) -> str:
    return (settings.ig_media_base_url.strip() or settings.backend_public_url).rstrip("/")


def media_url(settings, token: str) -> str:
    return f"{_media_base(settings)}/social-media/{token}.jpg"


def reel_url(settings, token: str) -> str:
    return f"{_media_base(settings)}/social-media/reel/{token}.mp4"


def env_token(settings) -> str:
    return settings.ig_access_token.strip()


def env_token_hash(settings) -> str:
    return hashlib.sha256(env_token(settings).encode()).hexdigest()


_resolved_user_id: dict[str, str] = {}


async def resolve_user_id(settings, http: httpx.AsyncClient, token: str) -> str:
    """IG_USER_ID if set, else (EAA token) the account assigned to the token, looked up once per process per env token."""
    explicit = settings.ig_user_id.strip()
    if explicit:
        return explicit
    key = env_token_hash(settings)
    if key not in _resolved_user_id:
        _resolved_user_id[key] = await client.assigned_instagram_account_id(http, token, settings.ig_api_version)
    return _resolved_user_id[key]


def _stored_row(db: Session, settings) -> InstagramToken | None:
    """The refreshed-token row, but only while it was seeded from the env token that is set now.

    Pasting a new token into IG_ACCESS_TOKEN changes the hash, so the stale row is ignored (and overwritten on the next write).
    """
    row = db.get(InstagramToken, TOKEN_ROW_ID)
    if row is None or row.env_token_sha256 != env_token_hash(settings):
        return None
    return row


def current_token(db: Session, settings) -> str:
    row = _stored_row(db, settings)
    return row.access_token if row is not None else env_token(settings)


def _store(db: Session, settings, access_token: str, refreshed_at: datetime, expires_at: datetime | None) -> None:
    row = db.get(InstagramToken, TOKEN_ROW_ID)
    if row is None:
        row = InstagramToken(id=TOKEN_ROW_ID)
        db.add(row)
    row.access_token, row.refreshed_at, row.expires_at = access_token, refreshed_at, expires_at
    row.env_token_sha256 = env_token_hash(settings)
    db.commit()


async def ensure_fresh_token(db: Session, settings, http: httpx.AsyncClient, now: datetime) -> str:
    """The token to publish with. Refreshes it when it is 20+ days old (or never refreshed here) and stores the new one.

    Facebook-style tokens (EAA...) are used as they are: they are not refreshed through graph.instagram.com.
    """
    if client.is_facebook_token(env_token(settings)):
        return env_token(settings)
    row = _stored_row(db, settings)
    token = row.access_token if row is not None else env_token(settings)
    if row is not None and now - as_utc(row.refreshed_at) < TOKEN_REFRESH_AFTER:
        return token
    try:
        new_token, expires_at = await client.refresh_token(http, token, now)
    except client.InstagramError as exc:
        # E.g. "token too new" right after it was issued. Keep the current token and look again in a day
        # (a stored row stamped 19 days ago is due again after 1 day).
        log.warning("instagram: token refresh skipped: %s", exc)
        _store(db, settings, token, now - TOKEN_REFRESH_AFTER + timedelta(days=1), row.expires_at if row is not None else None)
        return token
    _store(db, settings, new_token, now, expires_at)
    log.info("instagram: access token refreshed")
    return new_token


def pick_reel(db: Session) -> InstagramReel | None:
    """The active reel posted least recently: never-posted first, then the oldest last_posted_at."""
    return db.scalar(
        select(InstagramReel)
        .where(InstagramReel.active.is_(True))
        .order_by(InstagramReel.last_posted_at.is_not(None), InstagramReel.last_posted_at, InstagramReel.id)
        .limit(1)
    )


def pick_audio(songs: list[dict], duration_ms: int | None) -> dict | None:
    """The first trending song that is at least as long as the video, else (length unknown) the first one."""
    for song in songs:
        if duration_ms is None:
            return song
        try:
            if int(song.get("duration_in_ms") or 0) >= duration_ms:
                return song
        except (TypeError, ValueError):
            continue
    return None


async def _find_audio(db: Session, settings, http: httpx.AsyncClient, reel: InstagramReel, now: datetime) -> dict | None:
    """A trending song for the reel, or None (logged) when the search fails or has nothing that fits."""
    try:
        token = await ensure_fresh_token(db, settings, http, now)
        user_id = await resolve_user_id(settings, http, token)
        songs = await client.trending_music(http, user_id, token, settings.ig_api_version)
    except client.InstagramError as exc:
        log.warning("instagram: no Reel today, audio search failed: %s", exc)
        return None
    song = pick_audio(songs, reel.duration_ms)
    if song is None:
        log.warning("instagram: no Reel today, no trending song fits a %s ms video", reel.duration_ms)
    return song


async def _new_reel_post(db: Session, settings, http: httpx.AsyncClient, today: date, now: datetime) -> InstagramPost | None:
    """A Reel row for today, or None when today is not a Reel day or the Reel cannot be made (the caller posts an image)."""
    if today.weekday() not in settings.ig_reel_weekday_set or not client.is_facebook_token(env_token(settings)):
        return None
    reel = pick_reel(db)
    if reel is None:
        return None
    song: dict = {}
    if not settings.ig_dry_run:  # a dry run makes no calls
        found = await _find_audio(db, settings, http, reel, now)
        if found is None:
            return None
        song = found
    return InstagramPost(
        kind="reel",
        slot_date=today,
        caption=reel.caption,
        image_jpeg=None,
        media_token=secrets.token_urlsafe(24),
        subject=f"reel-{reel.id}",
        status="dry_run" if settings.ig_dry_run else "rendered",
        reel_id=reel.id,
        audio_id=str(song["audio_id"])[:64] if song else None,
        audio_title=str(song.get("title") or "")[:200] or None if song else None,
        audio_artist=str(song.get("display_artist") or "")[:200] or None if song else None,
    )


async def _fall_back_to_image(db: Session, http: httpx.AsyncClient, row: InstagramPost, reason: str) -> None:
    """Turn a failed Reel row into the normal image post of the same day (the unique slot_date row is reused)."""
    log.warning("instagram: Reel for %s failed, posting the image instead: %s", row.slot_date, reason)
    post = await content.build_today(db, row.slot_date, http)
    row.kind, row.caption, row.image_jpeg, row.subject = post.kind, post.caption, post.image, post.subject
    row.reel_id = row.audio_id = row.audio_title = row.audio_artist = None
    row.reel_error, row.status, row.error, row.attempts = reason[:500], "rendered", None, 0
    db.commit()


async def _publish_reel(db: Session, settings, http: httpx.AsyncClient, row: InstagramPost, now: datetime) -> None:
    reel = db.get(InstagramReel, row.reel_id) if row.reel_id is not None else None
    try:
        if reel is None or not row.audio_id:
            raise client.InstagramError("The Reel or its song is gone")
        token = await ensure_fresh_token(db, settings, http, now)
        user_id = await resolve_user_id(settings, http, token)
        media_id = await client.publish_reel(
            http, user_id, token, reel_url(settings, reel.media_token), row.caption, row.audio_id, api_version=settings.ig_api_version
        )
    except client.InstagramError as exc:
        await _fall_back_to_image(db, http, row, f"Reel failed: {exc}")
        return
    row.status, row.ig_media_id, row.published_at, row.error = "published", media_id, now, None
    reel.posted_count, reel.last_posted_at = (reel.posted_count or 0) + 1, now
    log.info("instagram: published Reel %s for %s", reel.id, row.slot_date)
    db.commit()


async def _publish(db: Session, settings, http: httpx.AsyncClient, row: InstagramPost, now: datetime) -> None:
    row.attempts += 1
    if row.kind == "reel":
        await _publish_reel(db, settings, http, row, now)
        if row.status == "published":
            return
        row.attempts += 1  # the image that replaced it is the next attempt
    try:
        token = await ensure_fresh_token(db, settings, http, now)
        user_id = await resolve_user_id(settings, http, token)
        media_id = await client.publish_image(http, user_id, token, media_url(settings, row.media_token), row.caption, api_version=settings.ig_api_version)
    except client.InstagramError as exc:
        row.status, row.error = "failed", str(exc)[:500]
        log.warning("instagram: post %s failed (attempt %s): %s", row.slot_date, row.attempts, exc)
    else:
        row.status, row.ig_media_id, row.error, row.published_at = "published", media_id, None, now
        log.info("instagram: published %s post for %s", row.kind, row.slot_date)
    db.commit()


async def _republish_one(db: Session, settings, http: httpx.AsyncClient, now: datetime) -> bool:
    """Re-post one row an operator set to status 'republish' (#1486): same kind and subject, current renderer, fresh media token.

    A failure leaves status 'failed' (never 'republish' again), so a broken row cannot loop.
    """
    row = db.scalar(select(InstagramPost).where(InstagramPost.status == "republish").order_by(InstagramPost.slot_date).limit(1))
    if row is None:
        return False
    try:
        post = await content.rebuild_post(db, row.kind, row.subject, row.slot_date, http)
    except Exception as exc:  # noqa: BLE001 - a bad row must not stop the daily post
        post, why = None, type(exc).__name__
    else:
        why = "nothing to rebuild"
    if post is None:
        row.status, row.error, row.attempts = "failed", f"republish: {why}"[:500], row.attempts + 1
        db.commit()
        return True
    row.caption, row.image_jpeg, row.media_token = post.caption, post.image, secrets.token_urlsafe(24)
    row.attempts, row.error, row.ig_media_id = 0, None, None
    if settings.ig_dry_run:
        row.status = "dry_run"
        db.commit()
    else:
        await _publish(db, settings, http, row, now)
    return True


async def tick(db: Session, settings, http: httpx.AsyncClient, now: datetime | None = None) -> str:
    """One wake-up. Returns what happened: disabled | too_early | done | built | published | dry_run | failed | gave_up | raced."""
    if not settings.instagram_enabled:
        return "disabled"
    now = now or datetime.now(timezone.utc)
    await _republish_one(db, settings, http, now)  # before the post hour check: an operator asked for it
    if now.hour < settings.ig_post_hour_utc:
        return "too_early"
    today: date = now.date()
    row = db.scalar(select(InstagramPost).where(InstagramPost.slot_date == today))
    if row is None:
        row = await _new_reel_post(db, settings, http, today, now)
        if row is None:
            post = await content.build_today(db, today, http)
            row = InstagramPost(
                kind=post.kind,
                slot_date=today,
                caption=post.caption,
                image_jpeg=post.image,
                media_token=secrets.token_urlsafe(24),
                subject=post.subject,
                status="dry_run" if settings.ig_dry_run else "rendered",
            )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return "raced"
    elif row.status in ("published", "dry_run"):
        return "done"
    elif row.attempts >= MAX_ATTEMPTS:
        return "gave_up"
    if settings.ig_dry_run:
        return "dry_run"
    await _publish(db, settings, http, row, now)
    return row.status


async def run_once(settings) -> str | None:
    from app.core.db import INSTAGRAM_POST_LOCK_KEY, SessionLocal, try_advisory_lock

    lock = await asyncio.to_thread(try_advisory_lock, INSTAGRAM_POST_LOCK_KEY)
    if lock is None:
        return None
    db = SessionLocal()
    try:
        async with client.make_client(settings) as http:
            return await tick(db, settings, http)
    finally:
        db.close()
        await asyncio.to_thread(lock.release)


async def post_loop(settings) -> None:
    await asyncio.sleep(FIRST_RUN_DELAY_S)
    while True:
        try:
            await run_once(settings)
        except Exception as exc:  # noqa: BLE001 - the loop must never die
            log.error("instagram poster crashed: %s", type(exc).__name__)
        await asyncio.sleep(WAKE_S)


def start_background(settings) -> asyncio.Task | None:
    if not settings.instagram_enabled:
        return None
    return asyncio.create_task(post_loop(settings))
