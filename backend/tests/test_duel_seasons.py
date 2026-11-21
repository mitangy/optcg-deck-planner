"""Ranked seasons (#1405): reset math, archived standings, season-scoped stats, admin guard."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.models import User
from app.duel.leaderboard import board_as_of
from app.duel.models import DuelMatch, DuelRating, DuelSeason, DuelSeasonStanding
from app.duel.seasons import start_new_season
from tests.test_admin import ADMIN_EMAIL, api, login, mk  # noqa: F401  (api is a fixture)
from tests.test_duel import client  # noqa: F401  (fixture)

NOW = datetime.now(timezone.utc)


def rate(S, uid: int, rating: int, games: int) -> None:
    with S() as db:
        db.add(DuelRating(user_id=uid, rating=rating, games_played=games))
        db.commit()


def game(S, match_id: str, winner: int, loser: int, at: datetime, before: int = 1000, after: int = 1016) -> None:
    """A rated game; the winner (seat 0) moved from `before` to `after`, the loser fell by the same."""
    with S() as db:
        db.add(
            DuelMatch(
                match_id=match_id, seat0_user_id=winner, seat1_user_id=loser, winner_seat=0, ranked=True, turns=6,
                seat0_rating_before=before, seat1_rating_before=before,
                seat0_rating_after=after, seat1_rating_after=2 * before - after, created_at=at,
            )
        )
        db.commit()


def ratings_of(S) -> dict[int, tuple[int, int]]:
    with S() as db:
        return {r.user_id: (r.rating, r.games_played) for r in db.query(DuelRating)}


def mk_id(S, email: str) -> int:
    with S() as db:
        return db.query(User).filter_by(email=email).one().id


def start(S, mode: str, actor: int | None = None, name: str | None = None) -> DuelSeason:
    with S() as db:
        return start_new_season(db, mode, name, actor)


def three_players(S) -> tuple[int, int, int]:
    high, low, mid = mk(S, "high@x.test"), mk(S, "low@x.test"), mk(S, "mid@x.test")
    rate(S, high, 1401, 12)
    rate(S, low, 799, 12)
    rate(S, mid, 1000, 12)
    return high, low, mid


def test_soft_reset_moves_everyone_halfway_back_to_1000_and_replays_placement_1405(client):
    _, S = client
    high, low, mid = three_players(S)
    start(S, "soft")
    # 1401 -> 1201; 799 is 201 below, half rounds away from zero -> 101 below.
    assert ratings_of(S) == {high: (1201, 0), low: (899, 0), mid: (1000, 0)}


def test_hard_reset_puts_everyone_back_on_1000_1405(client):
    _, S = client
    high, low, mid = three_players(S)
    start(S, "hard")
    assert ratings_of(S) == {high: (1000, 0), low: (1000, 0), mid: (1000, 0)}


def test_the_standings_keep_each_players_final_rank_rating_and_record_1405(client):
    _, S = client
    high, low, mid = three_players(S)
    placing = mk(S, "new@x.test")
    rate(S, placing, 1100, 3)  # still provisional, so ranked after every settled player
    for i in range(3):
        game(S, f"w{i}", high, low, NOW - timedelta(days=2, minutes=i))
    game(S, "l0", low, high, NOW - timedelta(days=2, minutes=9))
    game(S, "p0", placing, mid, NOW - timedelta(days=2, minutes=10))
    start(S, "soft")
    with S() as db:
        rows = {r.user_id: r for r in db.query(DuelSeasonStanding)}
        season = db.query(DuelSeason).filter_by(number=1).one()
    assert season.reset_mode == "soft" and season.ended_at is not None
    assert {u: (r.rank, r.rating, r.wins, r.losses, r.provisional, r.rating_after_reset) for u, r in rows.items()} == {
        high: (1, 1401, 3, 1, False, 1201),
        mid: (2, 1000, 0, 1, False, 1000),
        low: (3, 799, 1, 3, False, 899),
        placing: (4, 1100, 1, 0, True, 1050),
    }


def test_the_board_starts_empty_and_records_count_only_games_since_the_reset_1405(client):
    c, S = client
    high, low, _ = three_players(S)
    game(S, "old", high, low, NOW - timedelta(days=2))
    start(S, "hard")
    assert c.get("/duel/leaderboard").json()["entries"] == []
    # One game after the reset: both players are back on the board with a single game each.
    game(S, "new", low, high, NOW + timedelta(hours=1))
    for uid in (high, low):
        with S() as db:
            db.get(DuelRating, uid).games_played = 1
            db.commit()
    by_id = {e["user_id"]: e for e in c.get("/duel/leaderboard").json()["entries"]}
    assert (by_id[low]["wins"], by_id[low]["losses"]) == (1, 0)
    assert (by_id[high]["wins"], by_id[high]["losses"]) == (0, 1)
    week = {e["user_id"]: e for e in c.get("/duel/leaderboard?window=week").json()["entries"]}
    assert week[low]["bounty_change"] == 16 and week[high]["bounty_change"] == -16
    login(c, S, high)
    me = c.get("/duel/rating/me").json()
    assert (me["wins"], me["losses"]) == (0, 1)


def test_yesterdays_arrows_never_use_the_previous_seasons_ratings_1405(client):
    c, S = client
    high, low, _ = three_players(S)
    game(S, "old", high, low, NOW - timedelta(days=3))
    start(S, "soft")
    with S() as db:
        db.get(DuelRating, high).games_played = 1
        db.commit()
    # The season began minutes ago, so there was no board yesterday to move against.
    assert c.get("/duel/leaderboard").json()["entries"][0]["rank_change"] is None


def test_the_rebuilt_board_ignores_games_from_before_the_season_started_1405(client):
    _, S = client
    a, b, c = three_players(S)
    game(S, "prev", c, a, NOW - timedelta(days=5))  # c's only game, played in the season that was reset
    game(S, "this", b, a, NOW - timedelta(days=2))
    cutoff = NOW - timedelta(days=1)
    with S() as db:
        both = board_as_of(db, cutoff)
        this_season = board_as_of(db, cutoff, since=NOW - timedelta(days=3))
    assert set(both) == {a, b, c}
    assert this_season == {b: 1, a: 2}


def test_only_the_admin_can_read_or_start_seasons_1405(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    mod, plain = mk(S, "mod@x.test", "moderator"), mk(S, "p@x.test")
    body = {"mode": "soft", "confirm": "Season 1"}
    assert c.get("/admin/seasons").status_code == 401
    for uid in (mod, plain):
        login(c, S, uid)
        assert c.get("/admin/seasons").status_code == 403
        assert c.post("/admin/seasons", json=body).status_code == 403
    with S() as db:
        assert db.query(DuelSeason).count() == 0
    login(c, S, admin)
    assert c.get("/admin/seasons").status_code == 200
    assert c.post("/admin/seasons", json=body).status_code == 200


def test_starting_a_season_needs_the_current_seasons_name_typed_exactly_1405(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    high, _, _ = three_players(S)
    login(c, S, admin)
    for wrong in ("", "season 1", "Season 2", "Season 1 "):
        r = c.post("/admin/seasons", json={"mode": "hard", "confirm": wrong})
        assert r.status_code == 400, wrong
    assert ratings_of(S)[high] == (1401, 12)
    ok = c.post("/admin/seasons", json={"mode": "hard", "confirm": "Season 1"})
    assert ok.status_code == 200
    assert (ok.json()["number"], ok.json()["name"]) == (2, "Season 2")
    # A double submit repeats the old name, which no longer matches the new current season.
    assert c.post("/admin/seasons", json={"mode": "hard", "confirm": "Season 1"}).status_code == 400
    named = c.post("/admin/seasons", json={"mode": "soft", "confirm": "Season 2", "name": "  Wano  "})
    assert (named.json()["number"], named.json()["name"]) == (3, "Wano")


def test_the_admin_preview_lists_the_top_players_with_both_reset_results_1405(api):
    c, S = api
    admin = mk(S, ADMIN_EMAIL, "admin")
    high, low, _ = three_players(S)
    login(c, S, admin)
    data = c.get("/admin/seasons").json()
    assert data["current"]["players"] == 3 and data["current"]["number"] == 1
    assert [(r["user_id"], r["rating"], r["soft_after"], r["hard_after"]) for r in data["preview"]] == [
        (high, 1401, 1201, 1000),
        (mk_id(S, "mid@x.test"), 1000, 1000, 1000),
        (low, 799, 899, 1000),
    ]


def test_a_later_season_archives_its_own_standings_and_name_1405(client):
    _, S = client
    high, low, _ = three_players(S)
    start(S, "hard", name="Second")
    game(S, "s2", high, low, NOW + timedelta(hours=1), before=1000, after=1016)
    with S() as db:
        db.get(DuelRating, high).games_played = 1
        db.get(DuelRating, high).rating = 1016
        db.commit()
    start(S, "hard")
    with S() as db:
        second = db.query(DuelSeason).filter_by(number=2).one()
        stands = db.query(DuelSeasonStanding).filter_by(season_id=second.id).all()
    assert second.name == "Second" and second.reset_mode == "hard"
    assert [(s.user_id, s.rank, s.rating, s.wins, s.losses) for s in stands] == [(high, 1, 1016, 1, 0)]


def test_past_seasons_are_public_and_each_player_sees_their_own_finishes_1405(client):
    c, S = client
    high, low, _ = three_players(S)
    game(S, "g", high, low, NOW - timedelta(days=2))
    start(S, "soft")
    listing = c.get("/duel/seasons").json()
    assert listing["current"]["number"] == 2 and listing["current"]["name"] == "Season 2"
    assert [(s["number"], s["players"]) for s in listing["past"]] == [(1, 3)]
    board = c.get("/duel/seasons/1/leaderboard").json()
    assert [(e["user_id"], e["rank"], e["rating"], e["wins"], e["losses"]) for e in board["entries"]] == [
        (high, 1, 1401, 1, 0),
        (mk_id(S, "mid@x.test"), 2, 1000, 0, 0),
        (low, 3, 799, 0, 1),
    ]
    assert "email" not in board["entries"][0]
    # The running season has no final standings yet.
    assert c.get("/duel/seasons/2/leaderboard").status_code == 404
    login(c, S, low)
    assert c.get("/duel/seasons/me").json() == [
        {"number": 1, "name": "Season 1", "rank": 3, "rating": 799, "wins": 0, "losses": 1, "provisional": False}
    ]


def test_placement_games_use_the_provisional_k_factor_again_after_a_reset_1405(client):
    c, S = client
    a, b = mk(S, "a@x.test"), mk(S, "b@x.test")
    rate(S, a, 1000, 12)
    rate(S, b, 1000, 12)
    start(S, "hard")
    r = c.post(
        "/duel/matches",
        json={"match_id": "after-reset", "seat0_user_id": a, "seat1_user_id": b, "winner_seat": 0, "reason": "ko", "ranked": True},
        headers={"X-Duel-Ingest-Token": "test-ingest"},
    )
    assert r.status_code == 200, r.text
    # K 40 for a player with fewer than 10 games: an even game moves 20 points (settled K 24 would be 12).
    assert (r.json()["seat0_rating_after"], r.json()["seat1_rating_after"]) == (1020, 980)
