"""Den Den Mushi: files posts from a Discord channel as feedback tickets (#979).

Players post bugs and ideas in a Discord Forum channel (each post is a thread) or a
plain text channel. Every poll reads the new posts, saves each as a `feedback` row
(app "discord") and replies in Discord with the ticket number.

Only posts newer than `process start - STARTUP_GRACE` are filed, so turning the bot
on never backfills the channel's history. A post is filed once: `discord_message_id`
is unique, only the worker that inserted the row replies, and one worker polls at a
time (Postgres advisory lock).
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone  # noqa: F401

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.statuses import FeedbackStatus
from app.models import Feedback

log = logging.getLogger("uvicorn.error")

API_BASE = "https://discord.com/api/v10"
USER_AGENT = "DiscordBot (https://optcgduel.app, 1.0)"
DISCORD_EPOCH_MS = 1420070400000
STARTUP_GRACE = timedelta(minutes=10)
MAX_NEW_PER_POLL = 20
MAX_RETRY_WAIT_S = 30.0
FIRST_RUN_DELAY_S = 10
MIN_POLL_S = 10
GUILD_FORUM, GUILD_MEDIA, GUILD_TEXT = 15, 16, 0
# Message types worth a ticket: a plain message and a reply.
USER_MESSAGE_TYPES = (0, 19)


def snowflake_from_datetime(when: datetime) -> int:
    """The smallest Discord id created at `when`."""
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return (int(when.timestamp() * 1000) - DISCORD_EPOCH_MS) << 22


class RateLimited(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__("Discord rate limit")
        self.retry_after = retry_after


@dataclass
class PollState:
    """What one running bot remembers between polls."""

    cutoff_id: int = field(default_factory=lambda: snowflake_from_datetime(datetime.now(timezone.utc) - STARTUP_GRACE))
    channel: dict | None = None
    # Text channel: the newest message id already looked at, filed or not (bot replies, system
    # messages and sticker-only posts are never filed, so the ticket ids alone would stall here).
    text_after: int = 0
    text_scanned_to: int = 0


def make_client(token: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=API_BASE,
        headers={"Authorization": f"Bot {token}", "User-Agent": USER_AGENT},
        timeout=15.0,
    )


async def _request(client: httpx.AsyncClient, method: str, path: str, **kwargs) -> httpx.Response:
    resp = await client.request(method, path, **kwargs)
    if resp.status_code == 429:
        try:
            wait = float(resp.json().get("retry_after", 1))
        except (ValueError, AttributeError):
            wait = 1.0
        raise RateLimited(wait)
    resp.raise_for_status()
    return resp


def kind_from_tags(tags: list[str]) -> str:
    """idea for a suggestion-like tag, otherwise bug."""
    for tag in tags:
        name = tag.lower()
        if any(word in name for word in ("idea", "suggest", "feature")):
            return "idea"
    return "bug"


def _display_name(author: dict) -> str:
    return (author.get("global_name") or author.get("username") or "player")[:64]


def _text_with_attachments(head: str, message: dict) -> str:
    parts = [head.strip()] if head.strip() else []
    parts.extend(a["url"] for a in message.get("attachments") or [] if a.get("url"))
    return "\n\n".join(parts) if parts else ""


@dataclass
class _Post:
    """One Discord post that becomes a ticket."""

    message_id: str
    kind: str
    text: str
    author: str
    link: str
    reply_path: str
    reply_to: str | None  # message to reply to (text channel); None inside a forum thread


def _known(db: Session, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    return set(db.scalars(select(Feedback.discord_message_id).where(Feedback.discord_message_id.in_(ids))).all())


async def _forum_new_posts(client, db: Session, state: PollState, channel: dict) -> list[_Post]:
    channel_id, guild_id = str(channel["id"]), str(channel["guild_id"])
    tag_names = {str(t["id"]): t.get("name", "") for t in channel.get("available_tags") or []}
    active = (await _request(client, "GET", f"/guilds/{guild_id}/threads/active")).json().get("threads") or []
    threads = sorted(
        (t for t in active if str(t.get("parent_id")) == channel_id and int(t["id"]) > state.cutoff_id),
        key=lambda t: int(t["id"]),
    )
    seen = _known(db, [str(t["id"]) for t in threads])
    posts: list[_Post] = []
    for thread in [t for t in threads if str(t["id"]) not in seen][:MAX_NEW_PER_POLL]:
        thread_id = str(thread["id"])
        # A forum post's starter message has the same id as its thread.
        try:
            starter = (await _request(client, "GET", f"/channels/{thread_id}/messages/{thread_id}")).json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                log.warning("discord feedback: starter of thread %s failed: HTTP %s", thread_id, exc.response.status_code)
                continue
            starter = {}  # starter deleted: file the title alone
        author_obj = starter.get("author") or {}
        if author_obj.get("bot"):
            continue
        head = f"{thread.get('name', '')}\n\n{starter.get('content', '')}"
        text = _text_with_attachments(head, starter)
        if not text:
            continue
        tags = [tag_names.get(str(t), "") for t in thread.get("applied_tags") or []]
        posts.append(
            _Post(
                message_id=thread_id,
                kind=kind_from_tags(tags),
                text=text,
                author=_display_name(author_obj),
                link=f"https://discord.com/channels/{guild_id}/{thread_id}/{thread_id}",
                reply_path=f"/channels/{thread_id}/messages",
                reply_to=None,
            )
        )
    return posts


async def _text_new_posts(client, db: Session, state: PollState, channel: dict) -> list[_Post]:
    channel_id, guild_id = str(channel["id"]), str(channel.get("guild_id", "@me"))
    newest = max(
        (int(i) for i in db.scalars(select(Feedback.discord_message_id).where(Feedback.app == "discord")).all() if i),
        default=0,
    )
    params = {"limit": 50, "after": str(max(newest, state.cutoff_id, state.text_after))}
    messages = (await _request(client, "GET", f"/channels/{channel_id}/messages", params=params)).json()
    messages = sorted((m for m in messages if int(m["id"]) > state.cutoff_id), key=lambda m: int(m["id"]))
    seen = _known(db, [str(m["id"]) for m in messages])
    posts: list[_Post] = []
    for message in messages:
        mid = str(message["id"])
        state.text_scanned_to = int(mid)
        author_obj = message.get("author") or {}
        if mid in seen or author_obj.get("bot") or message.get("type", 0) not in USER_MESSAGE_TYPES:
            continue
        text = _text_with_attachments(message.get("content", ""), message)
        if not text:
            continue
        posts.append(
            _Post(
                message_id=mid,
                kind="bug",
                text=text,
                author=_display_name(author_obj),
                link=f"https://discord.com/channels/{guild_id}/{channel_id}/{mid}",
                reply_path=f"/channels/{channel_id}/messages",
                reply_to=mid,
            )
        )
        if len(posts) >= MAX_NEW_PER_POLL:
            break
    return posts


GITHUB_API = "https://api.github.com"
ISSUE_RETRY_WINDOW = timedelta(days=1)
MAX_ISSUE_RETRIES_PER_POLL = 3


def _defang(text: str) -> str:
    """Player text goes into a public issue: a zero-width space after every @ stops GitHub pinging users and teams."""
    return text.replace("@", "@\u200b")


def issue_title(message: str) -> str:
    """The thread title of a forum post (its message's first line), else the start of the message."""
    first = next((line.strip() for line in message.splitlines() if line.strip()), "")
    return f"[Discord] {_defang(first[:80])}"


def make_github_client(token: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=GITHUB_API,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
        },
        timeout=15.0,
    )


async def _find_issue(github: httpx.AsyncClient, settings, row: Feedback) -> int | None:
    """The issue already opened for a ticket (its body ends with the ticket marker), else None."""
    query = f'repo:{settings.github_issues_repo} is:issue label:discord-feedback in:body "Feedback ticket #{row.id}"'
    resp = await github.get("/search/issues", params={"q": query})
    resp.raise_for_status()
    marker = re.compile(rf"Feedback ticket #{row.id}\b")
    for item in resp.json().get("items") or []:
        if marker.search(item.get("body") or ""):
            return int(item["number"])
    return None


async def _open_issue(github: httpx.AsyncClient, db: Session, settings, row: Feedback, retry: bool = False) -> None:
    """Open the GitHub issue for a ticket and remember its number. Failure leaves github_issue null.

    A retry first looks for an issue the earlier try created but whose reply was lost.
    """
    if row.github_issue is not None:
        return
    body = (
        f"{_defang(row.message)}\n\nFrom Discord: {_defang(row.discord_author or '')} · {row.page}\n\nFeedback ticket #{row.id}"
    )
    payload = {
        "title": issue_title(row.message),
        "body": body,
        "labels": ["discord-feedback", row.kind],
    }
    try:
        found = await _find_issue(github, settings, row) if retry else None
        if found is not None:
            row.github_issue = found
        else:
            resp = await github.post(f"/repos/{settings.github_issues_repo}/issues", json=payload)
            resp.raise_for_status()
            row.github_issue = int(resp.json()["number"])
        db.commit()
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        db.rollback()
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else ""
        log.warning("discord feedback: github issue for ticket %s failed: %s %s", row.id, type(exc).__name__, status)


async def _retry_issues(github: httpx.AsyncClient, db: Session, settings) -> None:
    since = datetime.now(timezone.utc) - ISSUE_RETRY_WINDOW
    pending = db.scalars(
        select(Feedback)
        .where(Feedback.app == "discord", Feedback.github_issue.is_(None), Feedback.created_at >= since)
        .order_by(Feedback.id)
        .limit(MAX_ISSUE_RETRIES_PER_POLL)
    ).all()
    for row in pending:
        await _open_issue(github, db, settings, row, retry=True)


async def _reply(client, post: _Post, ticket_id: int) -> None:
    body: dict = {
        "content": f"Thanks {post.author}! Logged as ticket #{ticket_id}. We'll take a look.",
        "allowed_mentions": {"parse": []},
    }
    if post.reply_to:
        body["message_reference"] = {"message_id": post.reply_to}
    try:
        await _request(client, "POST", post.reply_path, json=body)
    except httpx.HTTPError as exc:
        # The ticket stays; only the confirmation is lost.
        log.warning("discord feedback: reply for ticket %s failed: %s", ticket_id, type(exc).__name__)


async def poll_once(
    client: httpx.AsyncClient,
    db: Session,
    settings,
    state: PollState | None = None,
    github: httpx.AsyncClient | None = None,
) -> int:
    """File every new post in the channel as a ticket and reply to it. Returns how many were filed."""
    state = state or PollState()
    filed = 0
    try:
        if state.channel is None:
            state.channel = (await _request(client, "GET", f"/channels/{settings.discord_feedback_channel_id.strip()}")).json()
        channel = state.channel
        if channel.get("type") in (GUILD_FORUM, GUILD_MEDIA):
            posts = await _forum_new_posts(client, db, state, channel)
        else:
            state.text_scanned_to = 0
            posts = await _text_new_posts(client, db, state, channel)
        for post in posts:
            row = Feedback(
                kind=post.kind,
                message=post.text[:2000],
                app="discord",
                page=post.link[:200],
                discord_message_id=post.message_id,
                discord_author=post.author[:64],
                status=FeedbackStatus.OPEN,
            )
            db.add(row)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()  # another worker filed it first; it replies
                continue
            filed += 1
            if github is not None:
                await _open_issue(github, db, settings, row)
            await _reply(client, post, row.id)
        # Every post of the page is handled: the next poll starts after the last message looked at.
        state.text_after = max(state.text_after, state.text_scanned_to)
    except RateLimited as limited:
        log.warning("discord feedback: rate limited, retry after %.1fs", limited.retry_after)
        await asyncio.sleep(min(limited.retry_after, MAX_RETRY_WAIT_S))
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        db.rollback()
        status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else ""
        log.warning("discord feedback: poll failed: %s %s", type(exc).__name__, status)
    if github is not None:
        # Issues that failed earlier (GitHub down, bad token) get another try.
        await _retry_issues(github, db, settings)
    return filed


async def run_once(settings, state: PollState) -> int | None:
    """One poll under the cross-worker lock; None while another worker holds it."""
    from app.core.db import DISCORD_FEEDBACK_LOCK_KEY, SessionLocal, try_advisory_lock

    lock = await asyncio.to_thread(try_advisory_lock, DISCORD_FEEDBACK_LOCK_KEY)
    if lock is None:
        return None
    db = SessionLocal()
    try:
        async with make_client(settings.discord_bot_token.strip()) as client:
            token = settings.github_issues_token.strip()
            if not token:
                return await poll_once(client, db, settings, state)
            async with make_github_client(token) as github:
                return await poll_once(client, db, settings, state, github)
    finally:
        db.close()
        await asyncio.to_thread(lock.release)


async def poll_loop(settings) -> None:
    state = PollState()
    await asyncio.sleep(FIRST_RUN_DELAY_S)
    while True:
        try:
            await run_once(settings, state)
        except Exception as exc:  # noqa: BLE001 - the loop must never die
            log.error("discord feedback poll crashed: %s", type(exc).__name__)
        await asyncio.sleep(max(MIN_POLL_S, settings.discord_feedback_poll_s))


def start_background(settings) -> asyncio.Task | None:
    """The polling task when the bot token and channel id are both set, else None."""
    if not settings.discord_feedback_enabled:
        return None
    return asyncio.create_task(poll_loop(settings))
