"""Imported OPTCGSim games: owner-only reads, dedupe and name scrubbing (#1030)."""

from __future__ import annotations

from app.duel.models import SimGame
from tests.test_analyst import _me_and_token, analyst  # noqa: F401  (fixture)
from tests.test_analyst_access import _as, _player
from tests.test_duel import client  # noqa: F401  (fixture)

ZW = "​"
ME = f"AlphaName{ZW}#111"
OPP = f"BetaName{ZW}#222"


def _record(key: str = "k" * 16, **over) -> dict:
    log = (
        f"RZ1|HDR|1.0|1|1\\nRZ1|PLY|1|{ME}|OP17-039\\nRZ1|PLY|2|{OPP}|OP09-062\\n"
        f"[{ME}] Chose to go First\\n[{OPP}] Mulligan\\n[AlphaName#111] End Turn"
    ).replace("\\n", "\n")
    rec = {
        "matchKey": key,
        "date": "Fri, 28 Aug 2026 23:59:19 GMT",
        "decklist": ["4xOP17-040", "2xOP17-041"],
        "oppDecklist": ["4xOP09-064"],
        "playerLeader": "OP17-039",
        "oppLeader": "OP09-062",
        "playerName": ME,
        "oppPlayerName": OPP,
        "result": "Won",
        "turnNumber": 7,
        "turnOrder": 0,
        "combatLog": log,
    }
    rec.update(over)
    return rec


def _import(c, *games, headers=None):
    return c.post("/analyst/sim-games/import", json={"games": list(games)}, headers=headers or {})


def test_another_player_cannot_read_or_delete_my_imported_game_1030(analyst):
    c, SessionLocal = analyst
    _me_and_token(c)
    imported = _import(c, _record()).json()
    assert imported["imported"] == 1
    game_id = c.get("/analyst/sim-games").json()["games"][0]["id"]
    assert c.get(f"/analyst/sim-games/{game_id}").status_code == 200

    _as(c, _player(SessionLocal, "intruder"))
    assert c.get(f"/analyst/sim-games/{game_id}").status_code == 404
    assert c.get("/analyst/sim-games").json() == {"games": [], "total": 0}
    assert c.get("/analyst/sim-games/matchups").json() == {"matchups": []}
    assert c.delete(f"/analyst/sim-games/{game_id}").status_code == 404
    assert c.delete("/analyst/sim-games").json() == {"deleted": 0}

    db = SessionLocal()
    try:
        assert db.query(SimGame).count() == 1
    finally:
        db.close()


def test_a_connector_token_reads_only_its_owners_games_1030(analyst):
    c, SessionLocal = analyst
    _, token = _me_and_token(c)
    _import(c, _record())
    c.cookies.clear()
    other = _player(SessionLocal, "other")
    _as(c, other)
    _import(c, _record(key="z" * 16))
    c.cookies.clear()
    rows = c.get("/analyst/sim-games", headers={"X-Analyst-Token": token}).json()
    assert rows["total"] == 1 and len(rows["games"]) == 1
    other_id = None
    db = SessionLocal()
    try:
        other_id = db.query(SimGame).filter(SimGame.user_id == other).one().id
    finally:
        db.close()
    assert c.get(f"/analyst/sim-games/{other_id}", headers={"X-Analyst-Token": token}).status_code == 404


def test_importing_the_same_game_twice_skips_it_1030(analyst):
    c, _ = analyst
    _me_and_token(c)
    first = _import(c, _record(), _record(), _record(key="b" * 16)).json()
    assert first == {"imported": 2, "skipped_duplicates": 1, "skipped_invalid": 0, "total": 3}
    again = _import(c, _record()).json()
    assert again["imported"] == 0 and again["skipped_duplicates"] == 1


def test_two_players_can_import_the_same_match_key_1030(analyst):
    c, SessionLocal = analyst
    _me_and_token(c)
    _import(c, _record())
    _as(c, _player(SessionLocal, "second"))
    assert _import(c, _record()).json()["imported"] == 1


def test_unusable_records_are_counted_not_stored_1030(analyst):
    c, _ = analyst
    _me_and_token(c)
    bad = [_record(key="c" * 16, result="Draw"), _record(key="d" * 16, decklist=[]), _record(key="e" * 16, playerName=""), _record(key="f" * 16, decklist=["nope"])]
    body = _import(c, *bad, _record(key="g" * 16, combatLog=None)).json()
    assert body["imported"] == 1 and body["skipped_invalid"] == 4
    row = c.get("/analyst/sim-games").json()["games"][0]
    assert row["has_log"] is False


def test_player_and_opponent_names_are_never_stored_1030(analyst):
    c, SessionLocal = analyst
    _me_and_token(c)
    _import(c, _record())
    db = SessionLocal()
    try:
        row = db.query(SimGame).one()
        stored = (row.combat_log or "") + repr([getattr(row, col.name) for col in SimGame.__table__.columns])
    finally:
        db.close()
    for fragment in ("AlphaName", "BetaName", "#111", "#222", ZW):
        assert fragment not in stored
    assert "Me#1" in stored and "Opp#2" in stored


def test_list_hides_the_log_and_matchups_count_results_1030(analyst):
    c, _ = analyst
    _me_and_token(c)
    _import(c, _record(), _record(key="d" * 16), _record(key="b" * 16, result="Lost"), _record(key="c" * 16, oppLeader="OP01-001"))
    listing = c.get("/analyst/sim-games").json()
    assert listing["total"] == 4 and all("combat_log" not in g for g in listing["games"])
    ups = {(m["my_leader"], m["opp_leader"]): m for m in c.get("/analyst/sim-games/matchups").json()["matchups"]}
    assert ups[("OP17-039", "OP09-062")] == {"my_leader": "OP17-039", "opp_leader": "OP09-062", "games": 3, "wins": 2, "losses": 1}
    gid = listing["games"][0]["id"]
    assert "Me#1" in c.get(f"/analyst/sim-games/{gid}").json()["combat_log"]


def test_delete_one_and_clear_all_1030(analyst):
    c, _ = analyst
    _me_and_token(c)
    _import(c, _record(), _record(key="b" * 16), _record(key="c" * 16))
    gid = c.get("/analyst/sim-games").json()["games"][0]["id"]
    assert c.delete(f"/analyst/sim-games/{gid}").status_code == 204
    assert c.get("/analyst/sim-games").json()["total"] == 2
    assert c.delete("/analyst/sim-games").json() == {"deleted": 2}
    assert c.get("/analyst/sim-games").json()["total"] == 0


def test_import_needs_a_signed_in_player_1030(analyst):
    c, _ = analyst
    c.cookies.clear()
    assert _import(c, _record()).status_code == 401
    assert c.get("/analyst/sim-games").status_code == 401
