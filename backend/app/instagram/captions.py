"""Instagram captions and hashtags (#1477)."""

from __future__ import annotations

import re

DISCLAIMER = "Unofficial fan-made OPTCG sim, not affiliated with Bandai."
CTA = "Play free: optcgduel.app (link in bio)"
MAX_HASHTAGS = 25
MAX_CAPTION = 2200

BASE_TAGS = (
    "#OPTCG #OnePieceCardGame #OnePieceTCG #OnePieceTradingCardGame #OPTCGcommunity #OnePiece "
    "#TCG #CardGame #TradingCardGame #OPTCGmeta #OPTCGdecks #OnePieceCards"
).split()


def tag(text: str) -> str:
    """'Monkey.D.Luffy' -> '#MonkeyDLuffy'. Empty when nothing usable is left."""
    words = re.findall(r"[A-Za-z0-9]+", text or "")
    body = "".join(w[:1].upper() + w[1:] for w in words)[:40]
    return f"#{body}" if body else ""


def clean_tags(tags: list[str]) -> list[str]:
    """Deduped (case-insensitive, order kept) and capped at MAX_HASHTAGS."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags:
        t = raw.strip()
        if not t.startswith("#") or len(t) < 2 or t.lower() in seen:
            continue
        seen.add(t.lower())
        out.append(t)
    return out[:MAX_HASHTAGS]


def build_caption(lines: list[str], extra_tags: list[str] | None = None) -> str:
    """Disclaimer, 1-4 lines of post text, the link line, a blank line, then the hashtags."""
    tags = clean_tags([*(extra_tags or []), *BASE_TAGS])
    body = [DISCLAIMER, *[ln.strip() for ln in lines if ln.strip()][:4], CTA]
    while True:
        caption = "\n".join(body) + "\n\n" + " ".join(tags)
        if len(caption) < MAX_CAPTION or not tags:
            break
        tags.pop()
    return caption[: MAX_CAPTION - 1]
