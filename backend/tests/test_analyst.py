"""Log Pose personal connector: tokens and the analyst's reads for one player (#244)."""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.models import AnalystToken, Deck, DeckCard, User
from tests.test_duel import _ingest, client  # noqa: F401  (client is a fixture)


@pytest.fixture()
def analyst(client, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    monkeypatch.setenv("ANALYST_PUBLIC_URL", "https://analyst.example/")
    monkeypatch.setenv("ANALYST_SERVICE_SECRET", "svc-secret")
    get_settings.cache_clear()
    yield client
    get_settings.cache_clear()


def _me_and_token(c) -> tuple[dict, str]:
    me = c.post("/auth/dev-login").json()
    r = c.post("/analyst/token")
    assert r.status_code == 200, r.text
    return me, r.json()["token"]


def test_a_new_link_replaces_the_old_one_and_revoking_ends_it(analyst):
    """Making a link stores only its hash, a new link kills the old one, and revoking ends it (#244)."""
    c, SessionLocal = analyst
    me, first = _me_and_token(c)
    assert c.post("/analyst/token").json()["connector_url"].startswith("https://analyst.example/mcp/u/")
    second_body = c.post("/analyst/token").json()
    second = second_body["token"]
    assert second_body["connector_url"] == f"https://analyst.example/mcp/u/{second}"

    db = SessionLocal()
    try:
        rows = db.query(AnalystToken).all()
        assert len(rows) == 1 and rows[0].user_id == me["id"]
        assert second not in rows[0].token_hash
    finally:
        db.close()

    assert c.get("/analyst/me", headers={"X-Analyst-Token": first}).status_code == 401
    assert c.get("/analyst/me", headers={"X-Analyst-Token": second}).status_code == 200
    assert c.get("/analyst/token").json()["has_token"] is True
    assert c.delete("/analyst/token").status_code == 204
    assert c.get("/analyst/me", headers={"X-Analyst-Token": second}).status_code == 401
    assert c.get("/analyst/token").json()["has_token"] is False


def test_the_analyst_lists_only_the_link_owners_games(analyst):
    """A personal link reads its owner's match history and nobody else's (#244)."""
    c, _ = analyst
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    me, token = _me_and_token(c)
    _ingest(c, "mine", a["user_id"], me["id"], 1)
    _ingest(c, "theirs", a["user_id"], b["user_id"], 0)
    r = c.get("/analyst/matches", headers={"X-Analyst-Token": token})
    assert r.status_code == 200, r.text
    assert [(m["match_id"], m["your_seat"], m["won"]) for m in r.json()["matches"]] == [("mine", 1, True)]
    assert c.get("/analyst/matches").status_code == 401


def test_full_replays_need_the_service_secret_and_a_seat_in_the_game(analyst):
    """Only the analyst service reads a replay, and only for a game the link owner played (#244)."""
    c, _ = analyst
    me, token = _me_and_token(c)
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    b = c.post("/duel/dev-token", json={"user_key": "bob"}).json()
    _ingest(c, "mine", a["user_id"], me["id"], 0, replay={"seed": 5})
    _ingest(c, "theirs", a["user_id"], b["user_id"], 0, replay={"seed": 6})
    user = {"X-Analyst-Token": token}
    service = {**user, "X-Analyst-Service": "svc-secret"}

    assert c.get("/analyst/matches/mine/replay", headers=user).status_code == 403
    assert c.get("/analyst/matches/mine/replay", headers={**user, "X-Analyst-Service": "nope"}).status_code == 403
    assert c.get("/analyst/matches/theirs/replay", headers=service).status_code == 404
    r = c.get("/analyst/matches/mine/replay", headers=service)
    assert r.status_code == 200, r.text
    assert r.json() == {"match_id": "mine", "your_seat": 1, "replay": {"seed": 5}}


def test_replays_stay_closed_without_a_service_secret(client, monkeypatch: pytest.MonkeyPatch):  # noqa: F811
    """With no ANALYST_SERVICE_SECRET set, no header opens a replay (#244)."""
    c, _ = client
    monkeypatch.setenv("ANALYST_SERVICE_SECRET", "")
    get_settings.cache_clear()
    me, token = _me_and_token(c)
    a = c.post("/duel/dev-token", json={"user_key": "alice"}).json()
    _ingest(c, "mine", me["id"], a["user_id"], 0, replay={"seed": 5})
    r = c.get("/analyst/matches/mine/replay", headers={"X-Analyst-Token": token, "X-Analyst-Service": ""})
    assert r.status_code == 503


def test_the_analyst_reads_the_link_owners_planner_decks(analyst):
    """Decks come from the link owner's planner, without cards they need zero of (#244)."""
    c, SessionLocal = analyst
    me, token = _me_and_token(c)
    db = SessionLocal()
    try:
        other = User(email="o@x.com", name="O", google_sub="o")
        db.add(other)
        db.flush()
        mine = Deck(user_id=me["id"], name="Zoro", leader_card_id="OP01-001", sort_order=0)
        mine.cards = [DeckCard(card_id="OP01-016", needed=4), DeckCard(card_id="OP01-006", needed=0)]
        db.add_all([mine, Deck(user_id=other.id, name="Not mine", sort_order=0)])
        db.commit()
    finally:
        db.close()
    r = c.get("/analyst/decks", headers={"X-Analyst-Token": token})
    assert r.status_code == 200, r.text
    decks = r.json()["decks"]
    assert [(d["name"], d["leader_id"], d["cards"]) for d in decks] == [
        ("Zoro", "OP01-001", [{"id": "OP01-016", "copies": 4}])
    ]
