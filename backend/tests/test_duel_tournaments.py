"""Friends tournaments: bracket maths, standings, room claims and result ingest (#997)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import duel_tournaments as logic
from app.auth import SESSION_COOKIE, create_session_token
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import DuelPresence, DuelTournamentMatch, User
from tests.db_support import make_test_engine
from tests.friend_support import befriend, request_only

INGEST = {"X-Duel-Ingest-Token": "test-ingest"}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DUEL_INGEST_SECRET", "test-ingest")
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    get_settings.cache_clear()
    engine = make_test_engine()
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as c:
        yield c, SessionLocal
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _user(S, name: str, username: str | None = "") -> int:
    with S() as db:
        u = User(
            email=f"{name}@x.test",
            name=name,
            google_sub=f"sub-{name}",
            username=name if username == "" else username,
        )
        db.add(u)
        db.commit()
        return u.id


def _as(c: TestClient, uid: int) -> TestClient:
    c.cookies.set(SESSION_COOKIE, create_session_token(uid, 0))
    return c


def _create(c, uid, **over):
    body = {"name": "Friday Night", "format": "single_elim", "size": 4, "timer": "seat_15m", **over}
    return _as(c, uid).post("/tournaments", json=body)


def _setup(c, S, n, prefix="p", **over):
    """A started tournament with n players (users p0 organizes). Returns (code, ids, tournament json)."""
    ids = [_user(S, f"{prefix}{i}") for i in range(n)]
    r = _create(c, ids[0], **over)
    assert r.status_code == 201, r.text
    code = r.json()["code"]
    for uid in ids[1:]:
        assert _as(c, uid).post(f"/tournaments/{code}/join").status_code == 200
    r = _as(c, ids[0]).post(f"/tournaments/{code}/start")
    assert r.status_code == 200, r.text
    return code, ids, r.json()


def _get(c, uid, code):
    r = _as(c, uid).get(f"/tournaments/{code}")
    assert r.status_code == 200, r.text
    return r.json()


def _ready(t):
    return [m for m in t["matches"] if m["status"] == "ready"]


def _ingest(c, match_id, seat0, seat1, winner_seat):
    r = c.post(
        "/duel/matches",
        json={
            "match_id": match_id,
            "seat0_user_id": seat0,
            "seat1_user_id": seat1,
            "winner_seat": winner_seat,
            "reason": "life",
            "ranked": False,
        },
        headers=INGEST,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _open_room(c, code, m, room_id=None):
    """Player a claims the match, then reports the room they opened."""
    a = m["a"]["user_id"]
    room_id = room_id or f"room-{m['id']}"
    assert _as(c, a).post(f"/tournaments/{code}/matches/{m['id']}/play", json={}).json()["action"] == "host"
    r = c.post(f"/tournaments/{code}/matches/{m['id']}/play", json={"room_id": room_id})
    assert r.status_code == 200, r.text
    return room_id


def _play_out(c, code, m, winner_side):
    """Play a match through the room and ingest its result; winner_side 0 = player a."""
    room = _open_room(c, code, m)
    _ingest(c, room, m["a"]["user_id"], m["b"]["user_id"], winner_side)
    return m["a"]["user_id"] if winner_side == 0 else m["b"]["user_id"]


# --- pure logic ---------------------------------------------------------------


def test_bracket_order_pairs_top_seeds_with_the_bottom_ones_997():
    assert logic.bracket_order(4) == [1, 4, 2, 3]
    assert logic.bracket_order(8) == [1, 8, 4, 5, 2, 7, 3, 6]
    assert logic.bracket_order(16) == [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]


def test_missing_seeds_become_byes_for_the_top_seeds_997():
    pairs = logic.first_round(8, [11, 12, 13, 14, 15, 16])
    assert pairs == [(11, None), (14, 15), (12, None), (13, 16)]


def test_round_robin_schedule_has_every_pair_once_and_nobody_twice_in_a_round_997():
    rounds = logic.round_robin_schedule([1, 2, 3, 4, 5])
    assert len(rounds) == 5
    flat = [frozenset(p) for r in rounds for p in r]
    assert len(flat) == 10 and len(set(flat)) == 10
    for r in rounds:
        seated = [x for p in r for x in p]
        assert len(seated) == len(set(seated)) == 4


def _m(a, b, winner):
    return SimpleNamespace(player_a_id=a, player_b_id=b, winner_id=winner, status="done")


def test_standings_break_a_tie_on_wins_by_head_to_head_997():
    # 1 beats everyone; 2, 3 and 4 each win once and beat each other in a cycle, so they stay level.
    matches = [_m(1, 2, 1), _m(1, 3, 1), _m(1, 4, 1), _m(2, 3, 3), _m(2, 4, 2), _m(3, 4, 4)]
    rows = logic.standings([1, 2, 3, 4], matches)
    by = {r.user_id: r for r in rows}
    assert by[1].rank == 1 and by[1].wins == 3
    assert [by[2].wins, by[3].wins, by[4].wins] == [1, 1, 1]
    assert {by[2].rank, by[3].rank, by[4].rank} == {2}
    matches = [_m(1, 2, 1), _m(1, 3, 3), _m(2, 3, 3), _m(1, 4, 1), _m(2, 4, 2), _m(3, 4, 4)]
    # wins: 1:2, 2:1, 3:2, 4:1. 1 and 3 tie on 2; 3 beat 1 -> 3 first. 2 and 4 tie on 1; 2 beat 4 -> 2 first.
    rows = logic.standings([1, 2, 3, 4], matches)
    assert [(r.user_id, r.rank) for r in rows] == [(3, 1), (1, 2), (2, 3), (4, 4)]


def test_standings_share_a_rank_when_wins_and_head_to_head_are_equal_997():
    rows = logic.standings([1, 2, 3], [_m(1, 2, 1), _m(2, 3, 2), _m(1, 3, 3)])
    assert [r.rank for r in rows] == [1, 1, 1]
    assert logic.round_robin_winner(rows) is None


def test_a_round_robin_has_no_winner_until_everyone_has_played_everyone_997():
    rows = logic.standings([1, 2, 3], [_m(1, 2, 1)])
    assert rows[0].user_id == 1 and rows[0].rank == 1
    assert logic.round_robin_winner(rows) is None


def test_standings_order_players_by_wins_then_seed_997():
    rows = logic.standings([5, 6, 7], [_m(5, 6, 6), _m(5, 7, 7), _m(6, 7, 6)])
    assert [(r.user_id, r.wins, r.losses, r.rank) for r in rows] == [(6, 2, 0, 1), (7, 1, 1, 2), (5, 0, 2, 3)]
    assert logic.round_robin_winner(rows) == 6


# --- create / join / invite / start ------------------------------------------


def test_create_validates_size_per_format_and_names_997(client):
    c, S = client
    me = _user(S, "org")
    assert _create(c, me, size=6).status_code == 400
    assert _create(c, me, format="round_robin", size=9).status_code == 400
    assert _create(c, me, format="round_robin", size=2).status_code == 400
    assert _create(c, me, name="   ").status_code == 422
    r = _create(c, me, name="  Cup  ", format="round_robin", size=5)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Cup"
    assert [p["user_id"] for p in body["players"]] == [me]
    assert body["me"]["role"] == "organizer" and body["me"]["can_start"] is False


def test_a_player_without_a_username_cannot_use_tournaments_997(client):
    c, S = client
    uid = _user(S, "nameless", username=None)
    r = _as(c, uid).get("/tournaments")
    assert r.status_code == 403
    assert r.json()["detail"] == "Pick a username first."


def test_an_organizer_can_have_five_active_tournaments_at_most_997(client):
    c, S = client
    me = _user(S, "org")
    for _ in range(5):
        assert _create(c, me).status_code == 201
    r = _create(c, me)
    assert r.status_code == 400
    # Cancelling one frees a slot.
    code = _as(c, me).get("/tournaments").json()["tournaments"][0]["code"]
    assert c.post(f"/tournaments/{code}/cancel").status_code == 200
    assert _create(c, me).status_code == 201


def test_joining_a_full_tournament_is_refused_and_rejoining_is_idempotent_997(client):
    c, S = client
    ids = [_user(S, f"p{i}") for i in range(5)]
    code = _create(c, ids[0]).json()["code"]
    for uid in ids[1:4]:
        assert _as(c, uid).post(f"/tournaments/{code}/join").status_code == 200
    r = _as(c, ids[4]).post(f"/tournaments/{code}/join")
    assert r.status_code == 400 and r.json()["detail"] == "This tournament is full."
    assert _get(c, ids[4], code)["me"]["can_join"] is False
    again = _as(c, ids[1]).post(f"/tournaments/{code}/join")
    assert again.status_code == 200
    assert len([p for p in again.json()["players"] if p["status"] == "joined"]) == 4


def test_you_can_only_invite_friends_and_only_the_organizer_invites_997(client):
    c, S = client
    org, friend, stranger = _user(S, "org"), _user(S, "friend"), _user(S, "stranger")
    befriend(S, org, friend)
    code = _create(c, org).json()["code"]
    r = _as(c, org).post(f"/tournaments/{code}/invite", json={"user_id": stranger})
    assert r.status_code == 403 and r.json()["detail"] == "You can only invite friends."
    pending = _user(S, "pending")
    request_only(S, org, pending)
    assert _as(c, org).post(f"/tournaments/{code}/invite", json={"user_id": pending}).status_code == 403
    # A joined player who is friends with someone still cannot invite them.
    buddy = _user(S, "buddy")
    _as(c, buddy).post(f"/tournaments/{code}/join")
    befriend(S, buddy, stranger)
    assert _as(c, buddy).post(f"/tournaments/{code}/invite", json={"user_id": stranger}).status_code == 403
    r = _as(c, org).post(f"/tournaments/{code}/invite", json={"user_id": friend})
    assert r.status_code == 200
    assert [(p["user_id"], p["status"]) for p in r.json()["players"] if p["user_id"] == friend] == [(friend, "invited")]
    # The invite shows up in the friend's list and joining turns it into a seat.
    mine = _as(c, friend).get("/tournaments").json()["tournaments"]
    assert [(t["code"], t["my_role"], t["players_joined"]) for t in mine] == [(code, "invited", 2)]
    joined = _as(c, friend).post(f"/tournaments/{code}/join").json()
    assert [p["status"] for p in joined["players"] if p["user_id"] == friend] == ["joined"]


def test_leaving_declines_an_invite_but_the_organizer_cannot_leave_997(client):
    c, S = client
    org, friend = _user(S, "org"), _user(S, "friend")
    befriend(S, org, friend)
    code = _create(c, org).json()["code"]
    _as(c, org).post(f"/tournaments/{code}/invite", json={"user_id": friend})
    out = _as(c, friend).post(f"/tournaments/{code}/leave").json()
    assert [p["user_id"] for p in out["players"]] == [org]
    assert _as(c, org).post(f"/tournaments/{code}/leave").status_code == 400


def test_the_organizer_removes_players_while_open_997(client):
    c, S = client
    org, other = _user(S, "org"), _user(S, "other")
    code = _create(c, org).json()["code"]
    _as(c, other).post(f"/tournaments/{code}/join")
    assert _as(c, other).delete(f"/tournaments/{code}/players/{other}").status_code == 403
    assert _as(c, org).delete(f"/tournaments/{code}/players/{org}").status_code == 400
    out = c.delete(f"/tournaments/{code}/players/{other}").json()
    assert [p["user_id"] for p in out["players"]] == [org]


def test_start_needs_enough_players_and_the_organizer_997(client):
    c, S = client
    ids = [_user(S, f"p{i}") for i in range(4)]
    code = _create(c, ids[0], size=8).json()["code"]  # an 8 bracket needs 5
    for uid in ids[1:]:
        _as(c, uid).post(f"/tournaments/{code}/join")
    assert _as(c, ids[1]).post(f"/tournaments/{code}/start").status_code == 403
    r = _as(c, ids[0]).post(f"/tournaments/{code}/start")
    assert r.status_code == 400 and r.json()["detail"] == "Need at least 5 players."
    assert _get(c, ids[0], code)["me"]["can_start"] is False
    extra = _user(S, "p4")
    _as(c, extra).post(f"/tournaments/{code}/join")
    assert _get(c, ids[0], code)["me"]["can_start"] is True
    assert _as(c, ids[0]).post(f"/tournaments/{code}/start").status_code == 200
    # Once running, nobody joins or starts again.
    late = _user(S, "late")
    assert _as(c, late).post(f"/tournaments/{code}/join").status_code == 400
    assert _as(c, ids[0]).post(f"/tournaments/{code}/start").status_code == 400


def test_starting_drops_invites_nobody_accepted_997(client):
    c, S = client
    ids = [_user(S, f"p{i}") for i in range(4)]
    befriend(S, ids[0], ids[3])
    code = _create(c, ids[0]).json()["code"]
    for uid in ids[1:3]:
        _as(c, uid).post(f"/tournaments/{code}/join")
    _as(c, ids[0]).post(f"/tournaments/{code}/invite", json={"user_id": ids[3]})
    t = _as(c, ids[0]).post(f"/tournaments/{code}/start").json()
    assert sorted(p["user_id"] for p in t["players"]) == sorted(ids[:3])
    assert all(p["status"] == "joined" and p["seed"] for p in t["players"])


def test_round_robin_needs_three_players_997(client):
    c, S = client
    a, b = _user(S, "a"), _user(S, "b")
    code = _create(c, a, format="round_robin", size=6).json()["code"]
    _as(c, b).post(f"/tournaments/{code}/join")
    r = _as(c, a).post(f"/tournaments/{code}/start")
    assert r.status_code == 400 and r.json()["detail"] == "Need at least 3 players."


def test_unknown_code_is_404_and_get_hides_rooms_997(client):
    c, S = client
    me = _user(S, "me")
    assert _as(c, me).get("/tournaments/nope").status_code == 404
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    _open_room(c, code, m, room_id="secret-room-id")
    text = _as(c, ids[0]).get(f"/tournaments/{code}").text
    assert "secret-room-id" not in text
    assert _get(c, ids[0], code)["matches"][m["id"] - 1]["room_open"] is True


# --- bracket flow ---------------------------------------------------------------


def test_six_players_in_an_eight_bracket_give_the_top_two_seeds_byes_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 6, size=8)
    seed = {p["user_id"]: p["seed"] for p in t["players"]}
    assert sorted(seed.values()) == [1, 2, 3, 4, 5, 6]
    r1 = [m for m in t["matches"] if m["round"] == 1]
    byes = [m for m in r1 if m["decided_by"] == "bye"]
    assert len(byes) == 2
    assert sorted(seed[m["winner_id"]] for m in byes) == [1, 2]
    assert all(m["status"] == "done" for m in byes)
    assert len([m for m in r1 if m["status"] == "ready"]) == 2
    # Seed 1 sits in slot 0 -> semifinal slot 0, seat a; seed 2 in slot 2 -> semifinal slot 1, seat a.
    r2 = {m["slot"]: m for m in t["matches"] if m["round"] == 2}
    assert seed[r2[0]["a"]["user_id"]] == 1 and r2[0]["b"] is None and r2[0]["status"] == "waiting"
    assert seed[r2[1]["a"]["user_id"]] == 2 and r2[1]["b"] is None and r2[1]["status"] == "waiting"
    assert t["rounds"] == 3 and t["standings"] == []


def test_a_result_for_the_matchs_room_advances_the_bracket_to_a_champion_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    first = _ready(t)
    assert len(first) == 2
    winners = [_play_out(c, code, m, 0) for m in first]  # only seed 1 has no bye here: 4 players, no byes
    t = _get(c, ids[0], code)
    final = [m for m in t["matches"] if m["round"] == 2][0]
    assert final["status"] == "ready"
    assert {final["a"]["user_id"], final["b"]["user_id"]} == set(winners)
    assert t["status"] == "running"
    done = [m for m in t["matches"] if m["round"] == 1]
    assert all(m["decided_by"] == "game" and m["result_match_id"] == f"room-{m['id']}" for m in done)
    champion = _play_out(c, code, final, 1)
    t = _get(c, ids[0], code)
    assert t["status"] == "finished" and t["winner"]["user_id"] == champion
    assert t["finished_at"] is not None
    # A finished tournament stays in the list for the players.
    assert [x["status"] for x in _as(c, ids[1]).get("/tournaments").json()["tournaments"]] == ["finished"]


def test_the_winner_seat_picks_which_player_advances_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    room = _open_room(c, code, m)
    _ingest(c, room, m["a"]["user_id"], m["b"]["user_id"], 1)
    got = [x for x in _get(c, ids[0], code)["matches"] if x["id"] == m["id"]][0]
    assert got["winner_id"] == m["b"]["user_id"]


def test_a_result_from_other_players_or_a_rematch_id_is_ignored_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    outsider = next(i for i in ids if i not in (a, b))
    room = _open_room(c, code, m)
    # Same room id but a different pair of players.
    _ingest(c, room, a, outsider, 0)
    assert _get(c, ids[0], code)["matches"][m["id"] - 1]["status"] == "ready"
    # A rematch in the same room is not the tournament game.
    _ingest(c, f"{room}-r1", a, b, 0)
    assert _get(c, ids[0], code)["matches"][m["id"] - 1]["status"] == "ready"


def test_a_result_ingest_still_succeeds_when_recording_it_fails_997(client, monkeypatch):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    room = _open_room(c, code, m)

    def boom(*_a, **_k):
        raise RuntimeError("db down")

    monkeypatch.setattr(logic, "record_game", boom)
    body = _ingest(c, room, m["a"]["user_id"], m["b"]["user_id"], 0)
    assert body["created"] is True


def test_the_organizer_can_award_a_walkover_but_nobody_else_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    url = f"/tournaments/{code}/matches/{m['id']}/award"
    not_org = a if a != ids[0] else b
    assert _as(c, not_org).post(url, json={"winner_id": a}).status_code == 403
    outsider = next(i for i in ids if i not in (a, b))
    assert _as(c, ids[0]).post(url, json={"winner_id": outsider}).status_code == 400
    r = _as(c, ids[0]).post(url, json={"winner_id": b})
    assert r.status_code == 200
    got = [x for x in r.json()["matches"] if x["id"] == m["id"]][0]
    assert (got["winner_id"], got["status"], got["decided_by"]) == (b, "done", "walkover")
    # Done matches cannot be awarded again.
    assert _as(c, ids[0]).post(url, json={"winner_id": a}).status_code == 409


def test_a_cancelled_tournament_ignores_finished_games_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    room = _open_room(c, code, m)
    _as(c, ids[0]).post(f"/tournaments/{code}/cancel")
    _ingest(c, room, m["a"]["user_id"], m["b"]["user_id"], 0)
    got = _get(c, ids[0], code)["matches"][m["id"] - 1]
    assert got["status"] == "ready" and got["winner_id"] is None


def test_cancelling_stops_play_and_a_finished_tournament_cannot_be_cancelled_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    assert _as(c, ids[1]).post(f"/tournaments/{code}/cancel").status_code == 403
    assert _as(c, ids[0]).post(f"/tournaments/{code}/cancel").json()["status"] == "cancelled"
    r = _as(c, m["a"]["user_id"]).post(f"/tournaments/{code}/matches/{m['id']}/play", json={})
    assert r.status_code == 409
    assert _as(c, ids[0]).get("/tournaments").json()["tournaments"] == []

    code2, ids2, t2 = _setup(c, S, 3, prefix="q", format="round_robin", size=3)
    for m in _ready(t2):
        _as(c, ids2[0]).post(f"/tournaments/{code2}/matches/{m['id']}/award", json={"winner_id": m["a"]["user_id"]})
    assert _as(c, ids2[0]).post(f"/tournaments/{code2}/cancel").status_code == 400


def test_round_robin_finishes_with_the_sole_leader_as_winner_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4, format="round_robin", size=4)
    assert len(t["matches"]) == 6 and t["rounds"] == 3
    champ = ids[2]
    for m in _ready(t):
        a, b = m["a"]["user_id"], m["b"]["user_id"]
        winner = champ if champ in (a, b) else a
        out = _as(c, ids[0]).post(f"/tournaments/{code}/matches/{m['id']}/award", json={"winner_id": winner}).json()
    assert out["status"] == "finished" and out["winner"]["user_id"] == champ
    top = out["standings"][0]
    assert (top["user_id"], top["wins"], top["losses"], top["played"], top["rank"]) == (champ, 3, 0, 3, 1)


def test_round_robin_with_a_shared_first_place_finishes_without_a_winner_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 3, format="round_robin", size=3)
    ms = {frozenset((m["a"]["user_id"], m["b"]["user_id"])): m for m in t["matches"]}
    x, y, z = ids  # x beats y, y beats z, z beats x
    for (w, l) in ((x, y), (y, z), (z, x)):
        m = ms[frozenset((w, l))]
        out = _as(c, ids[0]).post(f"/tournaments/{code}/matches/{m['id']}/award", json={"winner_id": w}).json()
    assert out["status"] == "finished" and out["winner"] is None
    assert out["rounds"] == 3
    assert [r["rank"] for r in out["standings"]] == [1, 1, 1]


def test_the_list_flags_a_ready_match_and_orders_running_before_open_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    open_code = _create(c, ids[0], name="Later").json()["code"]
    mine = _as(c, ids[1]).get("/tournaments").json()["tournaments"]
    assert [(x["code"], x["my_role"], x["my_match_ready"]) for x in mine] == [(code, "joined", True)]
    org = _as(c, ids[0]).get("/tournaments").json()["tournaments"]
    assert [(x["code"], x["status"], x["my_role"]) for x in org] == [
        (code, "running", "organizer"),
        (open_code, "open", "organizer"),
    ]
    # Once their match is over they stop being flagged.
    m = next(m for m in _ready(t) if ids[1] in (m["a"]["user_id"], m["b"]["user_id"]))
    _as(c, ids[0]).post(f"/tournaments/{code}/matches/{m['id']}/award", json={"winner_id": ids[1]})
    mine = _as(c, ids[1]).get("/tournaments").json()["tournaments"]
    assert mine[0]["my_match_ready"] is False


def test_old_finished_tournaments_drop_off_the_list_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    for m in _ready(t):
        _as(c, ids[0]).post(f"/tournaments/{code}/matches/{m['id']}/award", json={"winner_id": m["a"]["user_id"]})
    final = _ready(_get(c, ids[0], code))[0]
    _as(c, ids[0]).post(f"/tournaments/{code}/matches/{final['id']}/award", json={"winner_id": final["a"]["user_id"]})
    assert len(_as(c, ids[0]).get("/tournaments").json()["tournaments"]) == 1
    with S() as db:
        from app.models import DuelTournament

        row = db.query(DuelTournament).one()
        row.finished_at = datetime.now(timezone.utc) - timedelta(days=15)
        db.commit()
    assert _as(c, ids[0]).get("/tournaments").json()["tournaments"] == []


# --- play: who opens the room ---------------------------------------------------


def _play(c, code, m, uid, **body):
    return _as(c, uid).post(f"/tournaments/{code}/matches/{m['id']}/play", json=body)


def test_the_first_player_to_play_hosts_and_the_other_waits_for_the_room_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    assert _play(c, code, m, a).json() == {"action": "host", "room_id": None, "server_url": None}
    assert _play(c, code, m, b).json()["action"] == "wait"
    # The host asking again keeps hosting rather than waiting on themselves.
    assert _play(c, code, m, a).json()["action"] == "host"


def test_once_the_room_is_reported_the_other_player_joins_it_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    _play(c, code, m, a)
    r = _play(c, code, m, a, room_id="room-xyz", server_url="https://not-ours.example")
    assert r.json()["action"] == "hosted"
    joined = _play(c, code, m, b).json()
    assert joined["action"] == "join" and joined["room_id"] == "room-xyz"
    # A server address this API never handed out is dropped.
    assert joined["server_url"] is None
    # The host asking again opens a fresh room instead of joining their own.
    assert _play(c, code, m, a).json()["action"] == "host"


def test_only_the_host_can_report_a_room_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    assert _play(c, code, m, b, room_id="sneaky").status_code == 409
    _play(c, code, m, a)
    assert _play(c, code, m, b, room_id="sneaky").status_code == 409
    assert _play(c, code, m, a, room_id="real").status_code == 200


def _age(S, match_id, **ago):
    with S() as db:
        row = db.get(DuelTournamentMatch, match_id)
        now = datetime.now(timezone.utc)
        for field, secs in ago.items():
            setattr(row, field, now - timedelta(seconds=secs))
        db.commit()


def test_an_expired_host_lock_lets_the_other_player_take_over_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    _play(c, code, m, a)
    _age(S, m["id"], host_claimed_at=60)
    assert _play(c, code, m, b).json()["action"] == "host"
    # And the old host now waits on the new one.
    assert _play(c, code, m, a).json()["action"] == "wait"


def test_a_stale_room_with_no_host_in_it_is_replaced_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    _play(c, code, m, a)
    _play(c, code, m, a, room_id="dead-room")
    _age(S, m["id"], room_set_at=120, host_claimed_at=120)
    assert _play(c, code, m, b).json()["action"] == "host"
    # The dead room is gone: the first player now waits on the new host.
    assert _play(c, code, m, a).json()["action"] == "wait"


def test_an_old_room_stays_joinable_while_its_host_is_seated_in_it_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    a, b = m["a"]["user_id"], m["b"]["user_id"]
    _play(c, code, m, a)
    _play(c, code, m, a, room_id="live-room")
    _age(S, m["id"], room_set_at=120, host_claimed_at=120)
    with S() as db:
        db.add(
            DuelPresence(
                user_id=a,
                room_id="live-room",
                instance_id="gs-1",
                role="player",
                phase="waiting",
                server_url="https://gs.example",
                updated_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    r = _play(c, code, m, b).json()
    assert (r["action"], r["room_id"]) == ("join", "live-room")
    assert r["server_url"] == "https://gs.example"
    # Once that room has finished it no longer counts.
    with S() as db:
        db.get(DuelPresence, (a, "live-room")).phase = "finished"
        db.commit()
    assert _play(c, code, m, b).json()["action"] == "host"


def test_only_the_two_players_can_play_a_match_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    m = _ready(t)[0]
    outsider = next(i for i in ids if i not in (m["a"]["user_id"], m["b"]["user_id"]))
    assert _play(c, code, m, outsider).status_code == 403
    assert _play(c, code, m, outsider, room_id="x").status_code == 403
    stranger = _user(S, "stranger")
    assert _play(c, code, m, stranger).status_code == 403


def test_a_waiting_match_cannot_be_played_997(client):
    c, S = client
    code, ids, t = _setup(c, S, 4)
    _play_out(c, code, _ready(t)[0], 0)
    t = _get(c, ids[0], code)
    waiting = [m for m in t["matches"] if m["status"] == "waiting"][0]
    assert waiting["round"] == 2
    winner = waiting["a"]["user_id"] if waiting["a"] else waiting["b"]["user_id"]
    r = _play(c, code, waiting, winner)
    assert r.status_code == 409 and r.json()["detail"] == "This match is not ready."
