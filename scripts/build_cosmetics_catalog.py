#!/usr/bin/env python3
"""Pull OPTCG printings from TCGCSV and emit a cosmetics catalog for duel-web.

Curated playable defs stay in packages/rules. This catalog fills Deck Configure
search / art for every English OPTCG card number TCGCSV knows about. Gameplay
still auto-stubs unknown defs via ensureCardDef.
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

CATEGORY_ID = 68
BASE = f"https://tcgcsv.com/tcgplayer/{CATEGORY_ID}"
UA = "OPTCGDeckPlanner/1.0 (cosmetics-catalog)"
PAUSE_S = 0.08

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

CARD_ID_RE = re.compile(r"^[A-Z0-9]+-\d+[A-Z]?$", re.I)


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


def parse_int(raw: str | None) -> int | None:
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "")
    if not s or s == "-":
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def normalize_type(raw: str | None) -> str:
    t = (raw or "").strip().lower()
    if "leader" in t:
        return "leader"
    if "event" in t:
        return "event"
    if "stage" in t:
        return "stage"
    return "character"


def normalize_colors(raw: str | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for part in re.split(r"[;/,re.split(r"[/,&]"]", raw):
        c = part.strip().lower()
        if c:
            out.append(c.capitalize() if c != "don!!" else "Don")
    # Prefer Title Case for Red/Blue/…
    return [c.lower() for c in out]


def normalize_attribute(raw: str | None) -> str | None:
    if not raw:
        return None
    # Map TCGCSV labels toward deck-configure filters when possible.
    mapping = {
        "strike": "Strike",
        "slash": "Slash",
        "ranged": "Ranged",
        "special": "Special",
        "wisdom": "Wisdom",
    }
    key = raw.strip().lower()
    return mapping.get(key, raw.strip().title())


def is_special(name: str) -> bool:
    n = name.lower()
    return any(m in n for m in SPECIAL_MARKERS)


def effect_has(flag: str, text: str) -> bool:
    return flag.lower() in text.lower()


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    out = root / "duel-web" / "src" / "assets" / "cardCatalog.json"

    groups = get_json(f"{BASE}/groups")["results"]
    print(f"groups={len(groups)}")

    # card_id -> list of candidate printings (prefer non-special, then lowest productId)
    candidates: dict[str, list[dict]] = defaultdict(list)

    for i, group in enumerate(groups):
        gid = group["groupId"]
        gname = group.get("name") or ""
        time.sleep(PAUSE_S)
        try:
            products = get_json(f"{BASE}/{gid}/products")["results"]
        except Exception as e:
            print(f"skip group {gid} {gname}: {e}")
            continue
        for product in products:
            ed = ext_map(product)
            number = (ed.get("Number") or "").strip().upper()
            if not number or not CARD_ID_RE.match(number):
                continue
            name = (product.get("name") or number).strip()
            # Drop sealed product lines that slipped through with a number.
            if "display" in name.lower() and "card" not in (ed.get("CardType") or "").lower():
                if not ed.get("CardType"):
                    continue
            card_type = normalize_type(ed.get("CardType") or ed.get("Card Type"))
            colors = normalize_colors(ed.get("Color"))
            cost = parse_int(ed.get("Cost"))
            power = parse_int(ed.get("Power"))
            counter = parse_int(ed.get("Counter"))
            life = parse_int(ed.get("Life"))
            attribute = normalize_attribute(ed.get("Attribute"))
            effect = ed.get("Description") or ed.get("Effect") or ""
            image = product.get("imageUrl") or ""
            # Prefer 400w-style CDN when possible (TCGPlayer product art).
            product_id = product.get("productId")
            if product_id:
                image = f"https://tcgplayer-cdn.tcgplayer.com/product/{product_id}_400w.jpg"
            entry = {
                "id": number,
                "name": re.sub(r"\s*\(\d+\)\s*$", "", name).strip() or number,
                "type": card_type,
                "colors": colors,
                "cost": cost if cost is not None else 0,
                "power": power,
                "life": life,
                "counter": counter,
                "attribute": attribute,
                "blocker": effect_has("[Blocker]", effect) or effect_has("Blocker", effect),
                "rush": effect_has("[Rush]", effect) or effect_has("Rush", effect),
                "imageUrl": image,
                "effectText": re.sub(r"<[^>]+>", " ", effect).strip() or None,
                "_special": is_special(name),
                "_productId": int(product_id or 0),
            }
            candidates[number].append(entry)
        if (i + 1) % 10 == 0:
            print(f"  …{i + 1}/{len(groups)} groups, {len(candidates)} unique ids")

    catalog: dict[str, dict] = {}
    for card_id, rows in candidates.items():
        rows_sorted = sorted(
            rows,
            key=lambda e: (int(e["_special"]), e["_productId"]),
        )
        best = dict(rows_sorted[0])
        best.pop("_special", None)
        best.pop("_productId", None)
        # Drop nullish optional fields to keep JSON smaller.
        catalog[card_id] = {k: v for k, v in best.items() if v is not None and v != []}

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {len(catalog)} cards → {out} ({out.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
