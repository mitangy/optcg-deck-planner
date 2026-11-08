"""Log Pose bot game corpus: self-play games, simulated stats, and their separation from real duels (#635)."""

from __future__ import annotations

import pytest

from app.analyst import bots as analyst_bots
from app.analyst import stats as analyst_stats
from app.analyst.models import BotMatch
from app.duel.models import DuelMatch, DuelMatchSeat
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_duel import client  # noqa: F401  (fixture)

ZORO, LUCCI, NAMI, VIVI = "OP01-001", "OP05-060", "OP01-016", "OP01-006"
SERVICE = {"X-Analyst-Service": "svc-secret"}


def _replay(winner: int | None = 0, first: int = 0, leaders=(ZORO, LUCCI), deck0=None, deck1=None) -> dict:
    out = {
        "schema": 1, "rulesVersion": "0.3.0", "registryHash": "fnv1a:test", "seed": 1, "firstSeat": first,
        "players": [{"leaderId": leaders[0], "deck": deck0 or [NAMI] * 4}, {"leaderId": leaders[1], "deck": deck1 or [VIVI] * 4}],
        "intents": [{"seat": 0, "intent": {"type": "end_turn"}}],
    }
    if winner is not None:
        out["end"] = {"winner": winner, "reason": "leader_battle_at_zero_life"}
    return out


def _tally(**kw) -> dict:
    return {"activations": 0, "leaderActivations": 0, "activationsByCard": {}, "optionalAccepts": {}, "optionalDeclines": {}, "counterEvents": {}, "cheatOuts": {}, "mainEvents": {}, "decisions": 3, "decisionMs": 1.5, **kw}


def _game(index: int, winner: int | None = 0, first: int = 0, a_tally=None, levels=None, **kw) -> dict:
    g = {"index": index, "replay": _replay(winner, first, **kw), "turns": 7, "tallies": [a_tally or _tally(), _tally()]}
    if levels:
        g["levels"] = levels
    return g


def _post(c, batch: str, games: list[dict], levels: str = "hard/hard", headers=SERVICE):
    return c.post("/analyst/bot-games", json={"batch_id": batch, "levels": levels, "games": games}, headers=headers)


def _sim(c, **params):
    r = c.get("/analyst/stats/sim", params=params, headers=SERVICE)
    assert r.status_code == 200, r.text
    return r.json()


def test_sending_a_batch_twice_stores_each_game_once_and_needs_the_service_secret_635(analyst):  # noqa: F811
    """A batch is idempotent per (batch id, index), and only the analyst service secret opens the endpoint (#635)."""
    c, SessionLocal = analyst
    games = [_game(0), _game(1, winner=1)]
    assert _post(c, "night-1", games, headers={}).status_code == 403
    assert _post(c, "night-1", games, headers={"X-Analyst-Service": "nope"}).status_code == 403
    assert _post(c, "night-1", games).json() == {"accepted": 2, "duplicates": 0, "rejected": []}
    again = _post(c, "night-1", games + [_game(2)]).json()
    assert (again["accepted"], again["duplicates"]) == (1, 2)
    db = SessionLocal()
    try:
        rows = db.query(BotMatch).order_by(BotMatch.batch_index).all()
        assert [(r.batch_id, r.batch_index, r.winner, r.levels, r.leader_a, r.leader_b) for r in rows] == [
            ("night-1", i, w, "hard/hard", ZORO, LUCCI) for i, w in ((0, 0), (1, 1), (2, 0))
        ]
        assert all(r.game_id.startswith("b_") for r in rows)
    finally:
        db.close()


def test_bad_and_oversized_replays_are_rejected_without_blocking_the_rest_of_the_batch_635(analyst, monkeypatch):  # noqa: F811
    """A replay without two decks, or over the size cap, is reported and skipped; good games in the batch still land (#635)."""
    c, _ = analyst
    monkeypatch.setattr(analyst_bots, "MAX_REPLAY_BYTES", 600)
    big = _game(1)
    big["replay"]["intents"] = [{"seat": 0, "intent": {"type": "end_turn"}}] * 50
    bad = _game(2)
    bad["replay"]["players"][0]["deck"] = ["not-a-card"]
    out = _post(c, "b", [_game(0), big, bad]).json()
    assert out["accepted"] == 1
    assert {(r["index"], r["reason"]) for r in out["rejected"]} == {(1, "replay too large"), (2, "replay has a bad deck")}


def test_bot_games_never_reach_real_duel_tables_or_matchup_stats_635(analyst):  # noqa: F811
    """Ingesting bot games leaves duel_matches, duel_match_seats and /analyst/stats/matchups empty (#635)."""
    c, SessionLocal = analyst
    assert _post(c, "b", [_game(i) for i in range(6)]).json()["accepted"] == 6
    db = SessionLocal()
    try:
        assert db.query(DuelMatch).count() == 0 and db.query(DuelMatchSeat).count() == 0
    finally:
        db.close()
    real = c.get("/analyst/stats/matchups", params={"leader": ZORO}, headers=SERVICE).json()
    assert real["overall"]["games"] == 0 and real["opponents"] == []
    assert c.get("/analyst/stats/matchups", headers=SERVICE).json()["total_games"] == 0
    assert _sim(c, leader=ZORO, opponent=LUCCI)["games"] == 6


def test_sim_matchup_rate_counts_wins_by_side_with_interval_and_split_635(analyst):  # noqa: F811
    """Zoro wins 7 of 12 vs Lucci (5 of 6 going first, 2 of 6 going second) with the Wilson interval; Lucci sees the mirror image (#635)."""
    c, _ = analyst
    zoro_first = [_game(i, 0 if i < 5 else 1, first=0) for i in range(6)]
    zoro_second = [_game(6 + i, 0 if i < 2 else 1, first=1) for i in range(6)]
    _post(c, "b", zoro_first + zoro_second)
    s = _sim(c, leader=ZORO, opponent=LUCCI)
    assert (s["games"], s["wins"], s["win_rate"], s["too_few_games"]) == (12, 7, 0.583, False)
    assert s["interval"] == list(analyst_stats.wilson(7, 12))
    assert (s["going_first"]["games"], s["going_first"]["wins"]) == (6, 5)
    assert (s["going_second"]["games"], s["going_second"]["wins"]) == (6, 2)
    assert s["source"] == "bot self-play on optcgduel.app's engine"
    other = _sim(c, leader=LUCCI, opponent=ZORO)
    assert (other["games"], other["wins"], other["going_first"]["wins"]) == (12, 5, 4)
    assert c.get("/analyst/stats/sim", params={"opponent": LUCCI}, headers=SERVICE).status_code == 400
    # Under the minimum only the count shows, so one game's result never does.
    c.post("/analyst/bot-games", json={"batch_id": "x", "levels": "hard/hard", "games": [_game(0, 1, leaders=("OP09-001", LUCCI))]}, headers=SERVICE)
    few = _sim(c, leader="OP09-001", opponent=LUCCI)
    assert (few["games"], few["wins"], few["win_rate"], few["too_few_games"]) == (1, None, None, True)


def test_sim_stats_default_to_same_level_games_and_unfinished_games_do_not_count_635(analyst):  # noqa: F811
    """Hard-vs-hard is the default pool; hard/normal games and games without a winner stay out of the rate (#635)."""
    c, _ = analyst
    _post(c, "hh", [_game(i, 0) for i in range(5)] + [_game(9, None)])
    _post(c, "hn", [_game(i, 1) for i in range(5)], levels="hard/normal")
    s = _sim(c, leader=ZORO, opponent=LUCCI)
    assert (s["games"], s["wins"]) == (5, 5)
    mixed = _sim(c, leader=ZORO, opponent=LUCCI, levels="hard/normal")
    assert (mixed["games"], mixed["wins"]) == (5, 0)
    assert _sim(c)["total_games"] == 5


def test_line_stats_compare_win_rate_with_and_without_a_line_635(analyst):  # noqa: F811
    """Side A wins 5 of 5 games where it accepted OP08-058 and 1 of 5 where it didn't, with the games behind each (#635)."""
    c, _ = analyst
    ramp = _tally(optionalAccepts={"OP08-058": 2}, leaderActivations=1, counterEvents={"OP01-026": 1})
    games = [_game(i, 0, a_tally=ramp) for i in range(5)] + [_game(5 + i, 0 if i == 0 else 1) for i in range(5)]
    # A line seen in one game only is not reported.
    games[0]["tallies"][0] = {**ramp, "mainEvents": {"OP09-009": 1}}
    _post(c, "b", games)
    s = _sim(c, leader=ZORO, opponent=LUCCI)
    lines = {r["line"]: r for r in s["lines"]}
    accepted = lines["optional_accepted:OP08-058"]
    assert (accepted["with"]["games"], accepted["with"]["wins"]) == (5, 5)
    assert (accepted["without"]["games"], accepted["without"]["wins"]) == (5, 1)
    assert accepted["with"]["interval"] == list(analyst_stats.wilson(5, 5))
    assert {"leader_activation", "counter_event", "counter_event:OP01-026"} <= set(lines)
    assert "main_event:OP09-009" not in lines
    # The leader overview carries the same lines.
    assert "optional_accepted:OP08-058" in {r["line"] for r in _sim(c, leader=ZORO)["lines"]}


def test_line_stats_use_the_seat_that_played_the_line_635(analyst):  # noqa: F811
    """A line tallied for side B counts for side B's leader, not side A's (#635)."""
    c, _ = analyst
    ramp = _tally(cheatOuts={"OP01-016 via OP02-004": 1})
    games = []
    for i in range(10):
        g = _game(i, 1 if i < 5 else 0)
        g["tallies"] = [_tally(), ramp if i < 5 else _tally()]
        games.append(g)
    _post(c, "b", games)
    lucci = {r["line"]: r for r in _sim(c, leader=LUCCI, opponent=ZORO)["lines"]}
    assert lucci["cheat_out"]["with"]["wins"] == 5 and lucci["cheat_out"]["without"]["wins"] == 0
    assert "cheat_out" not in {r["line"] for r in _sim(c, leader=ZORO, opponent=LUCCI)["lines"]}


def test_bot_game_search_labels_ids_and_filters_like_the_player_corpus_635(analyst):  # noqa: F811
    """Search finds bot games by leader, opponent, card and result, with b_ ids; replays open by id (#635)."""
    c, _ = analyst
    _post(c, "b", [_game(0, 0), _game(1, 1), _game(2, 0, leaders=(LUCCI, ZORO), deck0=[VIVI] * 4, deck1=[NAMI] * 4)])
    r = c.get("/analyst/bot-games", params={"leader": ZORO}, headers=SERVICE).json()
    assert r["total"] == 3 and all(g["game_id"].startswith("b_") and g["A"]["leader"] == ZORO for g in r["games"])
    assert r["games"][0]["source"] == "bot self-play on optcgduel.app's engine"
    won = c.get("/analyst/bot-games", params={"leader": ZORO, "result": "won"}, headers=SERVICE).json()
    assert won["total"] == 1
    assert c.get("/analyst/bot-games", params={"leader": ZORO, "result": "lost"}, headers=SERVICE).json()["total"] == 2
    lost = c.get("/analyst/bot-games", params={"leader": LUCCI, "opponent": ZORO, "result": "won"}, headers=SERVICE).json()
    assert lost["total"] == 2
    assert c.get("/analyst/bot-games", params={"leader": ZORO, "card": NAMI}, headers=SERVICE).json()["total"] == 3
    assert c.get("/analyst/bot-games", params={"leader": ZORO, "card": VIVI}, headers=SERVICE).json()["total"] == 0
    assert c.get("/analyst/bot-games", params={"result": "won"}, headers=SERVICE).status_code == 400
    gid = won["games"][0]["game_id"]
    rep = c.get(f"/analyst/bot-games/{gid}/replay", headers=SERVICE)
    assert rep.status_code == 200 and rep.json()["replay"]["players"][0]["leaderId"] in (ZORO, LUCCI)
    assert rep.json()["sides"] == {"A": 0, "B": 1}
    assert c.get("/analyst/bot-games/b_nope/replay", headers=SERVICE).status_code == 404
    assert c.get(f"/analyst/bot-games/{gid}/replay").status_code == 403


def test_a_tally_becomes_the_named_lines_the_analyst_script_counts_too_635():
    """The same tally gives the same lines here and in analyst/src/botGames.ts linesOf, with a line for any Counter Event and any cheat-out (#635)."""
    tally = _tally(
        leaderActivations=1,
        activationsByCard={"OP01-001": 2, "OP01-002": 0},
        optionalAccepts={"OP08-058": 1},
        optionalDeclines={"OP08-059": 3},
        counterEvents={"OP01-026": 1},
        cheatOuts={"OP01-016 via OP02-004": 1},
        mainEvents={"OP03-040": 2},
    )
    assert sorted(analyst_bots.lines_of(tally)) == sorted(
        ["activation:OP01-001", "cheat_out", "cheat_out:OP01-016 via OP02-004", "counter_event", "counter_event:OP01-026", "leader_activation", "main_event:OP03-040", "optional_accepted:OP08-058", "optional_declined:OP08-059"]
    )
    assert analyst_bots.lines_of({}) == set()


def test_a_batch_of_several_large_replays_fits_the_request_limit_635(analyst):  # noqa: F811
    """Three replays of about 700 KB each (over 2 MB together) are accepted in one request (#635)."""
    c, _ = analyst
    games = []
    for i in range(3):
        g = _game(i)
        g["replay"]["intents"] = [{"seat": 0, "intent": {"type": "end_turn"}}] * 17_000
        games.append(g)
    r = _post(c, "big", games)
    assert r.status_code == 200, r.text[:200]
    assert r.json()["accepted"] == 3


# ——— shared bot lessons (#915) ———


def _admin(SessionLocal, name: str = "boss", role: str = "admin") -> int:
    from app.core.models import User

    with SessionLocal() as db:
        u = User(email=f"{name}@x.test", name=name, google_sub=f"sub-{name}", username=name, role=role)
        db.add(u)
        db.commit()
        return u.id


def _lesson(**kw) -> dict:
    return {"text": "With Zoro, games where Nami's effect was used were won more often.", "leader_id": ZORO, "cards": [NAMI], "evidence": "bot 60% vs 40%, real 55% vs 35%", **kw}


def _post_lesson(c, headers=SERVICE, **kw):
    return c.post("/analyst/bot-lessons", json=_lesson(**kw), headers=headers)


def test_bot_lessons_need_the_service_secret_and_an_admin_to_own_them_915(analyst):  # noqa: F811
    """Only the service secret can post a bot lesson, and with no admin account it is refused rather than lost (#915)."""
    c, SessionLocal = analyst
    assert _post_lesson(c, headers={}).status_code == 403
    assert _post_lesson(c, headers={"X-Analyst-Service": "nope"}).status_code == 403
    _admin(SessionLocal, "plain", role="user")
    assert _post_lesson(c).status_code == 503
    boss = _admin(SessionLocal)
    r = _post_lesson(c)
    assert r.status_code == 200 and r.json()["skipped"] is False
    from app.analyst.models import AnalystLesson

    with SessionLocal() as db:
        row = db.query(AnalystLesson).one()
        assert (row.user_id, row.status, row.source, row.cards) == (boss, "draft", "bots", NAMI)


def test_a_bot_lesson_already_stored_in_any_status_is_skipped_915(analyst):  # noqa: F811
    """Rerunning the weekly job adds nothing, and a lesson the admin rejected stays rejected (#915)."""
    c, SessionLocal = analyst
    _admin(SessionLocal)
    from app.analyst.models import AnalystLesson

    assert _post_lesson(c).json()["skipped"] is False
    with SessionLocal() as db:
        db.query(AnalystLesson).one().status = "rejected"
        db.commit()
    assert _post_lesson(c).json() == {"skipped": True}
    # a different opponent, or a different text, is a new lesson
    assert _post_lesson(c, opponent_id=LUCCI).json()["skipped"] is False
    assert _post_lesson(c, opponent_id=LUCCI).json() == {"skipped": True}
    assert _post_lesson(c, text="With Zoro, games with a counter event were won less often.").json()["skipped"] is False
    with SessionLocal() as db:
        assert db.query(AnalystLesson).count() == 3


def test_bot_lesson_drafts_stop_at_the_review_limit_915(analyst, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    """The admin's review queue can't grow past MAX_DRAFT_LESSONS from bot lessons either (#915)."""
    from app.analyst import access as analyst_access

    monkeypatch.setattr(analyst_access, "MAX_DRAFT_LESSONS", 2)
    c, SessionLocal = analyst
    _admin(SessionLocal)
    codes = [_post_lesson(c, text=f"Bot lesson number {n} about Zoro.").status_code for n in range(3)]
    assert codes == [200, 200, 409]


def test_sim_stats_carry_only_approved_bot_lessons_for_that_leader_to_every_player_915(analyst):  # noqa: F811
    """Approved bot lessons ride along with the sim stats; drafts, player lessons and other leaders' lessons stay out (#915)."""
    c, SessionLocal = analyst
    boss = _admin(SessionLocal)
    from app.analyst.models import AnalystLesson

    _post_lesson(c)  # Zoro, any opponent
    _post_lesson(c, text="With Zoro against Lucci, holding a counter paid off.", opponent_id=LUCCI)
    _post_lesson(c, text="With Zoro against Vivi, going first mattered most.", opponent_id=VIVI)
    _post_lesson(c, text="With Nami, using her effect on turn two was strongest.", leader_id=NAMI)
    _post_lesson(c, text="Still a draft lesson about Zoro and the bots.")
    with SessionLocal() as db:
        for row in db.query(AnalystLesson).all():
            if "draft lesson" not in row.text:
                row.status = "approved"
        db.add(AnalystLesson(user_id=boss, status="approved", source="player", text="A player lesson about Zoro.", leader_id=ZORO, cards=""))
        db.commit()
    texts = lambda out: sorted(l["text"] for l in out["lessons"])
    overview = _sim(c, leader=ZORO)
    assert texts(overview) == sorted([
        "With Zoro, games where Nami's effect was used were won more often.",
        "With Zoro against Lucci, holding a counter paid off.",
        "With Zoro against Vivi, going first mattered most.",
    ])
    assert {"text", "leader_id", "opponent_id", "cards"} <= set(overview["lessons"][0])
    matchup = _sim(c, leader=ZORO, opponent=LUCCI)
    assert texts(matchup) == sorted([
        "With Zoro, games where Nami's effect was used were won more often.",
        "With Zoro against Lucci, holding a counter paid off.",
    ])
    # a lesson names the leader on either side, like the player lesson list does
    assert texts(_sim(c, leader=LUCCI)) == ["With Zoro against Lucci, holding a counter paid off."]
    assert "lessons" not in _sim(c)


def test_lesson_out_names_its_source_and_a_bot_lesson_has_no_match_ids_915(analyst):  # noqa: F811
    """The review list tells bot lessons from player ones by source, and bot evidence never shows up as match ids (#915)."""
    c, SessionLocal = analyst
    me = c.post("/auth/dev-login").json()
    from app.core.models import User

    with SessionLocal() as db:
        db.get(User, me["id"]).role = "admin"
        db.commit()
    assert _post_lesson(c).status_code == 200
    token = c.post("/analyst/token").json()["token"]
    c.post("/analyst/lessons", json={"text": "Hold a counter for turn four.", "leader_id": ZORO}, headers={"X-Analyst-Token": token})
    got = c.get("/analyst/lessons/review").json()["lessons"]
    assert sorted((l["source"], l["match_ids"]) for l in got) == [("bots", []), ("player", [])]


def _admin_with_link(c, SessionLocal) -> dict:
    me = c.post("/auth/dev-login").json()
    from app.core.models import User

    with SessionLocal() as db:
        db.get(User, me["id"]).role = "admin"
        db.commit()
    return {"X-Analyst-Token": c.post("/analyst/token").json()["token"]}


def test_my_lessons_for_claude_leave_out_approved_bot_lessons_916(analyst):  # noqa: F811
    """Bot lessons are owned by the admin but are not the admin's own player lessons: Log Pose's my_lessons never lists them (#916)."""
    c, SessionLocal = analyst
    link = _admin_with_link(c, SessionLocal)
    assert _post_lesson(c).status_code == 200
    mine = c.post("/analyst/lessons", json={"text": "Hold a counter for turn four.", "leader_id": ZORO}, headers=link).json()
    for lesson in c.get("/analyst/lessons/review").json()["lessons"]:
        assert c.patch(f"/analyst/lessons/review/{lesson['id']}", json={"status": "approved"}).status_code == 200
    got = c.get("/analyst/lessons", headers=link).json()["lessons"]
    assert [l["id"] for l in got] == [mine["id"]]
    # the admin's own review list still shows both
    assert sorted(l["source"] for l in c.get("/analyst/lessons/review").json()["lessons"]) == ["bots", "player"]


def test_a_bot_lesson_the_admin_edited_is_still_skipped_when_posted_again_916(analyst):  # noqa: F811
    """Next week's job re-posts the original wording; the admin's edited copy (in any status) keeps it from coming back as a new draft (#916)."""
    c, SessionLocal = analyst
    _admin_with_link(c, SessionLocal)
    assert _post_lesson(c).json()["skipped"] is False
    row = c.get("/analyst/lessons/review").json()["lessons"][0]
    edited = {"status": "approved", "text": "With Zoro, using Nami's effect won more often (admin wording)."}
    assert c.patch(f"/analyst/lessons/review/{row['id']}", json=edited).status_code == 200
    assert _post_lesson(c).json() == {"skipped": True}
    # editing again, and the edited wording itself being posted, are skipped too
    assert c.patch(f"/analyst/lessons/review/{row['id']}", json={"text": "Second rewrite."}).status_code == 200
    assert _post_lesson(c).json() == {"skipped": True}
    assert _post_lesson(c, text="Second rewrite.").json() == {"skipped": True}
    assert len(c.get("/analyst/lessons/review").json()["lessons"]) == 1
