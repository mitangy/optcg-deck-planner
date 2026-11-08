"""The one DomainError handler turns each error class into the response HTTPException gave (refactor 2.1c)."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import Conflict, DomainError, Forbidden, Invalid, NotFound, register
from app.core.models import User
from app.group_buy.receipt import parse_tcgplayer_receipt
from app.planner.decks import DeckOversizeError
from app.planner.domain import MAIN_DECK_LIMIT, parse_decklist
from tests.conftest import add_catalog, add_deck_with_cards
from tests.friend_support import as_user, client, make_user as make_http_user  # noqa: F401


def _client(error: Exception) -> TestClient:
    app = FastAPI()
    register(app)

    @app.get("/boom")
    def boom():
        raise error

    return TestClient(app)


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (NotFound("Deck not found"), 404),
        (Invalid("qty must be >= 0"), 400),
        (Forbidden("Only the host can do that"), 403),
        (Conflict("There is nothing to undo."), 409),
        (DomainError("Slow down", status_code=429), 429),
    ],
)
def test_each_domain_error_maps_to_its_status_and_message_detail(error: DomainError, status: int):
    res = _client(error).get("/boom")
    assert res.status_code == status
    assert res.json() == {"detail": str(error)}


def test_domain_error_headers_reach_the_response():
    res = _client(DomainError("Wait", status_code=429, headers={"Retry-After": "7"})).get("/boom")
    assert res.status_code == 429
    assert res.headers["retry-after"] == "7"


def test_built_in_compatible_subclasses_still_match_their_built_in():
    assert isinstance(NotFound("x"), LookupError)
    assert isinstance(Invalid("x"), ValueError)
    assert isinstance(Forbidden("x"), PermissionError)


def test_deck_oversize_response_keeps_its_structured_detail():
    res = _client(DeckOversizeError(current=50, projected=53, limit=51)).get("/boom")
    assert res.status_code == 409
    assert res.json() == {
        "detail": {
            "code": "deck_oversize",
            "message": "Deck would have 53 cards (limit 51: 50 + 1 leader). Confirm to continue.",
            "current": 50,
            "projected": 53,
            "limit": 51,
        }
    }


def test_a_deck_code_with_thousands_of_digits_stays_a_400_error_not_a_crash():
    # int() refuses 4300+ digits with a ValueError; the old blanket `except ValueError` made that a 400.
    huge = "9" * 5000
    with pytest.raises(Invalid, match="digits"):
        parse_decklist(f"{huge}xOP01-001")
    with pytest.raises(Invalid, match="digits"):
        parse_tcgplayer_receipt(f"{huge}\tNami (OP01-016)")


def test_adding_past_the_main_deck_limit_answers_409_with_the_oversize_detail_over_http(client):
    c, S = client
    uid = make_http_user(S, "Kai")
    with S() as db:
        for i in range(MAIN_DECK_LIMIT):
            add_catalog(db, f"OP99-{i:03d}", name=f"Card {i}", product_id=100 + i, market=1.0)
        add_catalog(db, "OP99-999", name="Extra", product_id=999, market=1.0)
        deck_id = add_deck_with_cards(
            db, db.get(User, uid), "Full", {f"OP99-{i:03d}": 1 for i in range(MAIN_DECK_LIMIT)}
        ).id

    r = as_user(c, uid).put(f"/decks/{deck_id}/cards/OP99-999", json={"needed": 1})
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "deck_oversize"
    assert (detail["current"], detail["projected"], detail["limit"]) == (
        MAIN_DECK_LIMIT,
        MAIN_DECK_LIMIT + 1,
        MAIN_DECK_LIMIT,
    )
