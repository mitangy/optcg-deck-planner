"""Log Pose learning loop: matchup stats from recorded duels, sharing opt-out, and lessons (#246)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app import analyst_stats
from app.models import DuelMatchSeat
from tests.test_analyst import _me_and_token, analyst  # noqa: F401  (fixture)
from tests.test_duel import _ingest, client  # noqa: F401  (fixture)

ZORO, LUCCI, NAMI_CARD, VIVI_CARD = "OP01-001", "OP05-060", "OP01-016", "OP01-006"
SERVICE = {"X-Analyst-Service": "svc-secret"}


def _replay(first: int, deck0: list[str], deck1: list[str]) -> dict:
    return {"firstSeat": first, "players": [{"leaderId": ZORO, "deck": deck0}, {"leaderId": LUCCI, "deck": deck1}]}


def _users(c, *keys: str) -> list[int]:
    return [c.post("/duel/dev-token", json={"user_key": k}).json()["user_id"] for k in keys]


def _zoro_vs_lucci(c, prefix: str, seat0: int, seat1: int, results: list[tuple[int, int]], deck0=None):
    """Seat 0 plays Zoro, seat 1 Lucci; results are (winner seat, first seat) per game."""
    for n, (winner, first) in enumerate(results):
        _ingest(
            c, f"{prefix}{n}", seat0, seat1, winner,
            seat0_leader_id=ZORO, seat1_leader_id=LUCCI, turns=8 + n,
            replay=_replay(first, deck0 or [NAMI_CARD] * 4, [VIVI_CARD] * 4),
        )


def _stats(c, **params):
    r = c.get("/analyst/stats/matchups", params=params, headers=SERVICE)
    assert r.status_code == 200, r.text
    return r.json()


def test_matchup_stats_count_wins_by_side_and_by_who_went_first(analyst):  # noqa: F811
    """A leader pair's record, win rate interval and first/second split come from each side's seat (#246)."""
    c, _ = analyst
    a, b = _users(c, "alice", "bob")
    # Zoro wins 4 of 6; going first (games 0, 2, 4) Zoro wins 3 of 3.
    _zoro_vs_lucci(c, "m", a, b, [(0, 0), (1, 1), (0, 0), (1, 1), (0, 0), (0, 1)])
    s = _stats(c, leader=ZORO, opponent=LUCCI)
    assert (s["games"], s["wins"], s["win_rate"], s["too_few_games"]) == (6, 4, 0.667, False)
    assert s["interval"] == list(analyst_stats.wilson(4, 6))
    assert (s["going_first"]["games"], s["going_first"]["wins"]) == (3, 3)
    assert (s["going_second"]["games"], s["going_second"]["wins"]) == (3, 1)
    other = _stats(c, leader=LUCCI, opponent=ZORO)
    assert (other["games"], other["wins"], other["going_first"]["wins"]) == (6, 2, 2)


def test_wilson_interval_matches_the_textbook_value(analyst):  # noqa: F811
    """4 wins in 6 games gives the 95% Wilson interval 0.300 to 0.903 (#246)."""
    assert analyst_stats.wilson(4, 6) == (0.3, 0.903)
    assert analyst_stats.wilson(0, 0) is None


def test_players_who_turn_sharing_off_drop_out_of_every_stat(analyst):  # noqa: F811
    """Turning sharing off removes the player's games from the aggregates (#246)."""
    c, _ = analyst
    me, _token = _me_and_token(c)
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "shared", a, b, [(0, 0)] * 5)
    _zoro_vs_lucci(c, "mine", me["id"], b, [(1, 0)] * 5)
    assert _stats(c, leader=ZORO, opponent=LUCCI)["games"] == 10
    assert c.get("/analyst/sharing").json() == {"share_matches": True}
    assert c.put("/analyst/sharing", json={"share_matches": False}).status_code == 200
    s = _stats(c, leader=ZORO, opponent=LUCCI)
    assert (s["games"], s["wins"]) == (5, 5)
    assert _stats(c)["total_games"] == 5


def test_a_leaders_overview_leaves_mirrors_out_and_reports_them_on_their_own(analyst):  # noqa: F811
    """Mirror games are neither wins nor losses for the leader's record (#246)."""
    c, _ = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "m", a, b, [(0, 0), (1, 0)])
    for n in range(3):
        _ingest(c, f"mirror{n}", a, b, 0, seat0_leader_id=ZORO, seat1_leader_id=ZORO)
    s = _stats(c, leader=ZORO)
    assert (s["overall"]["games"], s["overall"]["wins"]) == (2, 1)
    assert [o["opponent"] for o in s["opponents"]] == [LUCCI]
    assert _stats(c, leader=ZORO, opponent=ZORO) == {**_stats(c, leader=ZORO, opponent=ZORO), "mirror": True, "games": 3}


def test_card_rates_need_enough_games_with_and_without_the_card(analyst):  # noqa: F811
    """A card's with/without win rates appear only with five games on each side (#246)."""
    c, _ = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "with", a, b, [(0, 0)] * 5, deck0=[NAMI_CARD] * 4 + [VIVI_CARD])
    _zoro_vs_lucci(c, "without", a, b, [(1, 0)] * 4, deck0=[NAMI_CARD] * 4)
    assert _stats(c, leader=ZORO)["cards"] == []
    _zoro_vs_lucci(c, "more", a, b, [(1, 0)], deck0=[NAMI_CARD] * 4)
    cards = _stats(c, leader=ZORO)["cards"]
    assert [(r["id"], r["with"]["games"], r["with"]["wins"], r["without"]["games"], r["without"]["wins"]) for r in cards] == [
        (VIVI_CARD, 5, 5, 5, 0)
    ]


def test_stats_only_count_games_inside_the_window(analyst):  # noqa: F811
    """Games older than the asked number of days are left out (#246)."""
    c, SessionLocal = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "m", a, b, [(0, 0), (1, 0)])
    db = SessionLocal()
    try:
        for row in db.query(DuelMatchSeat).filter(DuelMatchSeat.match_id == "m0"):
            row.created_at = datetime.now(timezone.utc) - timedelta(days=40)
        db.commit()
    finally:
        db.close()
    assert _stats(c, leader=ZORO, opponent=LUCCI, days=30)["games"] == 1
    assert _stats(c, leader=ZORO, opponent=LUCCI, days=60)["games"] == 2


def test_stats_are_for_the_analyst_service_only(analyst):  # noqa: F811
    """The stats endpoint needs the service secret (#246)."""
    c, _ = analyst
    assert c.get("/analyst/stats/matchups").status_code == 403
    assert c.get("/analyst/stats/matchups", headers={"X-Analyst-Service": "nope"}).status_code == 403
    assert c.get("/analyst/stats/matchups", headers=SERVICE).status_code == 200


def test_older_matches_get_seats_from_their_replay_on_startup(analyst):  # noqa: F811
    """Backfill rebuilds seat rows, decks and who went first from a kept replay (#246)."""
    c, SessionLocal = analyst
    a, b = _users(c, "alice", "bob")
    _zoro_vs_lucci(c, "old", a, b, [(1, 1)])
    db = SessionLocal()
    try:
        db.query(DuelMatchSeat).delete()
        db.commit()
        assert analyst_stats.backfill_seats(db) == 2
        rows = {r.seat: r for r in db.query(DuelMatchSeat).all()}
        assert (rows[0].leader_id, rows[0].won, rows[0].went_first, rows[0].deck) == (ZORO, False, False, '{"OP01-016":4}')
        assert (rows[1].leader_id, rows[1].won, rows[1].went_first) == (LUCCI, True, True)
        assert analyst_stats.backfill_seats(db) == 0
    finally:
        db.close()


def test_claude_drafts_lessons_only_from_the_link_owners_games(analyst):  # noqa: F811
    """A drafted lesson may cite only the owner's matches, and stays out of Claude's reads until approved (#246)."""
    c, _ = analyst
    me, token = _me_and_token(c)
    a, b = _users(c, "alice", "bob")
    _ingest(c, "mine", me["id"], a, 0)
    _ingest(c, "theirs", a, b, 0)
    link = {"X-Analyst-Token": token}
    lesson = {"text": "Hold a 2000 counter for turn four against Lucci.", "leader_id": ZORO, "opponent_id": LUCCI}
    r = c.post("/analyst/lessons", json={**lesson, "match_ids": ["mine", "theirs"]}, headers=link)
    assert r.status_code == 400 and "theirs" in r.json()["detail"]
    r = c.post("/analyst/lessons", json={**lesson, "match_ids": ["mine"], "cards": [NAMI_CARD]}, headers=link)
    assert r.status_code == 201, r.text
    lesson_id = r.json()["id"]
    assert c.get("/analyst/lessons", headers=link).json()["lessons"] == []
    assert [l["status"] for l in c.get("/analyst/lessons/review").json()["lessons"]] == ["draft"]

    approved = c.patch(f"/analyst/lessons/review/{lesson_id}", json={"status": "approved"}).json()
    assert approved["status"] == "approved" and approved["reviewed_at"]
    got = c.get("/analyst/lessons", headers=link, params={"leader": LUCCI}).json()["lessons"]
    assert [(l["id"], l["match_ids"], l["cards"]) for l in got] == [(lesson_id, ["mine"], [NAMI_CARD])]


def test_only_the_owner_can_review_a_lesson(analyst):  # noqa: F811
    """Another signed-in player can't see, approve or delete someone's lesson (#246)."""
    c, SessionLocal = analyst
    me, token = _me_and_token(c)
    r = c.post("/analyst/lessons", json={"text": "Mulligan hands with no two-cost play."}, headers={"X-Analyst-Token": token})
    lesson_id = r.json()["id"]
    from app.models import AnalystLesson

    db = SessionLocal()
    try:
        db.get(AnalystLesson, lesson_id).user_id = _users(c, "alice")[0]
        db.commit()
    finally:
        db.close()
    assert c.patch(f"/analyst/lessons/review/{lesson_id}", json={"status": "approved"}).status_code == 404
    assert c.delete(f"/analyst/lessons/review/{lesson_id}").status_code == 404
    assert c.get("/analyst/lessons/review").json()["lessons"] == []


def test_drafts_stop_at_the_review_limit(analyst, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    """Claude can't pile up more drafts than the review limit (#246)."""
    from app.routers import analyst as analyst_router

    monkeypatch.setattr(analyst_router, "MAX_DRAFT_LESSONS", 2)
    c, _ = analyst
    _me, token = _me_and_token(c)
    link = {"X-Analyst-Token": token}
    codes = [c.post("/analyst/lessons", json={"text": f"Lesson number {n} text."}, headers=link).status_code for n in range(3)]
    assert codes == [201, 201, 409]
