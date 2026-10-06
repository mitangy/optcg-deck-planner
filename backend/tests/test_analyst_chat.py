"""Log Pose in the app: chat sessions and tokens, spend caps, threads, post-game reviews
and the anonymized game corpus (#377)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import get_settings
from app.models import AnalystMessage, AnalystThread, AnalystUsage, User
from app.routers.analyst import mint_chat_token
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_analyst_stats import LUCCI, NAMI_CARD, SERVICE, VIVI_CARD, ZORO, _users, _zoro_vs_lucci
from tests.test_duel import _ingest, client  # noqa: F401  (fixture)


@pytest.fixture()
def chat(analyst, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    monkeypatch.setenv("ANALYST_CHAT_EMAILS", "Someone@else.example, DEV@localhost")
    monkeypatch.setenv("ANALYST_CHAT_DAILY_USD", "1.0")
    monkeypatch.setenv("ANALYST_CHAT_MONTHLY_USD", "5.0")
    get_settings.cache_clear()
    yield analyst
    get_settings.cache_clear()


def _session(c) -> tuple[dict, dict]:
    me = c.post("/auth/dev-login").json()
    body = c.post("/analyst/chat/session").json()
    return me, body


def _as(token: str) -> dict:
    return {"X-Analyst-Token": token, **SERVICE}


def test_the_chat_panel_is_only_on_for_allowlisted_players(analyst, monkeypatch):  # noqa: F811
    """No token is handed out unless the player's email is on ANALYST_CHAT_EMAILS (#377)."""
    c, _ = analyst
    monkeypatch.setenv("ANALYST_CHAT_EMAILS", "someone@else.example")
    get_settings.cache_clear()
    _, body = _session(c)
    assert body == {"enabled": False, "token": None, "expires_at": None, "chat_url": None}

    monkeypatch.setenv("ANALYST_CHAT_EMAILS", "someone@else.example, DEV@localhost")
    get_settings.cache_clear()
    _, body = _session(c)
    assert body["enabled"] is True and body["chat_url"] == "https://analyst.example"
    assert c.get("/analyst/me", headers={"X-Analyst-Token": body["token"]}).status_code == 200


def test_a_chat_token_must_be_signed_and_unexpired(chat):
    """Tampered or expired chat tokens are turned away (#377)."""
    c, SessionLocal = chat
    me, body = _session(c)
    token = body["token"]
    _, uid, exp, sig = token.split(".")
    forged = f"chat.{uid}.{int(exp) + 86400}.{sig}"  # stretched expiry, old signature
    assert c.get("/analyst/me", headers={"X-Analyst-Token": forged}).status_code == 401

    db = SessionLocal()
    try:
        user = db.get(User, me["id"])
        old, _ = mint_chat_token(get_settings(), user, int(datetime.now(timezone.utc).timestamp()) - 3600)
    finally:
        db.close()
    assert c.get("/analyst/me", headers={"X-Analyst-Token": old}).status_code == 401


def _spend(SessionLocal, user_id: int, cost: float, when: datetime | None = None) -> None:
    db = SessionLocal()
    try:
        db.add(AnalystUsage(user_id=user_id, kind="chat", cost_usd=cost, **({"created_at": when} if when else {})))
        db.commit()
    finally:
        db.close()


def test_the_daily_cap_counts_only_your_spend_today(chat):
    """Other players' spend and yesterday's don't use up today's cap; reaching it stops chat (#377)."""
    c, SessionLocal = chat
    me, body = _session(c)
    other = _users(c, "alice")[0]
    _spend(SessionLocal, other, 0.9)
    _spend(SessionLocal, me["id"], 0.9, datetime.now(timezone.utc) - timedelta(days=1, hours=1))
    _spend(SessionLocal, me["id"], 0.6)
    budget = c.get("/analyst/chat/budget", headers=_as(body["token"])).json()
    assert budget["spent_today_usd"] == pytest.approx(0.6) and budget["allowed"] is True

    _spend(SessionLocal, me["id"], 0.4)
    assert c.get("/analyst/chat/budget", headers=_as(body["token"])).json()["allowed"] is False


def test_the_monthly_cap_counts_everyone(chat):
    """The monthly cap is for all players together (#377)."""
    c, SessionLocal = chat
    _, body = _session(c)
    _spend(SessionLocal, _users(c, "alice")[0], 5.0)
    budget = c.get("/analyst/chat/budget", headers=_as(body["token"])).json()
    assert budget["spent_month_usd"] == pytest.approx(5.0) and budget["allowed"] is False


def test_usage_is_recorded_against_the_player(chat):
    c, _ = chat
    _, body = _session(c)
    r = c.post("/analyst/chat/usage", json={"kind": "review", "model": "m", "cost_usd": 0.25}, headers=_as(body["token"]))
    assert r.status_code == 204
    assert c.get("/analyst/chat/budget", headers=_as(body["token"])).json()["spent_today_usd"] == pytest.approx(0.25)


def test_thread_content_is_only_for_the_analyst_service(chat):
    """The browser's chat token alone can't read raw thread content (tool results included) (#377)."""
    c, _ = chat
    _, body = _session(c)
    tid = c.post("/analyst/chat/threads", json={"title": "Zoro"}, headers=_as(body["token"])).json()["id"]
    r = c.get(f"/analyst/chat/threads/{tid}/content", headers={"X-Analyst-Token": body["token"]})
    assert r.status_code == 403


def test_threads_store_messages_as_sent_and_show_only_the_conversation(chat):
    """Content round-trips as stored; the panel hides page context and tool turns and joins one answer (#377)."""
    c, _ = chat
    _, body = _session(c)
    h = _as(body["token"])
    tid = c.post("/analyst/chat/threads", json={"title": "Zoro"}, headers=h).json()["id"]
    messages = [
        {"role": "user", "content": [{"type": "text", "text": "<context>page: decks</context>"}, {"type": "text", "text": "How is my Zoro?"}]},
        {"role": "assistant", "content": [{"type": "thinking", "thinking": "x", "signature": "s"}, {"type": "text", "text": "Let me look."}, {"type": "tool_use", "id": "t1", "name": "analyze_deck", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "50 cards"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "It's legal."}]},
    ]
    assert c.post(f"/analyst/chat/threads/{tid}/messages", json={"messages": messages}, headers=h).status_code == 204
    stored = c.get(f"/analyst/chat/threads/{tid}/content", headers=h).json()
    assert stored["messages"] == messages

    view = c.get(f"/analyst/chat/threads/{tid}").json()
    assert view["messages"] == [
        {"role": "user", "text": "How is my Zoro?", "citations": []},
        {"role": "assistant", "text": "Let me look.\n\nIt's legal.", "citations": []},
    ]
    c.post("/analyst/chat/threads", json={"title": "never answered"}, headers=h)
    assert [t["id"] for t in c.get("/analyst/chat/threads").json()["threads"]] == [tid]


def _loc(source, quote, title="T"):
    return {"type": "search_result_location", "source": source, "title": title, "cited_text": quote, "search_result_index": 0, "start_block_index": 0, "end_block_index": 1}


def test_the_thread_view_places_each_citation_after_the_text_it_cites(chat):
    """An answer's citations come back with their UTF-16 offsets in the joined text; tool turns stay hidden (#390)."""
    c, _ = chat
    _, body = _session(c)
    h = _as(body["token"])
    tid = c.post("/analyst/chat/threads", json={"title": "Zoro"}, headers=h).json()["id"]
    results = [{"type": "search_result", "source": "card:OP01-001", "title": "Zoro", "content": [{"type": "text", "text": "cost 3"}], "citations": {"enabled": True}}]
    messages = [
        {"role": "user", "content": [{"type": "text", "text": "How is my Zoro?"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "Looking."}, {"type": "tool_use", "id": "t1", "name": "get_cards", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": results}]},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Zoro \U0001F5E1 costs 3.", "citations": [_loc("card:OP01-001", "cost 3", "Zoro"), _loc("card:OP01-001", "cost 3"), {"type": "page_location", "source": "doc:1", "cited_text": "n"}]},
                {"type": "text", "text": " I'd keep him."},
                {"type": "text", "text": " Blockers rest.", "citations": [_loc("rule:6-5-3", "r" * 2000, "Rules")]},
            ],
        },
    ]
    assert c.post(f"/analyst/chat/threads/{tid}/messages", json={"messages": messages}, headers=h).status_code == 204
    view = c.get(f"/analyst/chat/threads/{tid}").json()["messages"]
    assert [m["role"] for m in view] == ["user", "assistant"]
    answer = view[1]
    assert answer["text"] == "Looking.\n\nZoro \U0001F5E1 costs 3. I'd keep him. Blockers rest."
    units = lambda s: len(s.encode("utf-16-le")) // 2  # noqa: E731
    first = units("Looking.\n\nZoro \U0001F5E1 costs 3.")
    assert first == len("Looking.\n\nZoro  costs 3.") + 2  # the dagger is two UTF-16 units
    assert [(x["at"], x["source"]) for x in answer["citations"]] == [(first, "card:OP01-001"), (units(answer["text"]), "rule:6-5-3")]
    assert answer["citations"][0] == {"at": first, "source": "card:OP01-001", "title": "Zoro", "cited_text": "cost 3"}
    assert len(answer["citations"][1]["cited_text"]) == 800
    # The stored message keeps the citations as sent.
    assert c.get(f"/analyst/chat/threads/{tid}/content", headers=h).json()["messages"] == messages


def test_a_thread_belongs_to_its_player(chat):
    """Another player's thread is not found, through the analyst or the app (#377)."""
    c, SessionLocal = chat
    _, body = _session(c)
    db = SessionLocal()
    try:
        row = AnalystThread(user_id=_users(c, "alice")[0], title="Alice's")
        db.add(row)
        db.commit()
        tid = row.id
        db.add(AnalystMessage(thread_id=tid, role="user", content='"hi"'))
        db.commit()
    finally:
        db.close()
    h = _as(body["token"])
    assert c.get(f"/analyst/chat/threads/{tid}").status_code == 404
    assert c.get(f"/analyst/chat/threads/{tid}/content", headers=h).status_code == 404
    msg = {"messages": [{"role": "user", "content": "hi"}]}
    assert c.post(f"/analyst/chat/threads/{tid}/messages", json=msg, headers=h).status_code == 404
    assert c.get("/analyst/chat/threads").json()["threads"] == []


def test_reviews_are_saved_only_for_games_you_played(chat):
    """The analyst can save a post-game analysis only for the player's own games; the app reads it back (#377)."""
    c, _ = chat
    me, body = _session(c)
    a, b = _users(c, "alice", "bob")
    _ingest(c, "mine", a, me["id"], 1)
    _ingest(c, "theirs", a, b, 0)
    h = _as(body["token"])
    assert c.get("/analyst/reviews/mine").status_code == 404
    assert c.put("/analyst/reviews/theirs", json={"text": "x"}, headers=h).status_code == 404
    r = c.put("/analyst/reviews/mine", json={"text": "You lost on turn 6."}, headers=h)
    assert r.status_code == 200, r.text
    assert c.get("/analyst/reviews/mine").json()["text"] == "You lost on turn 6."
    c.put("/analyst/reviews/mine", json={"text": "Again."}, headers=h)
    assert c.get("/analyst/reviews/mine").json()["text"] == "Again."


def test_a_review_keeps_the_sources_it_cites(chat):
    """The saved analysis comes back with its citations; one beyond the text is dropped; saving again replaces them (#390)."""
    c, _ = chat
    me, body = _session(c)
    a, _b = _users(c, "alice", "bob")
    _ingest(c, "mine", a, me["id"], 1)
    h = _as(body["token"])
    cites = [
        {"at": 19, "source": "match:mine#t3", "title": "Your game, turn 3", "cited_text": "Your Life card is taken"},
        {"at": 400, "source": "match:mine#t4", "title": "Too far", "cited_text": "x"},
    ]
    r = c.put("/analyst/reviews/mine", json={"text": "You lost on turn 3.", "citations": cites}, headers=h)
    assert r.status_code == 200, r.text
    saved = c.get("/analyst/reviews/mine").json()
    assert saved["citations"] == [cites[0]]
    assert r.json()["citations"] == [cites[0]]
    c.put("/analyst/reviews/mine", json={"text": "Again."}, headers=h)
    assert c.get("/analyst/reviews/mine").json()["citations"] == []


def test_the_corpus_is_anonymized_and_puts_the_leader_on_side_a(analyst):
    """Corpus games carry opaque ids and rating bands, never names or match ids; side A is the asked leader (#377)."""
    c, _ = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "g", b, a, [(1, 0)])  # seat 0 Zoro (bob), seat 1 Lucci (alice) wins
    r = c.get("/analyst/corpus/games", params={"leader": LUCCI}, headers=SERVICE)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["total"] == 1
    game = out["games"][0]
    assert game["A"]["leader"] == LUCCI and game["A"]["won"] is True and game["B"]["leader"] == ZORO
    assert game["game_id"].startswith("g_") and "g0" not in str(game) and "alice" not in str(game)
    assert game["A"]["rating_band"].endswith("99")

    replay = c.get(f"/analyst/corpus/games/{game['game_id']}/replay", headers=SERVICE).json()
    assert replay["sides"] == {"A": 0, "B": 1} and "players" in replay["replay"]
    assert c.get("/analyst/corpus/games", params={"leader": LUCCI}).status_code == 403


def test_the_corpus_filters_by_card_and_result(analyst):
    """Card and result filters apply to side A (#377)."""
    c, _ = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "w", a, b, [(0, 0)], deck0=[NAMI_CARD] * 4)
    _zoro_vs_lucci(c, "l", a, b, [(1, 0)], deck0=[VIVI_CARD] * 4)
    won = c.get("/analyst/corpus/games", params={"leader": ZORO, "result": "won"}, headers=SERVICE).json()
    assert won["total"] == 1 and won["games"][0]["A"]["won"] is True
    nami = c.get("/analyst/corpus/games", params={"leader": ZORO, "card": NAMI_CARD}, headers=SERVICE).json()
    assert nami["total"] == 1 and nami["games"][0]["A"]["won"] is True


def test_opted_out_players_games_leave_the_corpus(analyst):
    """Turning sharing off removes a player's games from corpus search and replays, even ids found before (#377)."""
    c, _ = analyst
    me = c.post("/auth/dev-login").json()
    a = _users(c, "alice")[0]
    _zoro_vs_lucci(c, "o", me["id"], a, [(0, 0)])
    games = c.get("/analyst/corpus/games", headers=SERVICE).json()["games"]
    assert len(games) == 1
    gid = games[0]["game_id"]
    assert c.get(f"/analyst/corpus/games/{gid}/replay", headers=SERVICE).status_code == 200

    assert c.put("/analyst/sharing", json={"share_matches": False}).status_code == 200
    assert c.get("/analyst/corpus/games", headers=SERVICE).json()["total"] == 0
    assert c.get(f"/analyst/corpus/games/{gid}/replay", headers=SERVICE).status_code == 404
