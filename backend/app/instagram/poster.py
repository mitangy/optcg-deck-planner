"""Instagram auto-poster for @optcgduel (#1477): about one post a day, no human approval.

A loop wakes every ten minutes. Once per UTC day, after ``ig_post_hour_utc``, it builds the day's post,
stores it in ``instagram_posts`` (unique ``slot_date``: redeploys and extra workers cannot double-post)
and publishes it through the Instagram API. One worker runs at a time (Postgres advisory lock).
``ig_dry_run`` renders and stores posts without publishing them.
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
from app.instagram.models import InstagramPost, InstagramToken

log = logging.getLogger("uvicorn.error")

WAKE_S = 600
FIRST_RUN_DELAY_S = 30
MAX_ATTEMPTS = 3
TOKEN_REFRESH_AFTER = timedelta(days=20)
TOKEN_ROW_ID = 1


def media_url(settings, token: str) -> str:
    base = (settings.ig_media_base_url.strip() or settings.backend_public_url).rstrip("/")
    return f"{base}/social-media/{token}.jpg"


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


async def _publish(db: Session, settings, http: httpx.AsyncClient, row: InstagramPost, now: datetime) -> None:
    row.attempts += 1
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
