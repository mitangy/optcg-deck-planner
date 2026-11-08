"""Small typo-tolerant text matching for catalog search (no dependencies)."""

from __future__ import annotations

import re
import unicodedata

_NON_WORD = re.compile(r"[^a-z0-9]+")


def normalize(text: str | None) -> str:
    """Lowercase, strip accents, turn punctuation into spaces ("Monkey.D.Luffy" -> "monkey d luffy")."""
    folded = unicodedata.normalize("NFKD", text or "")
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch)).lower()
    return _NON_WORD.sub(" ", folded).strip()


def tokens(text: str | None) -> list[str]:
    return normalize(text).split()


def edit_distance(a: str, b: str, cap: int) -> int:
    """Damerau (adjacent swap) edit distance, or cap + 1 once it exceeds cap."""
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev2: list[int] | None = None
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if prev2 is not None and i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return min(prev[-1], cap + 1)


def max_typos(token: str) -> int:
    """Short tokens must match a word's start exactly; longer ones may have a typo or two."""
    if len(token) < 4:
        return 0
    return 1 if len(token) <= 6 else 2


def token_cost(token: str, words: list[str]) -> int | None:
    """0 for a prefix/substring hit, else the smallest edit distance within the token's allowance."""
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
        """Total edit distance if every query token matches some word (any order), else None."""
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
    """Total edit distance if every query token matches some word of text (any order), else None."""
    return QueryMatcher(query_tokens).cost(text)
