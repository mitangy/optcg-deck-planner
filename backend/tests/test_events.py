"""Stress Test Sunday giveaway: eligibility, join, and the seeded draw (#794)."""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.duel import events as ev
from app.duel.models import DuelEvent, DuelMatch, EventDraw, EventEntry
from tests.test_admin import ADMIN_EMAIL, login, mk
from tests.test_admin import api  # noqa: F401  (fixture)
from tests.test_duel import client  # noqa: F401  (fixture)

EVENT = ev.SEED_EVENT
START, END = EVENT.starts_at, EVENT.ends_at
MID = START + timedelta(hours=1)
BEFORE = START - timedelta(days=3)
AFTER = END + timedelta(hours=2)
_n = [0]


@pytest.fixture(autouse=True)
def _seeded_event(request):
    """Tests that use the API start with Stress Test Sunday in the table, like a fresh deploy."""
    if "api" in request.fixturenames:
        _, S = request.getfixturevalue("api")
        with S() as db:
            ev.seed_default_event(db)
    yield


@pytest.fixture()
def clock(monkeypatch: pytest.MonkeyPatch):
    state = {"now": MID}
    monkeypatch.setattr(ev, "utcnow", lambda: state["now"])
    return state


def play(S, a: int, b: int, at: datetime = MID, turns: int | None = 6, ranked: bool = True) -> None:
    _n[0] += 1
    with S() as db:
        db.add(
            DuelMatch(
                match_id=f"m{_n[0]}", seat0_user_id=a, seat1_user_id=b, winner_seat=0, turns=turns,
                seat0_rating_before=1000, seat1_rating_before=1000, seat0_rating_after=1000,
                seat1_rating_after=1000, created_at=at, ranked=ranked,
            )
        )
        db.commit()


def optin(S, uid: int) -> None:
    with S() as db:
        db.add(EventEntry(event_id=EVENT.id, user_id=uid, rules_version=EVENT.rules_version))
        db.commit()


def stats_for(S, uid: int) -> tuple[int, int]:
    with S() as db:
        games, opps = ev.player_stats(db, EVENT).get(uid, (0, set()))
        return games, len(opps)


def trio(S):
    """Three real players; a plays one game against each of b and c, then one more against b."""
    return mk(S, "a@x.test"), mk(S, "b@x.test"), mk(S, "c@x.test")


# ------------------------------------------------------------------ pure rules

def test_eligibility_needs_opt_in_games_and_distinct_opponents_794():
    ok = dict(opted_in=True, excluded=False, games=3, opponents=2)
    assert ev.is_eligible(EVENT, **ok)
    assert not ev.is_eligible(EVENT, **{**ok, "opted_in": False})
    assert not ev.is_eligible(EVENT, **{**ok, "excluded": True})
    assert not ev.is_eligible(EVENT, **{**ok, "games": 2})
    assert not ev.is_eligible(EVENT, **{**ok, "opponents": 1})


def test_ranking_follows_the_published_hmac_formula_794():
    seed = "ab" * 32
    ids = [5, 9, 2, 40, 7]
    expected = sorted(
        ids, key=lambda u: hmac.new(seed.encode(), f"{EVENT.id}:{u}".encode(), hashlib.sha256).hexdigest()
    )
    assert ev.rank_eligible(seed, EVENT.id, ids) == expected
    assert ev.rank_eligible(seed, EVENT.id, reversed(ids)) == expected
    assert ev.rank_eligible("cd" * 32, EVENT.id, ids) != expected  # another seed, another order
    assert ev.rank_eligible(seed, "other-event", ids) != expected  # the event id is part of the message
    assert ev.seed_hash(seed) == hashlib.sha256(seed.encode()).hexdigest()


def test_forfeited_players_are_skipped_so_the_next_one_moves_up_794():
    assert ev.pick_winners([4, 8, 1, 6, 3], [], 3) == [4, 8, 1]
    assert ev.pick_winners([4, 8, 1, 6, 3], [8], 3) == [4, 1, 6]
    assert ev.pick_winners([4, 8], [], 3) == [4, 8]


def test_the_banner_event_stays_for_a_week_after_it_ends_794(api):
    c, S = api
    with S() as db:
        assert ev.current_event(db, BEFORE) == EVENT
        assert ev.current_event(db, AFTER) == EVENT
        assert ev.current_event(db, END + timedelta(days=6)) == EVENT
        assert ev.current_event(db, END + timedelta(days=8)) is None


# ------------------------------------------------------------------ counting games

def test_games_count_from_the_start_inclusive_to_the_end_exclusive_794(api):
    c, S = api
    a, b, _c = trio(S)
    play(S, a, b, START - timedelta(seconds=1))
    play(S, a, b, START)
    play(S, a, b, END - timedelta(seconds=1))
    play(S, a, b, END)
    assert stats_for(S, a) == (2, 1)
    assert stats_for(S, b) == (2, 1)


def test_short_and_unknown_turn_games_do_not_count_794(api):
    c, S = api
    a, b, _c = trio(S)
    play(S, a, b, turns=2)
    play(S, a, b, turns=None)
    play(S, a, b, turns=3)
    assert stats_for(S, a) == (1, 1)


def test_games_against_guests_do_not_count_toward_games_or_opponents_794(api):
    c, S = api
    a, b, _c = trio(S)
    guest = mk(S, "guest-abc@localhost")
    play(S, a, guest)
    play(S, guest, a)
    play(S, a, b)
    assert stats_for(S, a) == (1, 1)


def test_playing_yourself_does_not_count_794(api):
    c, S = api
    a, _b, _c = trio(S)
    play(S, a, a)
    assert stats_for(S, a) == (0, 0)


def test_three_games_against_one_opponent_is_not_enough_794(api):
    c, S = api
    a, b, d = trio(S)
    for _ in range(3):
        play(S, a, b)
    optin(S, a)
    with S() as db:
        [p] = ev.participants(db, EVENT)
    assert (p.games, p.opponents, p.eligible) == (3, 1, False)
    play(S, d, a)
    with S() as db:
        [p] = ev.participants(db, EVENT)
    assert (p.games, p.opponents, p.eligible) == (4, 2, True)


def test_not_opted_in_players_are_never_listed_or_eligible_794(api):
    c, S = api
    a, b, d = trio(S)
    play(S, a, b)
    play(S, a, d)
    play(S, a, b)
    with S() as db:
        assert ev.participants(db, EVENT) == []


def test_banned_staff_and_guest_accounts_are_excluded_794(api):
    c, S = api
    a, b, d = trio(S)
    banned = mk(S, "ban@x.test", banned_at=MID)
    mod = mk(S, "mod@x.test", "moderator")
    admin = mk(S, ADMIN_EMAIL, "admin")
    guest = mk(S, "guest-zzz@localhost")
    for uid in (a, banned, mod, admin, guest):
        optin(S, uid)
        play(S, uid, b)
        play(S, uid, d)
        play(S, uid, b)
    with S() as db:
        got = {p.user.id: (p.eligible, p.excluded) for p in ev.participants(db, EVENT)}
    assert got[a] == (True, None)
    assert got[banned] == (False, "banned")
    assert got[mod] == (False, "staff")
    assert got[admin] == (False, "staff")
    assert got[guest] == (False, "guest")


# ------------------------------------------------------------------ routes: public

def test_current_event_is_hidden_when_none_is_near_794(api, clock):
    c, S = api
    clock["now"] = END + timedelta(days=30)
    assert c.get("/duel/events/current").json() == {"event": None}


def test_anonymous_and_guest_visitors_cannot_join_and_see_why_794(api, clock):
    c, S = api
    clock["now"] = BEFORE
    body = c.get("/duel/events/current").json()["event"]
    assert body["status"] == "upcoming" and body["can_join"] is False and body["cant_join_reason"]
    assert body["viewer"] == "anonymous"
    assert body["seed_hash"] is None and body["seed"] is None
    guest = mk(S, "guest-q@localhost")
    login(c, S, guest)
    body = c.get("/duel/events/current").json()["event"]
    assert body["can_join"] is False and body["viewer"] == "guest"
    join = c.post(f"/duel/events/{EVENT.id}/join", json={"accept_rules": True, "rules_version": EVENT.rules_version})
    assert join.status_code == 403


def test_join_needs_accepted_current_rules_and_is_idempotent_794(api, clock):
    c, S = api
    clock["now"] = BEFORE
    a = mk(S, "a@x.test")
    url = f"/duel/events/{EVENT.id}/join"
    assert c.post(url, json={"accept_rules": True, "rules_version": EVENT.rules_version}).status_code == 401
    login(c, S, a)
    assert c.post(url, json={"accept_rules": False, "rules_version": EVENT.rules_version}).status_code == 422
    assert c.post(url, json={"accept_rules": True, "rules_version": "1999-01-01"}).status_code == 409
    assert c.get("/duel/events/current").json()["event"]["opted_in"] is False
    for _ in range(2):
        assert c.post(url, json={"accept_rules": True, "rules_version": EVENT.rules_version}).status_code == 200
    ev_out = c.get("/duel/events/current").json()["event"]
    assert ev_out["opted_in"] is True and ev_out["can_join"] is True
    with S() as db:
        assert db.query(EventEntry).count() == 1


def test_join_is_refused_after_the_event_ends_and_for_banned_accounts_794(api, clock):
    c, S = api
    a = mk(S, "a@x.test")
    mod = mk(S, "mod@x.test", "moderator")
    url = f"/duel/events/{EVENT.id}/join"
    ok = {"accept_rules": True, "rules_version": EVENT.rules_version}
    login(c, S, a)
    clock["now"] = END
    assert c.post(url, json=ok).status_code == 403
    clock["now"] = END - timedelta(seconds=1)
    assert c.post(url, json=ok).status_code == 200
    login(c, S, mod)
    assert c.post(url, json=ok).status_code == 200
    banned = mk(S, "ban@x.test", banned_at=MID)
    login(c, S, banned)
    assert c.post(url, json=ok).status_code == 403


def test_staff_can_join_and_play_but_never_become_eligible_834(api, clock):
    c, S = api
    a, b, d = trio(S)
    mod = mk(S, "mod@x.test", "moderator")
    clock["now"] = BEFORE
    login(c, S, mod)
    body = c.get("/duel/events/current").json()["event"]
    assert body["viewer"] == "staff" and body["can_join"] is True and body["cant_join_reason"] is None
    ok = {"accept_rules": True, "rules_version": EVENT.rules_version}
    assert c.post(f"/duel/events/{EVENT.id}/join", json=ok).status_code == 200
    for opp in (a, b, d):
        play(S, mod, opp)
    p = c.get("/duel/events/current").json()["event"]
    assert p["opted_in"] is True and p["progress"] == {"games": 3, "opponents": 3, "eligible": False}
    with S() as db:
        got = {x.user.id: (x.eligible, x.excluded) for x in ev.participants(db, EVENT)}
    assert got[mod] == (False, "staff")


def test_signed_in_players_see_their_own_progress_794(api, clock):
    c, S = api
    a, b, d = trio(S)
    optin(S, a)
    play(S, a, b)
    play(S, d, a)
    login(c, S, a)
    p = c.get("/duel/events/current").json()["event"]["progress"]
    assert p == {"games": 2, "opponents": 2, "eligible": False}
    play(S, a, b)
    p = c.get("/duel/events/current").json()["event"]["progress"]
    assert p == {"games": 3, "opponents": 2, "eligible": True}


# ------------------------------------------------------------------ routes: admin and the draw

def setup_players(S, n: int = 4) -> list[int]:
    """n opted-in players who each beat the eligibility bar by playing the others."""
    ids = [mk(S, f"p{i}@x.test") for i in range(n)]
    for uid in ids:
        optin(S, uid)
    for i, uid in enumerate(ids):
        for off in (1, 2, 3):
            play(S, uid, ids[(i + off) % n])
    return ids


def admin_login(c, S) -> int:
    admin = mk(S, ADMIN_EMAIL, "admin")
    login(c, S, admin)
    return admin


def test_admin_event_routes_are_admin_only_794(api, clock):
    c, S = api
    url = f"/admin/events/{EVENT.id}"
    assert c.get(url).status_code == 401
    login(c, S, mk(S, "mod@x.test", "moderator"))
    assert c.get(url).status_code == 403
    assert c.get(url + "/participants.csv").status_code == 403
    assert c.post(url + "/commit").status_code == 403
    assert c.post(url + "/draw").status_code == 403
    assert c.post(url + "/forfeit", json={"user_id": 1}).status_code == 403


def test_admin_counters_count_the_window_and_eligible_players_794(api, clock):
    c, S = api
    ids = setup_players(S)
    outsider = mk(S, "o@x.test")
    play(S, outsider, ids[0])
    play(S, outsider, ids[0], at=START - timedelta(hours=1))  # outside the window
    guest = mk(S, "guest-k@localhost")
    play(S, guest, ids[0])
    admin_login(c, S)
    out = c.get(f"/admin/events/{EVENT.id}").json()
    assert out["counters"] == {"opted_in": 4, "games_in_window": 12 + 2, "players_with_game": 5, "eligible": 4, "flagged_eligible": 0}
    assert len(out["participants"]) == 4
    assert all(p["eligible"] for p in out["participants"])
    csv_text = c.get(f"/admin/events/{EVENT.id}/participants.csv").text
    assert csv_text.splitlines()[0].startswith("user_id,name,email,games,opponents,eligible")
    assert csv_text.count("p0@x.test") == 1


def test_csv_neutralises_spreadsheet_formulas_in_names_794(api, clock):
    c, S = api
    evil = mk(S, "evil@x.test", name="=HYPERLINK(1)")
    optin(S, evil)
    admin_login(c, S)
    assert "'=HYPERLINK(1)" in c.get(f"/admin/events/{EVENT.id}/participants.csv").text


def test_the_seed_is_committed_only_once_and_only_before_the_start_794(api, clock):
    c, S = api
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}/commit"
    clock["now"] = START
    assert c.post(url).status_code == 409
    clock["now"] = BEFORE
    out = c.post(url).json()
    h = out["draw"]["seed_hash"]
    assert len(h) == 64 and out["draw"]["seed"] is None
    assert c.post(url).status_code == 409
    pub = c.get("/duel/events/current").json()["event"]
    assert pub["seed_hash"] == h and pub["seed"] is None
    with S() as db:
        from app.duel.models import EventDraw

        seed = db.query(EventDraw).one().seed
    assert ev.seed_hash(seed) == h


def test_the_draw_runs_only_after_the_end_and_needs_a_committed_seed_794(api, clock):
    c, S = api
    setup_players(S)
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}/draw"
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    clock["now"] = END - timedelta(seconds=1)
    assert c.post(url).status_code == 409
    assert c.get("/duel/events/current").json()["event"]["seed"] is None
    clock["now"] = AFTER
    assert c.post(url).status_code == 200


def test_draw_without_a_committed_seed_is_refused_794(api, clock):
    c, S = api
    admin_login(c, S)
    clock["now"] = AFTER
    assert c.post(f"/admin/events/{EVENT.id}/draw").status_code == 409


def test_draw_picks_the_hmac_ranked_winners_and_reveals_the_seed_794(api, clock):
    c, S = api
    ids = setup_players(S, 5)
    admin_login(c, S)
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    clock["now"] = AFTER
    out = c.post(f"/admin/events/{EVENT.id}/draw").json()
    draw = out["draw"]
    seed = draw["seed"]
    assert hashlib.sha256(seed.encode()).hexdigest() == draw["seed_hash"]
    expected = sorted(
        ids, key=lambda u: hmac.new(seed.encode(), f"{EVENT.id}:{u}".encode(), hashlib.sha256).hexdigest()
    )
    assert [r["user_id"] for r in draw["ranking"]] == expected
    assert [w["user_id"] for w in draw["winners"]] == expected[:3]
    assert out["status"] == "drawn"
    clock["now"] = AFTER + timedelta(hours=1)
    again = c.post(f"/admin/events/{EVENT.id}/draw").json()["draw"]
    assert again["drawn_at"] == draw["drawn_at"] and again["winners"] == draw["winners"]
    pub = c.get("/duel/events/current").json()["event"]
    assert pub["seed"] == seed and pub["status"] == "drawn" and sorted(pub["eligible_user_ids"]) == sorted(ids)


def test_only_eligible_players_enter_the_draw_794(api, clock):
    c, S = api
    ids = setup_players(S, 4)
    lazy = mk(S, "lazy@x.test")
    optin(S, lazy)
    admin_login(c, S)
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    clock["now"] = AFTER
    draw = c.post(f"/admin/events/{EVENT.id}/draw").json()["draw"]
    assert sorted(r["user_id"] for r in draw["ranking"]) == sorted(ids)


def test_a_forfeit_moves_the_next_player_up_794(api, clock):
    c, S = api
    setup_players(S, 5)
    admin_login(c, S)
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    url = f"/admin/events/{EVENT.id}/forfeit"
    clock["now"] = AFTER
    assert c.post(url, json={"user_id": 1}).status_code == 409  # not drawn yet
    draw = c.post(f"/admin/events/{EVENT.id}/draw").json()["draw"]
    ranking = [r["user_id"] for r in draw["ranking"]]
    assert c.post(url, json={"user_id": 99999}).status_code == 404
    out = c.post(url, json={"user_id": ranking[1]}).json()["draw"]
    assert [w["user_id"] for w in out["winners"]] == [ranking[0], ranking[2], ranking[3]]
    assert out["forfeited"] == [ranking[1]]
    out = c.post(url, json={"user_id": ranking[1]}).json()["draw"]
    assert out["forfeited"] == [ranking[1]]
    out = c.post(url, json={"user_id": ranking[0]}).json()["draw"]
    assert [w["user_id"] for w in out["winners"]] == [ranking[2], ranking[3], ranking[4]]


def test_the_event_stays_reachable_through_the_reply_window_795(api, clock):
    """The rules say a winner has 7 days to reply, so the forfeit lands ~8 days after the end."""
    c, S = api
    ids = setup_players(S, 5)
    admin_login(c, S)
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    clock["now"] = AFTER
    draw = c.post(f"/admin/events/{EVENT.id}/draw").json()["draw"]
    ranking = [r["user_id"] for r in draw["ranking"]]

    clock["now"] = END + timedelta(days=8)
    # The lobby banner still stops showing the ended event after a week, as before.
    assert c.get("/duel/events/current").json() == {"event": None}
    # The public rules page loads it by id and still shows the seed and eligible ids.
    pub = c.get(f"/duel/events/{EVENT.id}")
    assert pub.status_code == 200
    body = pub.json()["event"]
    assert body["id"] == EVENT.id and body["status"] == "drawn"
    assert body["seed"] == draw["seed"] and sorted(body["eligible_user_ids"]) == sorted(ids)
    # The admin tab finds the event and can still forfeit a winner.
    latest = c.get("/admin/events/latest")
    assert latest.status_code == 200 and latest.json()["id"] == EVENT.id
    out = c.post(f"/admin/events/{EVENT.id}/forfeit", json={"user_id": ranking[0]}).json()["draw"]
    assert [w["user_id"] for w in out["winners"]] == ranking[1:4]


def test_event_lookup_by_id_is_public_and_404s_for_unknown_ids_795(api, clock):
    c, _ = api
    assert c.get("/duel/events/nope").status_code == 404
    assert c.get(f"/duel/events/{EVENT.id}").json()["event"]["id"] == EVENT.id
    assert c.get("/admin/events/latest").status_code == 401


# ------------------------------------------------------------------ advisory flags (#809)

OLD = START - timedelta(days=60)


def acct(S, email: str, created=OLD) -> int:
    uid = mk(S, email, created_at=created)
    optin(S, uid)
    return uid


def flags_by_id(S) -> dict[int, tuple[str, ...]]:
    with S() as db:
        return {p.user.id: p.flags for p in ev.participants(db, EVENT)}


def ring(S, ids: list[int], **kw) -> None:
    for i, uid in enumerate(ids):
        play(S, uid, ids[(i + 1) % len(ids)], **kw)


def test_new_account_flag_uses_the_seven_days_before_the_start_809(api):
    c, S = api
    old = acct(S, "old@x.test", START - timedelta(days=7, minutes=1))
    edge = acct(S, "edge@x.test", START - timedelta(days=7))
    fresh = acct(S, "fresh@x.test", START - timedelta(days=6))
    naive = acct(S, "naive@x.test", (START - timedelta(days=1)).replace(tzinfo=None))
    f = flags_by_id(S)
    assert f[old] == ()
    assert f[edge] == ("new_account",)
    assert f[fresh] == ("new_account",)
    assert f[naive] == ("new_account",)


def test_new_opponents_flag_needs_every_counted_opponent_to_be_new_809(api):
    c, S = api
    fresh = START - timedelta(days=2)
    all_new = acct(S, "all-new@x.test")
    mixed = acct(S, "mixed@x.test")
    quiet = acct(S, "quiet@x.test")
    alt1, alt2 = acct(S, "alt1@x.test", fresh), acct(S, "alt2@x.test", fresh)
    veteran = acct(S, "veteran@x.test")
    for alt in (alt1, alt2):
        play(S, all_new, alt)
    play(S, mixed, alt1)
    play(S, mixed, veteran)
    play(S, quiet, alt1, turns=2)  # does not count, so no counted opponents
    f = flags_by_id(S)
    assert "new_opponents" in f[all_new]
    assert "new_opponents" not in f[mixed]
    assert "new_opponents" not in f[quiet]
    assert "new_opponents" not in f[veteran]


def test_isolated_group_flag_is_a_small_closed_cluster_of_counted_games_809(api):
    c, S = api
    alts = [acct(S, f"alt{i}@x.test") for i in range(3)]
    ring(S, alts)
    four = [acct(S, f"four{i}@x.test") for i in range(4)]
    ring(S, four)
    five = [acct(S, f"five{i}@x.test") for i in range(5)]
    ring(S, five)
    # A 3-ring bridged to the big group only by a game that does not count stays isolated.
    shaky = [acct(S, f"shaky{i}@x.test") for i in range(3)]
    ring(S, shaky)
    play(S, shaky[0], five[0], turns=2)
    guest = mk(S, "guest-z@localhost")  # a guest between the ring and the big group is no bridge
    play(S, shaky[1], guest)
    play(S, guest, five[1])
    lone = acct(S, "lone@x.test")
    f = flags_by_id(S)
    assert all("isolated_group" in f[u] for u in alts + four + shaky)
    assert all("isolated_group" not in f[u] for u in five)
    assert "isolated_group" not in f[lone]  # no counted game


def test_a_counted_game_into_a_big_group_ends_the_isolation_809(api):
    c, S = api
    five = [acct(S, f"five{i}@x.test") for i in range(5)]
    ring(S, five)
    pair = [acct(S, f"pair{i}@x.test") for i in range(2)]
    ring(S, pair)
    assert all("isolated_group" in flags_by_id(S)[u] for u in pair)
    play(S, pair[0], five[0])
    f = flags_by_id(S)
    assert all("isolated_group" not in f[u] for u in pair + five)


def test_private_only_flag_clears_with_one_ranked_game_809(api):
    c, S = api
    big = [acct(S, f"big{i}@x.test") for i in range(6)]
    ring(S, big, ranked=True)
    private = acct(S, "private@x.test")
    mix = acct(S, "mix@x.test")
    quiet = acct(S, "quiet@x.test")
    play(S, private, big[0], ranked=False)
    play(S, private, big[1], ranked=False)
    play(S, mix, big[2], ranked=False)
    play(S, mix, big[3], ranked=True)
    f = flags_by_id(S)
    assert "private_only" in f[private]
    assert "private_only" not in f[mix]
    assert "private_only" not in f[quiet]
    assert all("private_only" not in f[u] for u in big)


def test_flags_come_in_a_fixed_order_809(api):
    c, S = api
    fresh = START - timedelta(days=1)
    alts = [acct(S, f"alt{i}@x.test", fresh) for i in range(3)]
    ring(S, alts, ranked=False)
    assert flags_by_id(S)[alts[0]] == ("new_account", "new_opponents", "isolated_group", "private_only")


def test_admin_json_and_csv_carry_flags_and_flagged_players_still_win_809(api, clock):
    c, S = api
    ids = setup_players(S, 4)  # a closed ring of ranked veterans: flagged isolated_group
    wide = [acct(S, f"w{i}@x.test") for i in range(6)]
    for i, uid in enumerate(wide):
        for off in (1, 2, 3):
            play(S, uid, wide[(i + off) % 6])
    newbie = acct(S, "newbie@x.test", START - timedelta(days=1))  # flagged but not eligible
    admin_login(c, S)
    out = c.get(f"/admin/events/{EVENT.id}").json()
    rows = {p["user_id"]: p for p in out["participants"]}
    assert all(rows[u]["flags"] == ["isolated_group"] and rows[u]["eligible"] for u in ids)
    assert all(rows[u]["flags"] == [] and rows[u]["eligible"] for u in wide)
    assert rows[newbie]["flags"] == ["new_account"] and not rows[newbie]["eligible"]
    assert out["counters"]["flagged_eligible"] == 4 and out["counters"]["eligible"] == 10
    lines = c.get(f"/admin/events/{EVENT.id}/participants.csv").text.splitlines()
    assert lines[0].endswith(",excluded,flags")
    by_email = {ln.split(",")[2]: ln for ln in lines[1:]}
    assert by_email["p0@x.test"].endswith(",yes,,isolated_group")
    assert by_email["w0@x.test"].endswith(",yes,,")
    clock["now"] = BEFORE
    c.post(f"/admin/events/{EVENT.id}/commit")
    clock["now"] = AFTER
    draw = c.post(f"/admin/events/{EVENT.id}/draw").json()["draw"]
    assert sorted(r["user_id"] for r in draw["ranking"]) == sorted(ids + wide)


# ------------------------------------------------------------------ admin create / edit / delete (#1019)

def payload(**over) -> dict:
    base = {
        "title": "Friday Bracket",
        "starts_at": (START + timedelta(days=14)).isoformat(),
        "ends_at": (START + timedelta(days=14, hours=4)).isoformat(),
        "prize": "Booster box",
        "prize_details": "Winner takes a booster box.",
        "prize_method": "placement",
        "format": "single_elim",
        "bracket_size": 8,
        "best_of": 3,
    }
    return {**base, **over}


def create(c, **over) -> dict:
    r = c.post("/admin/events", json=payload(**over))
    assert r.status_code == 200, r.text
    return r.json()


def test_event_management_routes_are_admin_only_1019(api, clock):
    c, S = api
    calls = [
        ("get", "/admin/events", None),
        ("post", "/admin/events", payload()),
        ("patch", f"/admin/events/{EVENT.id}", {"title": "x"}),
        ("delete", f"/admin/events/{EVENT.id}", None),
    ]
    for method, url, body in calls:
        assert getattr(c, method)(url, **({"json": body} if body else {})).status_code == 401
    login(c, S, mk(S, "mod@x.test", "moderator"))
    for method, url, body in calls:
        assert getattr(c, method)(url, **({"json": body} if body else {})).status_code == 403
    with S() as db:
        assert [e.id for e in ev.list_events(db)] == [EVENT.id]
        assert ev.get_event(db, EVENT.id).title == EVENT.title


def test_admin_creates_an_event_with_prizing_and_style_details_1019(api, clock):
    c, S = api
    admin_login(c, S)
    out = create(c, description="Bring your best deck.")
    assert out["id"] == "friday-bracket-2026-12"
    assert (out["format"], out["bracket_size"], out["best_of"]) == ("single_elim", 8, 3)
    assert (out["prize_method"], out["prize"], out["prize_details"]) == ("placement", "Booster box", "Winner takes a booster box.")
    assert out["description"] == "Bring your best deck."
    assert out["status"] == "upcoming" and out["rules_version"]
    assert create(c)["id"] == "friday-bracket-2026-12-2"
    listed = c.get("/admin/events").json()["events"]
    assert [e["id"] for e in listed] == ["friday-bracket-2026-12", "friday-bracket-2026-12-2", EVENT.id]
    assert listed[-1]["joined"] == 0 and listed[0]["format"] == "single_elim"
    pub = c.get("/duel/events/friday-bracket-2026-12").json()["event"]
    assert (pub["format"], pub["bracket_size"], pub["best_of"], pub["prize_method"]) == ("single_elim", 8, 3, "placement")
    assert pub["prize_details"] == "Winner takes a booster box." and pub["description"] == "Bring your best deck."


@pytest.mark.parametrize(
    "bad",
    [
        {"title": "   "},
        {"title": "x" * 81},
        {"ends_at": (START + timedelta(days=14)).isoformat()},
        {"ends_at": (START + timedelta(days=13)).isoformat()},
        {"winners": 0},
        {"winners": 51},
        {"min_games": -1},
        {"min_opponents": -1},
        {"min_turns": -1},
        {"format": "double_elim"},
        {"format": "single_elim", "bracket_size": None},
        {"format": "single_elim", "bracket_size": 6},
        {"prize_method": "raffle"},
        {"best_of": 2},
        {"prize": "x" * 201},
    ],
)
def test_event_fields_are_validated_on_create_and_edit_1019(api, clock, bad):
    c, S = api
    admin_login(c, S)
    assert c.post("/admin/events", json=payload(**bad)).status_code == 422
    assert c.patch(f"/admin/events/{EVENT.id}", json=payload(**bad)).status_code == 422
    with S() as db:
        assert ev.list_events(db) == [EVENT]


def test_bracket_size_only_applies_to_single_elimination_1019(api, clock):
    c, S = api
    admin_login(c, S)
    assert create(c, format="swiss")["bracket_size"] is None
    out = c.patch(f"/admin/events/{EVENT.id}", json={"format": "single_elim", "bracket_size": 16}).json()
    assert (out["format"], out["bracket_size"]) == ("single_elim", 16)
    out = c.patch(f"/admin/events/{EVENT.id}", json={"format": "round_robin"}).json()
    assert (out["format"], out["bracket_size"]) == ("round_robin", None)


def test_admin_moves_the_event_date_and_the_public_page_follows_1019(api, clock):
    c, S = api
    admin_login(c, S)
    new_start, new_end = START + timedelta(days=7), END + timedelta(days=7)
    out = c.patch(f"/admin/events/{EVENT.id}", json={"starts_at": new_start.isoformat(), "ends_at": new_end.isoformat()})
    assert out.status_code == 200
    pub = c.get(f"/duel/events/{EVENT.id}").json()["event"]
    assert pub["starts_at"] == new_start.isoformat() and pub["ends_at"] == new_end.isoformat()
    clock["now"] = MID  # the old window: now the event has not started
    assert c.get(f"/duel/events/{EVENT.id}").json()["event"]["status"] == "upcoming"
    setup_players(S)  # their games sit in the old window
    assert c.get(f"/admin/events/{EVENT.id}").json()["counters"]["games_in_window"] == 0
    c.patch(f"/admin/events/{EVENT.id}", json={"starts_at": START.isoformat(), "ends_at": END.isoformat()})
    assert c.get(f"/admin/events/{EVENT.id}").json()["counters"]["games_in_window"] > 0


def test_a_naive_edit_time_is_read_as_utc_1019(api, clock):
    c, S = api
    admin_login(c, S)
    out = c.patch(f"/admin/events/{EVENT.id}", json={"starts_at": "2026-11-22T18:00:00", "ends_at": "2026-11-22T22:00:00"}).json()
    assert out["starts_at"] == "2026-11-22T18:00:00+00:00"


def test_rules_version_changes_only_when_the_rules_change_1019(api, clock):
    c, S = api
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}"
    v0 = c.get(url).json()["rules_version"]
    assert c.patch(url, json={"title": "Renamed", "description": "New blurb"}).json()["rules_version"] == v0
    seen = {v0}
    for change in ({"min_games": 4}, {"prize_details": "Now a trophy"}, {"format": "swiss"}, {"best_of": 3}, {"winners": 5}):
        v = c.patch(url, json=change).json()["rules_version"]
        assert v not in seen
        seen.add(v)
    # Re-sending the form unchanged is not a rules change either.
    cur = c.get(url).json()
    again = c.patch(url, json={k: cur[k] for k in ("title", "starts_at", "ends_at", "min_games", "prize")}).json()
    assert again["rules_version"] == cur["rules_version"]


def test_a_rules_change_makes_a_stale_join_page_reload_1019(api, clock):
    c, S = api
    player = mk(S, "p@x.test")
    old_version = EVENT.rules_version
    admin_login(c, S)
    assert c.patch(f"/admin/events/{EVENT.id}", json={"min_games": 5}).status_code == 200
    login(c, S, player)
    r = c.post(f"/duel/events/{EVENT.id}/join", json={"accept_rules": True, "rules_version": old_version})
    assert r.status_code == 409
    fresh = c.get(f"/duel/events/{EVENT.id}").json()["event"]
    assert c.post(f"/duel/events/{EVENT.id}/join", json={"accept_rules": True, "rules_version": fresh["rules_version"]}).status_code == 200


def test_edits_that_change_who_wins_are_refused_after_the_draw_1019(api, clock):
    c, S = api
    setup_players(S, 5)
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}"
    clock["now"] = BEFORE
    c.post(url + "/commit")
    clock["now"] = AFTER
    assert c.post(url + "/draw").status_code == 200
    for change in (
        {"starts_at": (START + timedelta(hours=1)).isoformat()},
        {"ends_at": (END + timedelta(hours=1)).isoformat()},
        {"winners": 2},
        {"min_games": 1},
        {"min_opponents": 1},
        {"min_turns": 1},
        {"prize_method": "placement"},
    ):
        r = c.patch(url, json=change)
        assert r.status_code == 409 and "draw already ran" in r.json()["detail"], change
    cur = c.get(url).json()
    assert (cur["winners_count"], cur["min_games"], cur["starts_at"]) == (3, 3, START.isoformat())
    # Wording can still be fixed, and re-sending the locked values unchanged is fine.
    ok = c.patch(url, json={"prize_details": "Gift cards by email", "winners": 3, "starts_at": START.isoformat(), "title": "Stress Test Sunday!"})
    assert ok.status_code == 200 and ok.json()["prize_details"] == "Gift cards by email" and ok.json()["title"] == "Stress Test Sunday!"


def test_the_start_cannot_move_once_a_seed_is_committed_and_the_event_began_1019(api, clock):
    c, S = api
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}"
    clock["now"] = BEFORE
    c.post(url + "/commit")
    later = (START + timedelta(days=1)).isoformat()
    later_end = (END + timedelta(days=1)).isoformat()
    assert c.patch(url, json={"starts_at": later, "ends_at": later_end}).status_code == 200  # not started yet
    clock["now"] = START + timedelta(days=1, minutes=5)
    r = c.patch(url, json={"starts_at": (START + timedelta(days=2)).isoformat(), "ends_at": (END + timedelta(days=2)).isoformat()})
    assert r.status_code == 409 and "start can't move" in r.json()["detail"]


def test_the_prize_method_is_locked_once_a_seed_is_committed_1019(api, clock):
    c, S = api
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}"
    clock["now"] = BEFORE
    c.post(url + "/commit")
    assert c.patch(url, json={"prize_method": "placement"}).status_code == 409
    other = create(c)["id"]
    assert c.patch(f"/admin/events/{other}", json={"prize_method": "draw"}).json()["prize_method"] == "draw"


def test_placement_events_have_no_seed_commit_or_draw_1019(api, clock):
    c, S = api
    admin_login(c, S)
    eid = create(c)["id"]
    clock["now"] = BEFORE
    assert c.post(f"/admin/events/{eid}/commit").status_code == 409
    with S() as db:
        assert db.scalar(select(func.count()).select_from(EventDraw)) == 0
        # Even with a seed on file (say, left from when it was a draw event) nothing can be drawn.
        db.add(EventDraw(event_id=eid, seed="ab" * 32, seed_hash=ev.seed_hash("ab" * 32)))
        db.commit()
    clock["now"] = END + timedelta(days=15)
    r = c.post(f"/admin/events/{eid}/draw")
    assert r.status_code == 409 and "no draw" in r.json()["detail"]
    with S() as db:
        assert db.scalar(select(EventDraw.drawn_at).where(EventDraw.event_id == eid)) is None


def test_deleting_an_event_removes_its_entries_and_seed_1019(api, clock):
    c, S = api
    admin_login(c, S)
    eid = create(c, prize_method="draw")["id"]
    other = create(c, title="Other night")["id"]
    p = mk(S, "p@x.test")
    with S() as db:
        db.add_all([
            EventEntry(event_id=eid, user_id=p, rules_version="v"),
            EventEntry(event_id=other, user_id=p, rules_version="v"),
        ])
        db.commit()
    clock["now"] = BEFORE
    assert c.post(f"/admin/events/{eid}/commit").status_code == 200
    assert c.delete(f"/admin/events/{eid}").json() == {"deleted": eid}
    assert c.get(f"/admin/events/{eid}").status_code == 404
    assert c.get(f"/duel/events/{eid}").status_code == 404
    assert c.delete(f"/admin/events/{eid}").status_code == 404
    with S() as db:
        assert [e.event_id for e in db.scalars(select(EventEntry)).all()] == [other]
        assert db.scalar(select(func.count()).select_from(EventDraw)) == 0
        assert {e.id for e in ev.list_events(db)} == {EVENT.id, other}


def test_a_drawn_event_cannot_be_deleted_1019(api, clock):
    c, S = api
    setup_players(S, 5)
    admin_login(c, S)
    url = f"/admin/events/{EVENT.id}"
    clock["now"] = BEFORE
    c.post(url + "/commit")
    clock["now"] = AFTER
    assert c.post(url + "/draw").status_code == 200
    r = c.delete(url)
    assert r.status_code == 409 and "draw already ran" in r.json()["detail"]
    assert c.get(url).status_code == 200
    with S() as db:
        assert db.scalar(select(func.count()).select_from(EventEntry)) == 5


def test_the_default_event_is_seeded_once_and_not_resurrected_after_delete_1019(monkeypatch):
    from app.core import db as app_db
    from tests.db_support import make_bare_engine

    engine = make_bare_engine()
    monkeypatch.setattr(app_db, "engine", engine)
    app_db.init_db()
    with Session(engine) as db:
        assert [e.id for e in ev.list_events(db)] == [EVENT.id]
        db.execute(delete(DuelEvent))
        db.commit()
    app_db.init_db()
    with Session(engine) as db:
        assert ev.list_events(db) == []
    engine.dispose()


def test_the_latest_event_is_the_one_that_ends_last_1019(api, clock):
    c, S = api
    admin_login(c, S)
    assert c.get("/admin/events/latest").json()["id"] == EVENT.id
    new = create(c)
    assert c.get("/admin/events/latest").json()["id"] == new["id"]
    # The public banner still prefers the soonest live or upcoming event.
    assert c.get("/duel/events/current").json()["event"]["id"] == EVENT.id
