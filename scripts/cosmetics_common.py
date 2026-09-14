"""Shared helpers for duel cosmetics catalog scripts."""

from __future__ import annotations

import re

# Align with scripts/build_cosmetics_catalog.py; planner DB export also
# consults backend.domain.SPECIAL_NAME_MARKERS when available.
SPECIAL_MARKERS = (
    "alternate art",
    "alt art",
    "parallel",
    "manga",
    "special rare",
    "treasure rare",
    "illustration rare",
    "winner",
    "championship",
    "promo stamp",
)

PRODUCT_ID_FROM_URL_RE = re.compile(r"product/(\d+)_", re.I)


def product_id_from_image_url(url: str | None) -> int | None:
    """Parse TCGPlayer product id from a CDN imageUrl (…/product/{id}_…)."""
    if not url:
        return None
    m = PRODUCT_ID_FROM_URL_RE.search(url)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def tcgplayer_image_url(product_id: int, size: str = "400w") -> str:
    return f"https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_{size}.jpg"


def normalize_cosmetics_image_url(url: str | None, product_id: int | None = None) -> str:
    """Prefer stable TCGPlayer CDN `_400w` URLs for the web atlas."""
    pid = product_id if product_id and product_id > 0 else product_id_from_image_url(url)
    if pid:
        return tcgplayer_image_url(pid, "400w")
    return (url or "").strip()


def is_special_name(name: str, markers: tuple[str, ...] = SPECIAL_MARKERS) -> bool:
    n = name.lower()
    return any(m in n for m in markers)


def alt_label(name: str) -> str:
    n = name.lower()
    if "manga" in n:
        return "Manga Rare"
    if "treasure rare" in n or re.search(r"\btr\b", n) or "(tr)" in n:
        return "Treasure Rare"
    if "illustration rare" in n:
        return "Illustration Rare"
    if "winner" in n or "championship" in n:
        return "Promo"
    if "promo" in n:
        return "Promo"
    if "alternate art" in n or "alt art" in n or "parallel" in n:
        return "Alternate Art"
    if "full art" in n:
        return "Full Art"
    if "box topper" in n:
        return "Box Topper"
    return "Special Art"
