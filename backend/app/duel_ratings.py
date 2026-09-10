"""Elo helpers for duel ratings."""

from __future__ import annotations

INITIAL_RATING = 1000
K_PROVISIONAL = 40
K_STANDARD = 24
PROVISIONAL_GAMES = 10


def elo_k(games_played: int) -> int:
    return K_PROVISIONAL if games_played < PROVISIONAL_GAMES else K_STANDARD


def expected_score(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def apply_elo(
    rating_a: int,
    rating_b: int,
    *,
    score_a: float,
    games_a: int,
    games_b: int,
) -> tuple[int, int]:
    """Return (new_a, new_b). score_a is 1.0 win, 0.0 loss, 0.5 draw."""
    ea = expected_score(rating_a, rating_b)
    eb = 1.0 - ea
    na = int(round(rating_a + elo_k(games_a) * (score_a - ea)))
    nb = int(round(rating_b + elo_k(games_b) * ((1.0 - score_a) - eb)))
    return na, nb
