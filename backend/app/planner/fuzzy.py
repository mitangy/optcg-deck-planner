
from __future__ import annotations

import re
import unicodedata

from rapidfuzz.distance import OSA

_NON_WORD = re.compile(r"[^a-z0-9]+")


def normalize(text: str | None) -> str:
    folded = unicodedata.normalize("NFKD", text or "")
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()
    return _NON_WORD.sub(" ", folded).strip()


def tokens(text: str | None) -> list[str]:
    return normalize(text).split()


def edit_distance(a: str, b: str, cap: int) -> int:
    return OSA.distance(a, b, score_cutoff=cap)


def max_typos(token: str) -> int:
    if len(token) < 4:
        return 0
    return 1 if len(token) <= 6 else 2


def token_cost(token: str, words: list[str]) -> int | None:
    allowed = max_typos(token)
    best: int | None = None
    for word in words:
        if word.startswith(token) or (len(token) >= 4 and token in word):
            return 0
        if allowed:
            d = min(edit_distance(token, word, allowed), edit_distance(token, word[: len(token)], allowed))
            if d <= allowed and (best is None or d < best):
                best = d
    return best


class QueryMatcher:
    """Scores texts against one query, caching each (token, word) cost.

    Catalog texts share a small vocabulary, so a search computes each edit
    distance once per distinct word instead of once per card.
    """

    def __init__(self, query_tokens: list[str]):
        self.query_tokens = query_tokens
        self._costs: list[dict[str, int | None]] = [{} for _ in query_tokens]

    def _word_cost(self, i: int, word: str) -> int | None:
        cache = self._costs[i]
        if word not in cache:
            cache[word] = token_cost(self.query_tokens[i], [word])
        return cache[word]

    def cost_words(self, words: list[str] | tuple[str, ...]) -> int | None:
        if not self.query_tokens:
            return None
        total = 0
        for i in range(len(self.query_tokens)):
            best: int | None = None
            for word in words:
                c = self._word_cost(i, word)
                if c is not None and (best is None or c < best):
                    best = c
                    if c == 0:
                        break
            if best is None:
                return None
            total += best
        return total

    def cost(self, text: str | None) -> int | None:
        return self.cost_words(tokens(text))


def match_cost(query_tokens: list[str], text: str | None) -> int | None:
    return QueryMatcher(query_tokens).cost(text)
