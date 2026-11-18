"""Property tests for parse_decklist (#1322).

Hypothesis tries arbitrary text and deck-shaped fragments; the contract is that the parser either
returns well-formed cards or raises the domain `Invalid` (a 400), never a bare
ValueError/TypeError/IndexError that would surface as a 500.

Hypothesis found that "0xOP01-001" returned needed=0 (the TypeScript parser rejects it); fixed in #1322.
"""

import re

import pytest

from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.errors import Invalid
from app.planner.domain import ParsedCard, parse_decklist

CARD_ID = re.compile(r"[A-Z0-9]+-\d+[A-Z]?")

card_ids = st.builds(
    lambda prefix, s, n: f"{prefix}{s:02d}-{n:03d}",
    st.sampled_from(["OP", "ST", "EB", "PRB", "P"]),
    st.integers(0, 15),
    st.integers(1, 130),
)

fragments = st.one_of(
    card_ids,
    card_ids.map(str.lower),
    st.builds(lambda n, x, c: f"{n}{x}{c}", st.integers(0, 12), st.sampled_from(["x", "X", "x ", " x", ""]), card_ids),
    st.builds(lambda c, n: f"{c} x{n}", card_ids, st.integers(0, 12)),
    st.builds(lambda c, n, x: f"{c.lower()}{x}{n}", card_ids, st.integers(0, 12), st.sampled_from(["x", "X", " x"])),
    st.builds(lambda z, c: f"{'0' * z}x{c}", st.integers(1, 6), card_ids),
    st.builds(lambda n, d, c: f"{d * n}x{c}", st.integers(4301, 4400), st.sampled_from(["9", "1", "\u0663"]), card_ids),
    st.sampled_from(["\n", "\r\n", ",", ";", "  ", " ", "# note", "// note", "-", "x", "0", "Nami", "\t"]),
    st.text(max_size=8),
)
decklistish = st.lists(fragments, max_size=10).map("".join)
decklistish_lines = st.lists(fragments, max_size=10).map("\n".join)
any_text = st.one_of(st.text(max_size=60), decklistish, decklistish_lines)


def _check_cards(cards, minimum):
    assert cards
    seen = set()
    for card in cards:
        assert isinstance(card, ParsedCard)
        assert card.needed >= minimum
        assert CARD_ID.fullmatch(card.card_id), card.card_id
        assert card.card_id == card.card_id.upper()
        assert card.card_id not in seen
        seen.add(card.card_id)


@settings(max_examples=300, deadline=None)
@given(any_text)
def test_parse_decklist_returns_well_formed_cards_or_raises_invalid_on_arbitrary_text_1322(text):
    try:
        cards = parse_decklist(text)
    except Invalid:
        return
    _check_cards(cards, minimum=1)


@settings(max_examples=200, deadline=None)
@given(card_ids, st.integers(1, 5), st.sampled_from(["", "\n4xOP01-016"]))
def test_parse_decklist_rejects_a_zero_count_instead_of_returning_it_1322(card_id, zeros, tail):
    try:
        cards = parse_decklist(f"{'0' * zeros}x{card_id}{tail}")
    except Invalid:
        return
    raise AssertionError(f"accepted a zero count: {cards}")


@settings(max_examples=100, deadline=None)
@given(st.integers(4301, 6000), card_ids)
def test_parse_decklist_turns_an_absurdly_long_count_into_invalid_1322(digits, card_id):
    try:
        parse_decklist(f"{'9' * digits}x{card_id}")
    except Invalid:
        return
    raise AssertionError("a count beyond int()'s digit limit was accepted")


@settings(max_examples=200, deadline=None)
@given(st.dictionaries(card_ids, st.integers(1, 4), min_size=1, max_size=30))
def test_parse_decklist_round_trips_a_count_per_card_text_1322(counts):
    text = "\n".join(f"{n}x{card_id}" for card_id, n in counts.items())
    assert {c.card_id: c.needed for c in parse_decklist(text)} == counts


@settings(max_examples=200, deadline=None)
@given(
    st.lists(
        st.tuples(st.sampled_from(["OP01-001", "ST10-012", "EB02-061"]), st.integers(1, 4)), min_size=1, max_size=10
    )
)
def test_parse_decklist_adds_up_a_card_repeated_across_lines_1322(rows):
    text = "\n".join(f"{n}x{card_id}" for card_id, n in rows)
    want: dict[str, int] = {}
    for card_id, n in rows:
        want[card_id] = want.get(card_id, 0) + n
    assert {c.card_id: c.needed for c in parse_decklist(text)} == want


def test_a_zero_count_error_names_the_line_it_is_on_1330():
    text = "4xOP01-016\n2xST10-012\n0xOP05-119\n4xEB02-061"
    with pytest.raises(Invalid) as err:
        parse_decklist(text)
    assert "Line 3" in str(err.value) and "0xOP05-119" in str(err.value)
