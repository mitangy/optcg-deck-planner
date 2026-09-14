#!/usr/bin/env python3
"""Backfill productId on cardCatalog.json primaries + altArts from imageUrl.

Parses `product/(\\d+)_` from existing TCGPlayer CDN URLs — no TCGCSV re-fetch.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from cosmetics_common import product_id_from_image_url  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT / "duel-web" / "src" / "assets" / "cardCatalog.json"


def backfill_entry(entry: dict) -> tuple[bool, bool]:
    """Mutate entry in place. Returns (primary_changed, alts_changed)."""
    primary_changed = False
    alts_changed = False
    pid = product_id_from_image_url(entry.get("imageUrl"))
    if pid and entry.get("productId") != pid:
        entry["productId"] = pid
        primary_changed = True
    elif pid and "productId" not in entry:
        entry["productId"] = pid
        primary_changed = True

    alts = entry.get("altArts")
    if isinstance(alts, list):
        for alt in alts:
            if not isinstance(alt, dict):
                continue
            alt_pid = product_id_from_image_url(alt.get("imageUrl"))
            if not alt_pid:
                continue
            if alt.get("productId") != alt_pid:
                alt["productId"] = alt_pid
                alts_changed = True
    return primary_changed, alts_changed


def backfill_catalog(catalog: dict) -> dict[str, int]:
    primaries = 0
    alts = 0
    for entry in catalog.values():
        if not isinstance(entry, dict):
            continue
        p, a = backfill_entry(entry)
        if p:
            primaries += 1
        if a:
            alts += 1
    return {"primaries_updated": primaries, "entries_with_alt_updates": alts}


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CATALOG
    if not path.is_file():
        raise SystemExit(f"Catalog not found: {path}")
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(catalog, dict):
        raise SystemExit("Expected cardCatalog.json to be an object keyed by card id")
    stats = backfill_catalog(catalog)
    path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    with_pid = sum(1 for v in catalog.values() if isinstance(v, dict) and v.get("productId"))
    alt_pid = sum(
        1
        for v in catalog.values()
        if isinstance(v, dict)
        for a in (v.get("altArts") or [])
        if isinstance(a, dict) and a.get("productId")
    )
    print(
        f"backfilled {path}: {stats['primaries_updated']} primaries, "
        f"{stats['entries_with_alt_updates']} cards with alt updates → "
        f"{with_pid} primaries + {alt_pid} alts now have productId"
    )


if __name__ == "__main__":
    main()
