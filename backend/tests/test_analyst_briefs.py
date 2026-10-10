"""Log Pose matchup briefs: the game-server ticket, the shared cache and the spend cap (#401)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.brief_tickets import verify_brief_ticket
from app.config import get_settings
from app.game_tokens import game_token_secret, mint_game_token
from app.models import AnalystMatchBrief
from tests.test_analyst import analyst  # noqa: F401  (fixture)
from tests.test_analyst_chat import _as, _session, chat  # noqa: F401  (fixtures)
from tests.test_duel import client  # noqa: F401  (fixture)

VECTOR = json.loads((Path(__file__).parent / "fixtures" / "brief_ticket_vector.json").read_text())

DECK = ["OP01-016"] * 4 + ["ST01-006"] * 4 + ["ST01-008"] * 2
LEADER, OPPONENT = "OP01-001", "OP05-098"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _ticket(*, deck=None, ranked=False, purpose="match_brief", exp=None, salted=True, leader=LEADER, opponent=OPPONENT) -> str:
    """What the game server's mintBriefTicket signs, built independently here."""
    payload = {
        "p": purpose,
        "mid": "room-1",
        "seat": 0,
        "ranked": ranked,
        "leader": leader,
        "opponent": opponent,
        "deck": deck if deck is not None else DECK,
        "exp": exp if exp is not None else int(time.time()) + 3600,
    }
    body = _b64(json.dumps(payload).encode())
    secret = game_token_secret(get_settings())
    key = ("match-brief:" if salted else "") + secret
    sig = _b64(hmac.new(key.encode(), body.encode(), hashlib.sha256).digest())
    return f"mb1.{body}.{sig}"


def _lookup(c, token: str, ticket: str, variant: str = "v1:OP14", service: bool = True):
    headers = _as(token) if service else {"X-Analyst-Token": token}
    return c.post("/analyst/briefs/lookup", json={"ticket": ticket, "variant": variant}, headers=headers)


def _put(c, token: str, ticket: str, text: str = "Plan.", variant: str = "v1:OP14", citations=None):
    return c.put(
        "/analyst/briefs",
        json={"ticket": ticket, "variant": variant, "text": text, "citations": citations or []},
        headers=_as(token),
    )


def test_a_ranked_ticket_gets_no_brief(chat):
    """A ticket that says ranked is refused by both routes, even when it is correctly signed (#401)."""
    c, _ = chat
    _, body = _session(c)
    ranked = _ticket(ranked=True)
    assert _lookup(c, body["token"], ranked).status_code == 403
    assert _put(c, body["token"], ranked).status_code == 403
    assert _lookup(c, body["token"], _ticket()).status_code == 200


def test_a_game_token_is_not_a_brief_ticket(chat):
    """A game token, a ticket signed with the bare secret and a ticket for another purpose are all refused (#401)."""
    c, _ = chat
    me, body = _session(c)
    game = mint_game_token(user_id=me["id"])["token"]
    assert _lookup(c, body["token"], "mb1." + game).status_code == 403
    # Ticket-shaped, but signed with the game-token secret itself.
    assert _lookup(c, body["token"], _ticket(salted=False)).status_code == 403
    # Signed with the brief key, but not a brief.
    assert _lookup(c, body["token"], _ticket(purpose="game")).status_code == 403


def test_the_backend_accepts_the_shared_ticket_vector(monkeypatch):
    """The ticket the game server signs for the fixed vector verifies here, and nothing else does (#401)."""
    monkeypatch.setenv("GAME_TOKEN_SECRET", VECTOR["secret"])
    get_settings.cache_clear()
    try:
        settings = get_settings()
        claims = verify_brief_ticket(VECTOR["ticket"], settings, VECTOR["now"])
        assert claims is not None
        assert claims.leader == VECTOR["claims"]["leader"]
        assert claims.opponent == VECTOR["claims"]["opponent"]
        assert list(claims.deck) == VECTOR["claims"]["deck"]
        assert verify_brief_ticket(VECTOR["ticket"], settings, VECTOR["now"] + 4 * 3600) is None
    finally:
        get_settings.cache_clear()


def test_a_tampered_or_expired_ticket_is_refused(chat):
    """Changing the signed body, the signature, or the time all end in 403 (#401)."""
    c, _ = chat
    _, body = _session(c)
    good = _ticket()
    assert _lookup(c, body["token"], good).status_code == 200
    prefix, payload, sig = good.split(".")
    other = _ticket(leader="ST01-001").split(".")[1]
    assert _lookup(c, body["token"], f"{prefix}.{other}.{sig}").status_code == 403
    # Change the first character: the last one carries padding bits, and a random signature can already end in the replacement.
    bad = ("B" if sig[0] != "B" else "C") + sig[1:]
    assert _lookup(c, body["token"], f"{prefix}.{payload}.{bad}").status_code == 403
    assert _lookup(c, body["token"], _ticket(exp=int(time.time()) - 5)).status_code == 403


def test_briefs_are_cached_per_leader_pair_deck_and_variant(chat):
    """The same deck in another order shares a brief; one card changed or another variant does not (#401)."""
    c, _ = chat
    _, body = _session(c)
    t = body["token"]
    first = _lookup(c, t, _ticket())
    assert first.status_code == 200
    assert first.json()["brief"] is None
    assert first.json()["leader_id"] == LEADER and first.json()["opponent_id"] == OPPONENT
    assert {"id": "OP01-016", "copies": 4} in first.json()["deck"]
    cites = [
        {"at": 4, "source": "playbook:OP01-001", "title": "Playbook", "cited_text": "Curve out"},
        {"at": 9, "source": "stats:OP01-001:OP05-098", "title": "Matchup", "cited_text": "52%"},
    ]
    assert _put(c, t, _ticket(), text="Plan. Mull. Done.", citations=cites).status_code == 204

    same = _lookup(c, t, _ticket(deck=list(reversed(DECK)))).json()
    assert same["brief"]["text"] == "Plan. Mull. Done."
    assert [x["at"] for x in same["brief"]["citations"]] == [4, 9]
    assert same["key"] == first.json()["key"]

    one_card = DECK[:-1] + ["ST01-009"]
    assert _lookup(c, t, _ticket(deck=one_card)).json()["brief"] is None
    assert _lookup(c, t, _ticket(), variant="v1:OP15").json()["brief"] is None
    assert _lookup(c, t, _ticket(opponent="OP09-001")).json()["brief"] is None


def test_a_brief_older_than_a_week_is_not_served(chat):
    """A brief past its seven days is written again rather than served (#401)."""
    c, SessionLocal = chat
    _, body = _session(c)
    t = body["token"]
    assert _put(c, t, _ticket()).status_code == 204
    assert _lookup(c, t, _ticket()).json()["brief"] is not None
    db = SessionLocal()
    try:
        row = db.query(AnalystMatchBrief).one()
        row.created_at = datetime.now(timezone.utc) - timedelta(days=8)
        db.commit()
    finally:
        db.close()
    assert _lookup(c, t, _ticket()).json()["brief"] is None


def test_brief_routes_need_the_service_secret(chat):
    """The browser can't call the brief routes itself: they take the analyst service secret (#401)."""
    c, _ = chat
    _, body = _session(c)
    assert _lookup(c, body["token"], _ticket(), service=False).status_code == 403
    r = c.put(
        "/analyst/briefs",
        json={"ticket": _ticket(), "variant": "v1:OP14", "text": "x"},
        headers={"X-Analyst-Token": body["token"]},
    )
    assert r.status_code == 403


def test_brief_spend_counts_toward_the_daily_cap(chat):
    """A brief's cost is recorded as usage and uses up the same daily cap as chat (#401)."""
    c, _ = chat
    _, body = _session(c)
    h = _as(body["token"])
    assert c.get("/analyst/chat/budget", headers=h).json()["allowed"] is True
    r = c.post("/analyst/chat/usage", json={"kind": "brief", "model": "m", "cost_usd": 3.0}, headers=h)
    assert r.status_code == 204, r.text
    assert c.get("/analyst/chat/budget", headers=h).json()["allowed"] is False
