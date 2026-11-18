#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    catalog_path = root / "duel-web" / "src" / "assets" / "cardCatalog.json"
    meta_path = root / "packages" / "rules" / "src" / "cards" / "catalogMeta.json"

    catalog: dict = json.loads(catalog_path.read_text(encoding="utf-8"))
    meta: dict = json.loads(meta_path.read_text(encoding="utf-8"))

    updated = 0
    for card_id, row in catalog.items():
        if card_id not in meta:
            continue
        text = row.get("effectText")
        if not isinstance(text, str):
            continue
        cleaned = text.strip()
        if not cleaned or cleaned in ("—", "-"):
            continue
        prev = meta[card_id].get("effectText")
        if prev == cleaned:
            continue
        meta[card_id]["effectText"] = cleaned
        updated += 1

    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    with_text = sum(1 for v in meta.values() if v.get("effectText"))
    print(
        f"updated {updated} effectText fields → {meta_path} "
        f"({with_text}/{len(meta)} rows have effectText)"
    )


if __name__ == "__main__":
    main()
