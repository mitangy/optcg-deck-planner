"""parse_decklist runs the golden cases it shares with the TypeScript parser.

`packages/card-core/fixtures/decklists.json` is also read by
`packages/card-core/src/decklist.golden.test.ts`, so the two parsers cannot drift apart.
"""

import json
from pathlib import Path

import pytest

from app.planner.deck_link import COMPLETE_MAIN
from app.planner.domain import parse_decklist

FIXTURE = Path(__file__).resolve().parents[2] / "packages" / "card-core" / "fixtures" / "decklists.json"
GOLDEN = json.loads(FIXTURE.read_text("utf-8"))


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: c["name"])
def test_parse_decklist_matches_the_shared_golden_case(case):
    if case.get("error"):
        with pytest.raises(ValueError):
            parse_decklist(case["input"])
        return
    assert [[c.card_id, c.needed] for c in parse_decklist(case["input"])] == case["cards"]


def test_main_deck_size_matches_the_shared_constant():
    assert COMPLETE_MAIN == GOLDEN["mainDeckSize"]
