"""Den Den Mushi files Discord posts as feedback tickets (#979)."""

from __future__ import annotations

import asyncio
import json
import re
import re
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.admin import discord_feedback
from app.core.config import Settings
from app.admin.discord_feedback import PollState, poll_once, snowflake_from_datetime
from app.admin.models import Feedback
from app.routers.feedback import list_feedback
from tests.db_support import make_test_engine

CHANNEL = "5000"
GUILD = "9000"
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
CUTOFF = snowflake_from_datetime(NOW - timedelta(minutes=10))


def sid(minutes_ago: float) -> str:
    return str(snowflake_from_datetime(NOW - timedelta(minutes=minutes_ago)) + 7)


def settings(**kw) -> Settings:
    return Settings(discord_bot_token="tok", discord_feedback_channel_id=CHANNEL, **kw)


class FakeDiscord:
    def __init__(self, channel: dict, threads=None, starters=None, messages=None, reply_status=200):
        self.channel = {"id": CHANNEL, "guild_id": GUILD, **channel}
        self.threads = threads or []
        self.starters = starters or {}
        self.messages = messages or []
        self.reply_status = reply_status
        self.posts: list[tuple[str, dict]] = []
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path.removeprefix("/api/v10")
        if request.method == "POST":
            self.posts.append((path, json.loads(request.content)))
            if self.reply_status == 429:
                return httpx.Response(429, json={"retry_after": 0})
            return httpx.Response(self.reply_status, json={})
        if path == f"/channels/{CHANNEL}":
            return httpx.Response(200, json=self.channel)
        if path == f"/guilds/{GUILD}/threads/active":
            return httpx.Response(200, json={"threads": self.threads})
        if path == f"/channels/{CHANNEL}/messages":
            # Like Discord: the oldest `limit` messages after `after`.
            after = int(request.url.params.get("after", 0))
            limit = int(request.url.params.get("limit", 50))
            page = sorted((m for m in self.messages if int(m["id"]) > after), key=lambda m: int(m["id"]))
            return httpx.Response(200, json=page[:limit])
        parts = path.split("/")
        if len(parts) == 5 and parts[1] == "channels" and parts[3] == "messages" and parts[2] in self.starters:
            return httpx.Response(200, json=self.starters[parts[2]])
        return httpx.Response(404, json={})

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler), base_url=discord_feedback.API_BASE)


FORUM = {"type": 15, "available_tags": [{"id": "1", "name": "Bug"}, {"id": "2", "name": "Idea"}]}
USER = {"id": "42", "username": "zoro_main", "global_name": "Zoro"}


def thread(minutes_ago: float, name="Match menu stuck", parent=CHANNEL, tags=()):
    tid = sid(minutes_ago)
    return {"id": tid, "parent_id": parent, "name": name, "applied_tags": list(tags)}, tid


def starter(tid: str, content="It never closes on mobile.", author=USER):
    return {"id": tid, "content": content, "author": author, "attachments": [{"url": "https://cdn.example/shot.png"}]}


@pytest.fixture()
def db():
    engine = make_test_engine()
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    yield session
    session.close()


class FakeGitHub:
    def __init__(self, status=201, lose_response_once=False):
        self.status = status
        self.lose_response_once = lose_response_once  # GitHub creates the issue, the reply never arrives
        self.issues: list[tuple[str, dict, httpx.Headers]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.status != 201:
            return httpx.Response(self.status, json={"message": "nope"})
        if request.method == "GET" and request.url.path == "/search/issues":
            items = [{"number": 100 + i, "body": b["body"]} for i, (_, b, _) in enumerate(self.issues, 1)]
            return httpx.Response(200, json={"items": items})
        self.issues.append((request.url.path, json.loads(request.content), request.headers))
        if self.lose_response_once:
            self.lose_response_once = False
            raise httpx.ReadTimeout("response lost", request=request)
        return httpx.Response(201, json={"number": 100 + len(self.issues)})

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler), base_url="https://api.github.com")


def poll(fake: FakeDiscord, db, github: FakeGitHub | None = None, **kw) -> int:
    async def go():
        async with fake.client() as client:
            if github is None:
                return await poll_once(client, db, settings(), PollState(cutoff_id=CUTOFF, **kw))
            async with github.client() as gh:
                return await poll_once(client, db, settings(github_issues_token="ghp"), PollState(cutoff_id=CUTOFF, **kw), gh)

    return asyncio.run(go())


def rows(db) -> list[Feedback]:
    return list(db.scalars(select(Feedback).order_by(Feedback.id)))


def forum_with(*pairs, **kw) -> FakeDiscord:
    return FakeDiscord(
        {**FORUM},
        threads=[t for t, _ in pairs],
        starters={tid: starter(tid) for _, tid in pairs},
        **kw,
    )


def test_forum_post_is_filed_and_answered_in_its_thread_979(db):
    t, tid = thread(2)
    fake = forum_with((t, tid))
    assert poll(fake, db) == 1
    (row,) = rows(db)
    assert (row.app, row.kind, row.status, row.discord_author) == ("discord", "bug", "open", "Zoro")
    assert row.discord_message_id == tid
    assert row.page == f"https://discord.com/channels/{GUILD}/{tid}/{tid}"
    assert "Match menu stuck" in row.message and "It never closes on mobile." in row.message
    assert "https://cdn.example/shot.png" in row.message
    ((path, body),) = fake.posts
    assert path == f"/channels/{tid}/messages"
    assert f"#{row.id}" in body["content"] and "Zoro" in body["content"]
    assert body["allowed_mentions"] == {"parse": []}
    assert "message_reference" not in body


def test_polling_twice_files_and_replies_once_979(db):
    t, tid = thread(2)
    fake = forum_with((t, tid))
    assert poll(fake, db) == 1
    assert poll(fake, db) == 0
    assert len(rows(db)) == 1 and len(fake.posts) == 1
    assert len([r for r in fake.requests if r.url.path.endswith(f"/channels/{tid}/messages/{tid}")]) == 1


def test_a_post_filed_by_another_worker_is_not_filed_or_answered_again_979(db):
    t, tid = thread(2)
    fake = forum_with((t, tid))
    db.add(Feedback(kind="bug", message="x", app="discord", discord_message_id=tid))
    db.commit()
    assert poll(fake, db) == 0
    assert len(rows(db)) == 1 and fake.posts == []


def test_unique_message_id_stops_a_racing_insert_979(db, monkeypatch: pytest.MonkeyPatch):
    t, tid = thread(2)
    fake = forum_with((t, tid))
    # The other worker commits between our duplicate check and our insert.
    monkeypatch.setattr(discord_feedback, "_known", lambda *_: set())
    db.add(Feedback(kind="bug", message="x", app="discord", discord_message_id=tid))
    db.commit()
    assert poll(fake, db) == 0
    assert len(rows(db)) == 1 and fake.posts == []


def test_old_foreign_and_bot_posts_are_ignored_979(db):
    old, old_id = thread(60, "Old")
    foreign, foreign_id = thread(3, "Elsewhere", parent="777")
    bot, bot_id = thread(2, "Bot post")
    fake = forum_with((old, old_id), (foreign, foreign_id), (bot, bot_id))
    fake.starters[bot_id] = starter(bot_id, author={**USER, "bot": True})
    assert poll(fake, db) == 0
    assert rows(db) == [] and fake.posts == []


def test_text_channel_message_is_filed_and_answered_as_a_reply_979(db):
    mid, old_mid, bot_mid = sid(2), sid(60), sid(1)
    fake = FakeDiscord(
        {"type": 0},
        messages=[
            {"id": mid, "type": 0, "content": "Deck import fails", "author": USER, "attachments": []},
            {"id": old_mid, "type": 0, "content": "ancient", "author": USER, "attachments": []},
            {"id": bot_mid, "type": 0, "content": "beep", "author": {**USER, "bot": True}, "attachments": []},
            {"id": sid(1.5), "type": 7, "content": "Welcome!", "author": USER, "attachments": []},
        ],
    )
    assert poll(fake, db) == 1
    (row,) = rows(db)
    assert (row.discord_message_id, row.message) == (mid, "Deck import fails")
    assert row.page == f"https://discord.com/channels/{GUILD}/{CHANNEL}/{mid}"
    ((path, body),) = fake.posts
    assert path == f"/channels/{CHANNEL}/messages"
    assert body["message_reference"] == {"message_id": mid}
    assert body["allowed_mentions"] == {"parse": []}


def test_text_channel_asks_only_for_messages_after_the_newest_ticket_979(db):
    newest = sid(3)
    db.add(Feedback(kind="bug", message="x", app="discord", discord_message_id=newest))
    db.commit()
    fake = FakeDiscord({"type": 0})
    poll(fake, db)
    (req,) = [r for r in fake.requests if r.url.path.endswith("/messages")]
    assert req.url.params["after"] == newest


def test_suggestion_tag_files_an_idea_and_no_tag_a_bug_979(db):
    idea, idea_id = thread(2, "Add a dark mode", tags=["2"])
    plain, plain_id = thread(1, "Crash", tags=[])
    fake = forum_with((idea, idea_id), (plain, plain_id))
    poll(fake, db)
    assert {r.discord_message_id: r.kind for r in rows(db)} == {idea_id: "idea", plain_id: "bug"}


def test_failed_reply_keeps_the_ticket_and_the_next_post_979(db):
    a, a_id = thread(3, "First")
    b, b_id = thread(2, "Second")
    fake = forum_with((a, a_id), (b, b_id), reply_status=500)
    assert poll(fake, db) == 2
    assert len(rows(db)) == 2
    assert poll(fake, db) == 0
    assert len(fake.posts) == 2


def test_rate_limited_reply_does_not_crash_or_refile_979(db):
    a, a_id = thread(3, "First")
    b, b_id = thread(2, "Second")
    fake = forum_with((a, a_id), (b, b_id), reply_status=429)
    assert poll(fake, db) == 1  # stops the poll at the 429
    assert len(rows(db)) == 1
    fake.reply_status = 200
    assert poll(fake, db) == 1  # the second post, not the first again
    assert sorted(r.discord_message_id for r in rows(db)) == sorted([a_id, b_id])


def test_rate_limited_listing_files_nothing_979(db):
    fake = FakeDiscord({"type": 0})
    fake.handler = lambda request: httpx.Response(429, json={"retry_after": 0})
    assert poll(fake, db) == 0 and rows(db) == []


def test_requests_carry_the_bot_token_and_user_agent_979():
    client = discord_feedback.make_client("secret-token")
    assert client.headers["Authorization"] == "Bot secret-token"
    assert client.headers["User-Agent"] == discord_feedback.USER_AGENT
    asyncio.run(client.aclose())


@pytest.mark.parametrize("token,channel", [("", CHANNEL), ("tok", ""), ("  ", CHANNEL)])
def test_bot_is_off_without_token_or_channel_979(token, channel):
    cfg = Settings(discord_bot_token=token, discord_feedback_channel_id=channel)
    assert discord_feedback.start_background(cfg) is None


def test_bot_starts_when_token_and_channel_are_set_979(monkeypatch: pytest.MonkeyPatch):
    async def go():
        monkeypatch.setattr(discord_feedback, "poll_loop", lambda s: asyncio.sleep(0))
        task = discord_feedback.start_background(settings())
        assert task is not None
        await task

    asyncio.run(go())


def test_admin_list_names_the_discord_author_as_reporter_979(db):
    t, tid = thread(2)
    poll(forum_with((t, tid)), db)
    db.add(Feedback(kind="bug", message="anon one", app="duel"))
    db.commit()
    out = list_feedback(db, status="all")
    assert {o.app: o.reporter for o in out} == {"discord": "Discord · Zoro", "duel": "anonymous"}


def test_new_ticket_opens_one_github_issue_before_the_reply_979(db):
    t, tid = thread(2)
    fake, gh = forum_with((t, tid)), FakeGitHub()
    poll(fake, db, gh)
    poll(fake, db, gh)
    ((path, body, _),) = gh.issues
    (row,) = rows(db)
    assert path == "/repos/mitangy/optcg-deck-planner/issues"
    assert body["title"] == "[Discord] Match menu stuck"
    assert body["labels"] == ["discord-feedback", "bug"]
    assert "It never closes on mobile." in body["body"]
    assert f"From Discord: Zoro · https://discord.com/channels/{GUILD}/{tid}/{tid}" in body["body"]
    assert f"Feedback ticket #{row.id}" in body["body"]
    assert row.github_issue == 101
    ((_, reply),) = fake.posts
    assert f"#{row.id}" in reply["content"] and "github" not in reply["content"].lower()


def test_idea_ticket_labels_the_issue_idea_979(db):
    t, tid = thread(2, "Add dark mode", tags=["2"])
    gh = FakeGitHub()
    poll(forum_with((t, tid)), db, gh)
    assert gh.issues[0][1]["labels"] == ["discord-feedback", "idea"]


def test_text_channel_issue_title_is_the_start_of_the_message_979(db):
    mid = sid(2)
    fake = FakeDiscord({"type": 0}, messages=[{"id": mid, "type": 0, "content": "x" * 200, "author": USER, "attachments": []}])
    gh = FakeGitHub()
    poll(fake, db, gh)
    assert gh.issues[0][1]["title"] == "[Discord] " + "x" * 80


def test_no_issue_is_opened_without_a_github_token_979(db):
    t, tid = thread(2)
    fake = forum_with((t, tid))
    assert poll(fake, db) == 1
    assert rows(db)[0].github_issue is None and len(fake.posts) == 1


def test_github_failure_keeps_the_ticket_and_reply_then_a_later_poll_opens_the_issue_979(db):
    t, tid = thread(2)
    fake, gh = forum_with((t, tid)), FakeGitHub(status=500)
    assert poll(fake, db, gh) == 1
    (row,) = rows(db)
    assert row.github_issue is None and len(fake.posts) == 1
    gh.status = 201
    assert poll(fake, db, gh) == 0
    db.refresh(row)
    assert row.github_issue == 101 and len(gh.issues) == 1
    poll(fake, db, gh)
    assert len(gh.issues) == 1 and len(fake.posts) == 1


def test_issue_retry_skips_tickets_older_than_a_day_979(db):
    old = Feedback(kind="bug", message="stale", app="discord", discord_message_id="1", created_at=datetime.now(timezone.utc) - timedelta(days=3))
    db.add(old)
    db.commit()
    gh = FakeGitHub()
    poll(FakeDiscord({"type": 0}), db, gh)
    assert gh.issues == []


def test_github_requests_carry_the_token_and_api_version_979():
    client = discord_feedback.make_github_client("ghp_secret")
    assert client.headers["Authorization"] == "Bearer ghp_secret"
    assert client.headers["X-GitHub-Api-Version"] == "2022-11-28"
    assert client.headers["Accept"] == "application/vnd.github+json"
    asyncio.run(client.aclose())


@pytest.mark.parametrize("token,expect_github", [("", False), ("ghp", True)])
def test_github_client_is_only_used_with_a_token_979(db, monkeypatch: pytest.MonkeyPatch, token, expect_github):
    from app.core import db as app_db

    seen = {}

    async def fake_poll(client, session, cfg, state, github=None):
        seen["github"] = github
        return 0

    monkeypatch.setattr(app_db, "SessionLocal", lambda: db)
    monkeypatch.setattr(discord_feedback, "poll_once", fake_poll)
    asyncio.run(discord_feedback.run_once(settings(github_issues_token=token), PollState()))
    assert (seen["github"] is not None) is expect_github


def test_text_channel_moves_past_a_burst_of_unfiled_messages_989(db):
    # 50 bot replies fill a whole page; the user message behind them must still be reached.
    bots = [
        {"id": str(int(sid(9)) + i * 1000), "type": 0, "content": "Logged", "author": {**USER, "bot": True}, "attachments": []}
        for i in range(50)
    ]
    mid = sid(1)
    fake = FakeDiscord({"type": 0}, messages=[*bots, {"id": mid, "type": 0, "content": "Real bug", "author": USER, "attachments": []}])

    async def go():
        state = PollState(cutoff_id=CUTOFF)
        async with fake.client() as client:
            return [await poll_once(client, db, settings(), state) for _ in range(2)]

    assert asyncio.run(go()) == [0, 1]
    assert [r.discord_message_id for r in rows(db)] == [mid]


def test_issue_lost_to_a_timeout_is_adopted_not_opened_twice_989(db):
    t, tid = thread(2)
    fake, gh = forum_with((t, tid)), FakeGitHub(lose_response_once=True)
    assert poll(fake, db, gh) == 1  # the same poll's retry pass finds the issue the lost reply created
    (row,) = rows(db)
    assert row.github_issue == 101 and len(gh.issues) == 1
    poll(fake, db, gh)
    assert len(gh.issues) == 1


def test_discord_mentions_cannot_ping_github_users_989(db):
    t, tid = thread(2, "Ping @octocat")
    fake = forum_with((t, tid))
    fake.starters[tid] = starter(tid, content="cc @octocat and @some-org/team", author={**USER, "global_name": "@evil"})
    gh = FakeGitHub()
    poll(fake, db, gh)
    ((_, issue, _),) = gh.issues
    for text in (issue["body"], issue["title"]):
        assert "@" in text and re.search(r"@(?!\u200b)", text) is None
    assert "octocat" in issue["body"] and "some-org/team" in issue["body"] and "evil" in issue["body"]
