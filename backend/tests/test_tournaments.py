"""Limitless TCG tournament sync and stats for Log Pose (#397). HTTP is mocked with real-shaped responses."""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tournament_sync as ts
from app.config import Settings
from app.models import Tournament, TournamentDeck, TournamentGame
from app.tournament_stats import tournament_stats
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_duel import client  # noqa: F401  (fixture)

Z, P, L = "OP01-001", "OP08-058", "OP05-060"
SERVICE = {"X-Analyst-Service": "svc-secret"}
ABSENT = object()


def ago(days: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _card(set_: str, number: str, count: int) -> dict:
    return {"count": count, "name": f"Card {set_}-{number}", "set": set_, "number": number}


def _decklist(leader: str, cards: dict[str, int]) -> dict:
    """The Limitless decklist shape: leader, then characters, events and stages by section."""
    ls, ln = leader.split("-")
    sections: dict[str, list] = {"character": [], "event": [], "stage": []}
    for key, n in cards.items():
        section, _, cid = key.rpartition(":")
        s, num = cid.split("-")
        sections[section or "character"].append(_card(s, num, n))
    return {"leader": {"name": "Leader", "set": ls, "number": ln}, **sections}


def entrant(handle: str, leader: str, cards: dict[str, int] | None = None, record=(0, 0, 0), placing=None, listed=True) -> dict:
    return {
        "name": f"Real Name {handle}",
        "country": "GB",
        "player": handle,
        "placing": placing,
        "record": {"wins": record[0], "losses": record[1], "ties": record[2]},
        "drop": None,
        "deck": {"id": leader, "name": "Some Leader"},
        "decklist": _decklist(leader, cards or {}) if listed else None,
    }


def pairing(rnd: int, p1: str, p2: str | None, winner=ABSENT, table: int = 1) -> dict:
    row = {"round": rnd, "phase": 1, "table": table, "player1": p1}
    if p2 is not None:
        row["player2"] = p2
    if winner is not ABSENT:
        row["winner"] = winner
    return row


def event(eid: str, name: str, date: datetime, players: int, standings, pairings, public=True, decklists=True) -> dict:
    return {
        "listing": {"game": "OP", "name": name, "date": date.isoformat().replace("+00:00", "Z"), "format": None, "id": eid, "players": players, "organizerId": 7},
        "details": {"id": eid, "name": name, "date": date.isoformat(), "players": players, "organizer": {"id": 7, "name": "Org"}, "platform": "SIM", "decklists": decklists, "isPublic": public, "isOnline": True, "phases": [{"phase": 1, "type": "SWISS", "rounds": 3, "mode": "BO1"}]},
        "standings": standings,
        "pairings": pairings,
    }


class FakeLimitless:
    """The Limitless API over httpx.MockTransport; `calls` lists every path requested."""

    def __init__(self, events: list[dict]) -> None:
        self.events = {e["listing"]["id"]: e for e in events}
        self.calls: list[str] = []
        self.http = httpx.Client(transport=httpx.MockTransport(self._handle))

    def client(self, **kw) -> ts.LimitlessClient:
        return ts.LimitlessClient(self.http, interval=0, sleep=lambda _s: None, **kw)

    def _handle(self, req: httpx.Request) -> httpx.Response:
        path = req.url.path.removeprefix("/api")
        self.calls.append(path)
        if path == "/tournaments":
            listing = sorted((e["listing"] for e in self.events.values()), key=lambda x: x["date"], reverse=True)
            size, page = int(req.url.params["limit"]), int(req.url.params["page"])
            return httpx.Response(200, json=listing[(page - 1) * size : page * size])
        _, _, eid, part = path.split("/")
        return httpx.Response(200, json=self.events[eid][part])


def meta_events() -> list[dict]:
    """E1: 4 Zoro and 4 Pudding entrants with 11 finished games. E2: 3 Zoro (one hid his list) and 6 Lucci. E3: too old for 30 days."""
    z = [("z1", {"OP01-A": 4, "OP01-B": 2, "event:OP01-050": 3, "stage:OP01-060": 1}, 1), ("z2", {"OP01-A": 4}, 2), ("z3", {"OP01-A": 3, "OP01-C": 1}, None), ("z4", {"OP01-A": 4}, 5)]
    e1 = [entrant(h, Z, c, placing=pl) for h, c, pl in z] + [entrant(f"p{i}", P, {"OP08-X": 4}, placing=i + 10) for i in range(1, 5)]
    e1_pairs = [
        pairing(1, "z1", "p1", "z1", 1), pairing(1, "z2", "p2", "z2", 2), pairing(1, "p3", "z3", "p3", 3), pairing(1, "z4", "p4", "z4", 4),
        pairing(2, "p1", "z2", "z2", 1), pairing(2, "p2", "z1", "z1", 2), pairing(2, "z3", "p4", "z3", 3), pairing(2, "p3", "z4", "p3", 4),
        pairing(3, "z1", "z2", "z1", 1),  # Zoro mirror
        pairing(3, "p1", "p2", "p1", 2),  # Pudding mirror
        pairing(3, "z3", "p3", 0, 3),  # a tie
        pairing(3, "z4", "p4", ABSENT, 4),  # not finished yet
        pairing(3, "p4", None, "p4", 5),  # a bye
    ]
    e2 = [entrant("z5", Z, {"OP01-A": 4}, placing=1), entrant("z6", Z, {"OP01-B": 4}, placing=3), entrant("z7", Z, listed=False)] + [entrant(f"l{i}", L, {"OP05-Y": 2}) for i in range(1, 7)]
    e2_pairs = [pairing(1, "z5", "l1", "z5"), pairing(1, "l2", "z6", "l2")]
    old = [entrant("o1", L, {"OP05-Y": 4}, placing=1)] + [entrant(f"o{i}", L, {"OP05-Y": 4}) for i in range(2, 9)]
    return [
        event("e1", "[OP17.5] ChinoizeCup #119", ago(5), 8, e1, e1_pairs),
        event("e2", "Weekly Cup", ago(3), 16, e2, e2_pairs),
        event("e3", "[OP16] Old Cup", ago(40), 8, old, []),
    ]


def seed(SessionLocal, events=None, days=60) -> FakeLimitless:
    api = FakeLimitless(events or meta_events())
    db = SessionLocal()
    try:
        ts.sync_tournaments(db, api.client(), days=days)
    finally:
        db.close()
    return api


def _stats(c, **params):
    r = c.get("/analyst/tournaments/stats", params=params, headers=SERVICE)
    assert r.status_code == 200, r.text
    return r.json()


# ——— ingest ———


def test_ingest_reads_set_label_card_ids_and_results_from_a_real_shaped_event_397(db: Session):
    """An event is stored with its set label, card ids merged across sections, and who beat which leader (#397)."""
    api = FakeLimitless(meta_events()[:1])
    ts.sync_tournaments(db, api.client())
    t = db.get(Tournament, "e1")
    assert (t.name, t.set_label, t.players, t.online, t.platform) == ("[OP17.5] ChinoizeCup #119", "OP17.5", 8, True, "SIM")
    z1 = db.scalar(select(TournamentDeck).where(TournamentDeck.tournament_id == "e1", TournamentDeck.placing == 1))
    assert (z1.leader_id, json.loads(z1.decklist)) == (Z, {"OP01-A": 4, "OP01-B": 2, "OP01-050": 3, "OP01-060": 1})
    z3 = [d for d in db.scalars(select(TournamentDeck)) if "OP01-C" in d.decklist][0]
    assert z3.placing is None
    games = db.scalars(select(TournamentGame).order_by(TournamentGame.id)).all()
    # 13 pairings: a bye and an unfinished table are left out.
    assert len(games) == 11
    assert [(g.leader_a, g.leader_b, g.winner) for g in games[:3]] == [(Z, P, "A"), (Z, P, "A"), (P, Z, "A")]
    assert [(g.leader_a, g.leader_b, g.winner) for g in games[-3:]] == [(Z, Z, "A"), (P, P, "A"), (Z, P, "tie")]


def test_set_label_comes_from_a_set_prefix_only_397():
    """Only a bracketed set code names the set; country tags and plain names do not (#397)."""
    assert ts.set_label("[OP17.5] ChinoizeCup") == "OP17.5"
    assert ts.set_label("[OP17 NEW BANNED] Rumble league") == "OP17"
    assert ts.set_label("[GER] Dressrosa Tournament-OP17") is None
    assert ts.set_label("Liga Phoenix") is None


def test_no_player_names_or_handles_are_stored_397(db: Session):
    """Names and handles from standings are used to join pairings and never reach any table (#397)."""
    api = FakeLimitless(meta_events()[:2])
    ts.sync_tournaments(db, api.client())
    dump = json.dumps(
        [
            [{c.name: str(getattr(row, c.name)) for c in row.__table__.columns} for row in db.scalars(select(model)).all()]
            for model in (Tournament, TournamentDeck, TournamentGame)
        ]
    )
    assert '"decklist"' in dump and "OP01-A" in dump
    assert "Real Name" not in dump
    for handle in ("z1", "p3", "l2", "z5"):
        assert handle not in dump


def test_a_tie_is_not_a_win_for_either_side_and_a_missing_winner_is_not_a_game_397():
    """Winner 0 or -1 is a tie; a handle is a side; no winner yet is skipped; byes are skipped (#397)."""
    stands = [entrant("a", Z), entrant("b", P)]
    for w, expected in (("a", "A"), ("b", "B"), (0, "tie"), (-1, "tie"), (ABSENT, None), (None, None), ("nobody", None)):
        _decks, games = ts.parse_event(stands, [pairing(1, "a", "b", w)])
        assert [g["winner"] for g in games] == ([expected] if expected else [])
    assert ts.parse_event(stands, [pairing(1, "a", None, "a")])[1] == []
    assert ts.parse_event(stands, [pairing(1, "a", "ghost", "a")])[1] == []


def test_a_deck_without_a_decklist_still_counts_for_its_leader_397():
    """Entrants who hid their list keep their leader (from the deck id) and join pairings; the list is empty (#397)."""
    decks, games = ts.parse_event([entrant("a", Z, listed=False), entrant("b", P)], [pairing(1, "a", "b", "b")])
    assert [(d["leader_id"], d["decklist"]) for d in decks] == [(Z, {}), (P, {})]
    assert [(g["leader_a"], g["winner"]) for g in games] == [(Z, "B")]


# ——— sync ———


def test_resyncing_an_event_replaces_its_rows_instead_of_doubling_them_397(db: Session):
    """Pulling a recent event again leaves one copy of every row, and picks up changes (#397)."""
    events = meta_events()[:1]
    events[0]["listing"]["date"] = ago(1).isoformat()  # young enough to be pulled again
    api = FakeLimitless(events)
    ts.sync_tournaments(db, api.client())
    first = ts.sync_status(db)
    assert (first["events"], first["decks"], first["games"]) == (1, 8, 11)
    events[0]["pairings"].append(pairing(3, "z4", "p4", "z4", 4))
    summary = ts.sync_tournaments(db, api.client())
    assert summary["synced"] == 1
    again = ts.sync_status(db)
    assert (again["events"], again["decks"], again["games"]) == (1, 8, 12)


def test_sync_skips_events_that_are_small_old_private_or_without_decklists_397(db: Session):
    """Only public events with decklists and at least 8 players inside the window are stored (#397)."""
    ok = meta_events()[0]
    small = event("small", "Small", ago(1), 7, [], [])
    private = event("private", "Private", ago(1), 20, [], [], public=False)
    nolists = event("nolists", "No lists", ago(1), 20, [], [], decklists=False)
    old = event("old", "Old", ago(45), 20, [entrant("a", Z)], [])
    api = FakeLimitless([ok, small, private, nolists, old])
    summary = ts.sync_tournaments(db, api.client(), days=30)
    assert [t.id for t in db.scalars(select(Tournament))] == ["e1"]
    assert (summary["synced"], summary["ineligible"]) == (1, 2)
    assert not any("small" in c or "old" in c for c in api.calls)


def test_sync_does_not_refetch_an_event_that_finished_long_ago_but_refetches_a_young_one_397(db: Session):
    """An event synced two days after it was played is complete; a younger one is pulled again (#397)."""
    old, young = meta_events()[0], meta_events()[1]  # played 5 and 3 days ago
    api = FakeLimitless([old, young])
    ts.sync_tournaments(db, api.client())
    api.calls.clear()
    ts.sync_tournaments(db, api.client())
    assert not any(c.startswith("/tournaments/e") for c in api.calls)

    recent = event("fresh", "Fresh", ago(0.5), 8, [entrant("a", Z)], [])
    api2 = FakeLimitless([recent])
    ts.sync_tournaments(db, api2.client())
    api2.calls.clear()
    ts.sync_tournaments(db, api2.client())
    assert "/tournaments/fresh/standings" in api2.calls


def test_sync_pages_through_the_listing_until_it_passes_the_window_397(db: Session):
    """More than one page of events are all read, and paging stops at the first event older than the window (#397)."""
    many = [event(f"x{i}", f"Cup {i}", ago(1 + i * 0.01), 8, [entrant("a", Z)], []) for i in range(60)]
    api = FakeLimitless(many + [event("ancient", "Ancient", ago(100), 8, [], [])])
    summary = ts.sync_tournaments(db, api.client(), days=30)
    assert summary["synced"] == 60
    assert api.calls.count("/tournaments") == 2


def test_one_broken_event_does_not_stop_the_run_397(db: Session):
    """An event whose pairings fail is counted as failed and the others still sync (#397)."""
    good, bad = meta_events()[0], meta_events()[1]
    bad["pairings"] = "not a list"
    del bad["standings"]
    api = FakeLimitless([good, bad])
    summary = ts.sync_tournaments(db, api.client())
    assert (summary["synced"], summary["failed"]) == (1, 1)
    assert [t.id for t in db.scalars(select(Tournament))] == ["e1"]


# ——— throttling ———


def test_requests_are_spaced_by_the_interval_397():
    """Back-to-back requests wait out the rest of the interval (#397)."""
    now = [100.0]
    slept: list[float] = []

    def sleep(s: float) -> None:
        slept.append(s)
        now[0] += s

    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[])))
    c = ts.LimitlessClient(http, interval=7, sleep=sleep, clock=lambda: now[0])
    c.get("/tournaments")
    now[0] += 2
    c.get("/tournaments")
    assert slept == [5]


def test_a_429_is_waited_out_then_retried_and_gives_up_after_the_retries_397():
    """429 waits for Retry-After (or backs off) and retries; endless 429s raise RateLimited (#397)."""
    slept: list[float] = []
    answers = [httpx.Response(429, headers={"retry-after": "42"}), httpx.Response(429), httpx.Response(200, json=[{"id": "x"}])]
    http = httpx.Client(transport=httpx.MockTransport(lambda r: answers.pop(0)))
    c = ts.LimitlessClient(http, interval=0, sleep=slept.append)
    assert c.get("/tournaments") == [{"id": "x"}]
    assert slept == [42, 60]

    always = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(429)))
    c2 = ts.LimitlessClient(always, interval=0, retries=2, sleep=lambda _s: None)
    with pytest.raises(ts.RateLimited):
        c2.get("/tournaments")
    assert c2.requests == 3


def test_a_rate_limited_run_stops_and_says_so_397(db: Session):
    """When Limitless keeps refusing, the run ends, reports rate_limited and keeps what it stored (#397)."""
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(429)))
    summary = ts.sync_tournaments(db, ts.LimitlessClient(http, interval=0, retries=1, sleep=lambda _s: None))
    assert summary["rate_limited"] is True and summary["synced"] == 0


def test_a_429_in_the_middle_of_a_run_ends_the_run_not_just_the_event_397(db: Session):
    """A 429 that outlasts the retries on one event stops the run (rate_limited) rather than counting as one failed event (#397)."""
    api = FakeLimitless(meta_events()[:2])

    def handle(req: httpx.Request) -> httpx.Response:
        return httpx.Response(429) if req.url.path.endswith("/details") else api._handle(req)

    http = httpx.Client(transport=httpx.MockTransport(handle))
    summary = ts.sync_tournaments(db, ts.LimitlessClient(http, interval=0, retries=1, sleep=lambda _s: None))
    assert (summary["rate_limited"], summary["failed"], summary["synced"]) == (True, 0, 0)


def test_the_app_starts_the_sync_task_with_the_lifespan_and_stops_it_on_shutdown_397(client, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    """With the flag on the app runs the sync loop while it is up and cancels it at shutdown (#397)."""
    from fastapi.testclient import TestClient

    from app import main

    events: list[str] = []

    async def fake_loop(run, **_kw):
        events.append("started")
        try:
            await asyncio.sleep(3)
        except asyncio.CancelledError:
            events.append("cancelled")
            raise
        events.append("ran out")

    monkeypatch.setattr(main.settings, "tournament_sync", True)
    monkeypatch.setattr(ts, "sync_loop", fake_loop)
    with TestClient(main.app):
        for _ in range(100):
            if events:
                break
            time.sleep(0.01)
        assert events == ["started"]
    assert events == ["started", "cancelled"]


# ——— background task ———


def test_the_sync_loop_survives_a_run_that_crashes_397():
    """A run that raises is logged and the loop runs again (#397)."""
    calls: list[int] = []

    def run():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("boom")

    async def go():
        task = asyncio.create_task(ts.sync_loop(run, first_delay=0, interval=0.01))
        for _ in range(100):
            if len(calls) >= 2:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        assert not task.done() or task.cancelled()

    asyncio.run(go())
    assert len(calls) >= 2


def test_tournament_sync_is_on_in_production_and_off_elsewhere_unless_set_397():
    """Unset, the flag follows production; TOURNAMENT_SYNC overrides either way (#397)."""
    prod = {"frontend_origin": "https://app.example"}
    assert Settings(**prod).tournament_sync_enabled is True
    assert Settings().tournament_sync_enabled is False
    assert Settings(**prod, tournament_sync=False).tournament_sync_enabled is False
    assert Settings(tournament_sync=True).tournament_sync_enabled is True


def test_the_background_task_only_starts_when_the_flag_is_on_397():
    """start_background makes a task for an enabled setting and nothing otherwise (#397)."""

    async def go():
        assert ts.start_background(Settings(tournament_sync=False)) is None
        task = ts.start_background(Settings(tournament_sync=True))
        assert task is not None
        task.cancel()

    asyncio.run(go())


# ——— stats ———


def test_matchup_record_follows_the_leader_whichever_side_it_sat_on_397(analyst):  # noqa: F811
    """Zoro beat Pudding in 6 of 8 decisive games whether Zoro was player 1 or 2; Pudding's record is the reverse; ties are apart (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, leader=Z, opponent=P)
    assert (s["games"], s["wins"], s["win_rate"], s["ties"], s["too_few_games"]) == (8, 6, 0.75, 1, False)
    assert s["interval"] == [0.409, 0.929]
    assert s["source"] == "Limitless TCG tournaments"
    other = _stats(c, leader=P, opponent=Z)
    assert (other["games"], other["wins"], other["ties"]) == (8, 2, 1)


def test_mirrors_are_kept_out_of_a_leaders_record_and_counted_on_their_own_397(analyst):  # noqa: F811
    """A mirror is neither a win nor a loss for the leader; overview and matchup views both report it (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, leader=Z)
    assert s["mirror_games"] == 1
    assert (s["overall"]["games"], s["overall"]["wins"]) == (10, 7)  # 8 against Pudding (6 wins) and 2 against Lucci (1 win)
    assert {o["opponent"] for o in s["opponents"]} == {P, L}
    mirror = _stats(c, leader=Z, opponent=Z)
    assert (mirror["mirror"], mirror["games"]) == (True, 1)
    assert "win_rate" not in mirror and "wins" not in mirror


def test_a_matchup_under_five_games_gives_only_its_game_count_397(analyst):  # noqa: F811
    """Two games of Zoro against Lucci are marked too_few_games, with no wins or rate (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, leader=Z, opponent=L)
    assert (s["games"], s["wins"], s["win_rate"], s["interval"], s["too_few_games"]) == (2, None, None, None, True)
    row = next(o for o in _stats(c, leader=Z)["opponents"] if o["opponent"] == L)
    assert (row["games"], row["wins"], row["too_few_games"]) == (2, None, True)


def test_a_leaders_opponents_are_listed_most_games_first_397(analyst):  # noqa: F811
    """Zoro played Pudding 8 times and Lucci twice, so Pudding comes first though Lucci sorts first by number (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    assert [(o["opponent"], o["games"]) for o in _stats(c, leader=Z)["opponents"]] == [(P, 8), (L, 2)]


def test_meta_share_is_a_leaders_decks_over_all_decks_in_the_window_397(analyst):  # noqa: F811
    """Zoro is 7 of 17 decks in the two recent events; the ancient event is outside 30 days (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, leader=Z, days=30)
    assert s["meta"] == {"decks": 7, "total_decks": 17, "share": 0.412}
    assert [e["id"] for e in s["events"]] == ["e2", "e1"]
    assert [e["id"] for e in _stats(c, leader=L, days=30)["events"]] == ["e2"]
    wide = _stats(c, leader=Z, days=60)
    assert wide["meta"]["total_decks"] == 25


def test_without_a_leader_every_leader_gets_a_share_and_a_record_397(analyst):  # noqa: F811
    """The overview lists leaders by deck count with shares that add up, and a record from their games (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, days=30)
    assert (s["total_decks"], s["total_games"]) == (17, 13)
    shares = {r["leader"]: r["share"] for r in s["leaders"]}
    assert shares == {Z: 0.412, L: 0.353, P: 0.235}
    pud = next(r for r in s["leaders"] if r["leader"] == P)
    assert (pud["games"], pud["wins"]) == (8, 2)
    assert s["top_win_rate"] == []


def test_the_top_leaders_by_win_rate_need_a_minimum_sample_397(db: Session):
    """Leaders under the ranking minimum are left out, and the rest are ordered by win rate (#397)."""
    db.add(Tournament(id="t", name="Cup", date=ago(1), players=32, synced_at=ago(0)))
    db.flush()

    def games(a: str, b: str, a_wins: int, total: int):
        for i in range(total):
            db.add(TournamentGame(tournament_id="t", round=1, leader_a=a, leader_b=b, winner="A" if i < a_wins else "B"))

    games("OP01-001", "OP09-001", 20, 25)  # 80%
    games("OP02-001", "OP09-001", 11, 20)  # 55%
    games("OP03-001", "OP09-001", 5, 5)  # 100% but only 5 games: not ranked
    for lid in ("OP01-001", "OP02-001", "OP03-001", "OP09-001"):
        db.add(TournamentDeck(tournament_id="t", leader_id=lid))
    db.commit()
    s = tournament_stats(db, None, None, 30, 8)
    assert [r["leader"] for r in s["top_win_rate"]] == ["OP01-001", "OP02-001", "OP09-001"]
    assert s["top_win_rate"][0]["win_rate"] == 0.8


def test_card_inclusion_counts_the_leaders_decklists_397(analyst):  # noqa: F811
    """A card's rate is the share of the leader's decklists that include it, with its average copies (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = _stats(c, leader=Z, days=30)
    assert (s["decklists"], s["too_few_decks"], s["meta"]["decks"]) == (6, False, 7)
    cards = {x["id"]: x for x in s["cards"]}
    assert (cards["OP01-A"]["decks"], cards["OP01-A"]["rate"], cards["OP01-A"]["average_copies"]) == (5, 0.833, 3.8)
    assert (cards["OP01-B"]["decks"], cards["OP01-B"]["rate"], cards["OP01-B"]["average_copies"]) == (2, 0.333, 3.0)
    assert [x["id"] for x in s["cards"]][0] == "OP01-A"
    assert "OP08-X" not in cards


def test_top_placings_are_the_best_finishes_with_event_record_and_list_397(analyst):  # noqa: F811
    """Best placing first (bigger event on a tie), dropped entrants left out, each with its event, record and list (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    top = _stats(c, leader=Z, days=30)["top_placings"]
    assert [(t["event_id"], t["placing"]) for t in top] == [("e2", 1), ("e1", 1), ("e1", 2), ("e2", 3), ("e1", 5)]
    assert top[0]["decklist"] == {"OP01-A": 4}
    assert top[0]["players"] == 16 and top[0]["event"] == "Weekly Cup"
    assert top[1]["decklist"] == {"OP01-A": 4, "OP01-B": 2, "OP01-050": 3, "OP01-060": 1}


def test_days_and_min_players_narrow_the_events_397(analyst):  # noqa: F811
    """min_players leaves out smaller events; days leaves out older ones (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    big = _stats(c, leader=Z, min_players=10)
    assert [e["id"] for e in big["events"]] == ["e2"]
    assert big["meta"]["total_decks"] == 9
    assert [t["placing"] for t in big["top_placings"]] == [1, 3]
    assert _stats(c, days=1)["total_decks"] == 0


def test_a_leaders_view_of_a_window_whose_only_event_has_no_decks_answers_with_zero_share_405(analyst):  # noqa: F811
    """A just-started event is stored with empty standings; the leader view must not divide by zero (#405)."""
    c, SessionLocal = analyst
    seed(SessionLocal, [event("e9", "Live Cup", ago(0.1), 32, [], [])])
    out = _stats(c, leader=Z, days=7)
    assert out["meta"] == {"decks": 0, "total_decks": 0, "share": 0.0}
    assert out["events"] == []


def test_stats_and_sync_status_are_for_the_analyst_service_only_397(analyst):  # noqa: F811
    """Both endpoints refuse a missing or wrong service secret (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    for path in ("/analyst/tournaments/stats", "/analyst/tournaments/sync-status"):
        assert c.get(path).status_code == 403
        assert c.get(path, headers={"X-Analyst-Service": "wrong"}).status_code == 403
        assert c.get(path, headers=SERVICE).status_code == 200
    assert c.get("/analyst/tournaments/stats?opponent=OP01-001", headers=SERVICE).status_code == 400


def test_sync_status_reports_what_is_stored_and_the_last_run_397(analyst):  # noqa: F811
    """Counts of events, decks and games, and the last run's summary (#397)."""
    c, SessionLocal = analyst
    seed(SessionLocal)
    s = c.get("/analyst/tournaments/sync-status", headers=SERVICE).json()
    assert (s["events"], s["decks"], s["games"]) == (3, 25, 13)
    assert (s["last_run"]["synced"], s["last_run"]["games"], s["last_run"]["rate_limited"]) == (3, 13, False)
