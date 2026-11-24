from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.planner.decks import _card_view
from app.planner.printings import _alts_owned_total, _deck_alt_owned_map, deck_alt_buy_inputs
from app.planner.shopping import allocate_still_need_buys, remaining_cost_for_buys

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "packages/card-core/fixtures/shopping-cases.json").read_text()
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_shopping_maths_matches_the_shared_cases_1346(case):
    alts = [SimpleNamespace(**a) for a in case["alt_arts"]]
    alt_owned = {"X": {a.product_id: a.owned for a in alts}}
    collector = {"X": {a.product_id: a.collector for a in alts if a.collector}}
    deck_alt_owned = _deck_alt_owned_map(alt_owned, collector)
    alts_owned = _alts_owned_total(deck_alt_owned, "X")
    still = _card_view(
        "X",
        case["need"],
        case["owned"],
        None,
        "main",
        alts_owned=alts_owned,
        earlier_leaders_need=case["earlier_leaders_need"],
    ).still_need
    buys = allocate_still_need_buys(
        still,
        deck_alt_buy_inputs(alts, deck_alt_owned.get("X", {})),
        standard_product_id=None,
        standard_price=case["market_price"],
    )
    assert {
        "deck_alts_owned": alts_owned,
        "still_need": still,
        "buys": [{"product_id": p, "qty": q, "price": pr} for p, q, pr in buys],
        "remaining_cost": remaining_cost_for_buys(buys),
    } == case["expected"]
