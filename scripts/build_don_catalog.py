#!/usr/bin/env python3
"""Pull every DON!! card printing from TCGCSV and emit a catalog for duel-web.

The Settings page lets a player pick which DON!! art their DON!! use (#440).
Each entry is a TCGPlayer product; its image is
https://tcgplayer-cdn.tcgplayer.com/product/<productId>_400w.jpg.

Usage: python3 scripts/build_don_catalog.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

CATEGORY_ID = 68
BASE = f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}"
UA = "OPTCGDeckPlanner/1.0 (don-catalog)"
PAUSE_S = 0.08

DON = "DON!!"


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ext_map(product: dict) -> dict[str, str]:
    return {
        item["name"]: item["value"]
        for item in (product.get("extendedData") or [])
        if "name" in item and "value" in item
    }


def is_don(product: dict) -> bool:
    name = (product.get("name") or "").strip()
    if name.startswith(DON):
        return True
    ed = ext_map(product)
    return any((ed.get(k) or "").strip() == DON for k in ("CardType", "Card Type", "Rarity"))


def label(name: str) -> str:
    """'DON!! Card (Alternate Art) (Luffy and Loki) (Gold)' -> 'Alternate Art · Luffy and Loki · Gold'."""
    rest = name.strip()
    if rest.startswith(DON):
        rest = rest[len(DON):].strip()
    rest = re.sub(r"^Card\b", "", rest).strip()
    parts = re.findall(r"\(([^()]*)\)", rest)
    outside = re.sub(r"\([^()]*\)", " ", rest)
    outside = re.sub(r"\s+", " ", outside).strip(" -")
    bits = [p.strip() for p in parts if p.strip()]
    if outside:
        bits.insert(0, outside)
    return " · ".join(bits) or DON


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "duel-web" / "src" / "assets" / "donCatalog.json"

    groups = get_json(f"{BASE}/groups")["results"]
    print(f"groups={len(groups)}")
    # Newest set first (publishedOn desc), then productId.
    groups.sort(key=lambda g: g.get("publishedOn") or "", reverse=True)

    seen: set[int] = set()
    rows: list[dict] = []
    for group in groups:
        gid = group["groupId"]
        gname = (group.get("name") or "").strip()
        time.sleep(PAUSE_S)
        try:
            products = get_json(f"{BASE}/{gid}/products")["results"]
        except Exception as e:  # keep going: one flaky group must not drop the rest
            print(f"skip group {gid} {gname}: {e}")
            continue
        batch = []
        for product in products:
            pid = product.get("productId")
            if not isinstance(pid, int) or pid <= 0 or pid in seen or not is_don(product):
                continue
            seen.add(pid)
            batch.append({"productId": pid, "name": label(product.get("name") or ""), "set": gname})
        batch.sort(key=lambda r: r["productId"])
        rows.extend(batch)

    out.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} DON!! printings -> {out}")


if __name__ == "__main__":
    main()
