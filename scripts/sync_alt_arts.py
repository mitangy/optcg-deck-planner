#!/usr/bin/env python3
"""Add missing alternate-art printings to the cosmetics catalog (#581).

Usage: python3 scripts/sync_alt_arts.py [--dry-run]

`build_cosmetics_catalog.py` was run once, so alt printings that TCGPlayer
listed later (or whose name had no "alternate art" marker, like El Thor's
Premium Card Collection reprint) are missing from the Deck Configure artwork
picker. This script reads every TCGPlayer product from tcgcsv.com, and for each
card in `duel-web/src/assets/cardCatalog.json` appends the printings whose art
really differs:

- a product is a candidate when its productId is not already the card's
  productId or one of its alts (catalog, curated atlas, tcgProducts.json);
- with a usable image, it is an alt whenever a 16x16 difference hash of its
  200w picture is more than HASH_THRESHOLD bits away from the primary and from
  every alt already kept (foils, stamps and release events reprint the same art
  and stay under it). No name marker is needed (#590), so promo, event and pack
  printings (Dash Pack, Wanted Poster, anniversary sets, Judge packs...) count.
  Without a marker the card's primary must have a real picture too: a card
  whose own scan is still "Image Coming Soon" has nothing to compare with;
- with no image yet (`imageCount` 0), it cannot be hashed, so it is an alt only
  when its name carries a distinct-art marker ("Alternate Art", "(SP)", ...).

Labels: a product with a marker keeps the old label (Special Art, Treasure Rare,
Manga Rare, Alternate Art, PCC ...). One without is labelled from the last
parenthesised part of its TCGPlayer name ("Dash Pack", "Gift Collection 2023"),
shortened to about LABEL_MAX characters, or "Promo" when it has none.

Append only: existing alt ids (`p1`, `p2`, ...) are never reordered or removed,
because saved art choices point at them. New alts take the next free `pN`.
Hashes are cached in `scripts/data/art_hashes.json` (keyed by productId) so a
later run only downloads pictures it has not seen. Hashing needs Pillow
(`pip install pillow`); the pure planning logic does not.

`sync_preview_art.py` then downloads preview scans for alts that still have no
TCGPlayer image.
"""
from __future__ import annotations

import argparse
import concurrent.futures as futures
import io
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_cosmetics_catalog import alt_label  # noqa: E402

CATALOG = ROOT / "duel-web/src/assets/cardCatalog.json"
ATLAS = ROOT / "duel-web/src/assets/cardAtlas.json"
TCG_PRODUCTS = ROOT / "duel-web/src/assets/tcgProducts.json"
HASH_CACHE = ROOT / "scripts/data/art_hashes.json"

UA = "Mozilla/5.0"
TCGCSV = "https://tcgcsv.com/tcgplayer/68"
CDN = "https://tcgplayer-cdn.tcgplayer.com/product"

HASH_SIDE = 16  # 16x16 = 256 bits
# Measured on El Thor: same art (foils, stamps, release events) <= 41 bits,
# different art >= 109. 75 sits in the middle of the gap.
HASH_THRESHOLD = 75

# Image-less products can only be judged by name: they are alts only when it
# carries one of these. Products with a picture are judged by the hash alone.
DISTINCT_ART_MARKERS = (
    "alternate art",
    "alt art",
    "(sp)",
    "manga",
    "parallel",
    "premium card collection",
    "best selection",
    "(tr)",
    "treasure rare",
    "special rare",
)

PID_IN_URL = re.compile(r"product/(\d+)_")
ALT_NUM = re.compile(r"^p(\d+)$")


# --- pure logic (unit-testable) ---------------------------------------------


def pid_from_url(url: str | None) -> int | None:
    m = PID_IN_URL.search(url or "")
    return int(m.group(1)) if m else None


def hamming(a: str, b: str) -> int:
    """Differing bits between two hex hashes."""
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def is_new_art(h: str, refs: list[str]) -> bool:
    """True when `h` is more than HASH_THRESHOLD bits from every reference."""
    return all(hamming(h, r) > HASH_THRESHOLD for r in refs)


def has_distinct_marker(name: str) -> bool:
    n = name.lower()
    return any(m in n for m in DISTINCT_ART_MARKERS)


PCC_SUFFIX = re.compile(r"premium card collection\s*-\s*(.+?)\s*-?\s*\)?\s*$", re.I)
PCC_SUFFIX_MAX = 28


def label_for(name: str) -> str:
    """Picker label: `alt_label`, with the volume/edition for Premium Card Collection."""
    if "premium card collection" in name.lower():
        m = PCC_SUFFIX.search(name.rstrip(") ").rstrip("-").rstrip() + "-")
        suffix = m.group(1).strip(" -)") if m else ""
        if suffix and len(suffix) <= PCC_SUFFIX_MAX:
            return f"PCC {suffix.title().replace('Vol.', 'Vol.')}"
        return "Premium Card Collection"
    return alt_label(name)


LABEL_MAX = 28
TRAILING_BRACKET = re.compile(r"\s*\[[^\]]*\]\s*$")  # "[Participant]", "[Serial Number]"
SUFFIX = re.compile(r"\(([^()]*)\)\s*$")
# "(OP12-020)", "(001)", "(Store)": not a printing name.
NOT_A_NAME = re.compile(r"^(?:(?:[A-Z]{1,3}\d{0,2}-)?\d{1,3}|store|reprint)$", re.I)
ANNIVERSARY = re.compile(
    r"(?:(english|japanese)(?: version)?\s+)?(\d)(st|nd|rd|th) anniversary set$|"
    r"^one piece japanese version (\d)(st|nd|rd|th) anniversary set$",
    re.I,
)
# Tried in order until the label fits LABEL_MAX.
TRIM_STEPS = (
    (re.compile(r"\bOne Piece Card Game\b ?", re.I), ""),
    (re.compile(r"\bOne Piece\b ?", re.I), ""),
    (re.compile(r"\bPromotion Cards?\b ?", re.I), ""),
    (re.compile(r"\bParticipation\b ?", re.I), ""),
    (re.compile(r"\bTreasure Campaign Pack\b", re.I), "Treasure Campaign"),
    (re.compile(r"\bOffline ", re.I), ""),
    (re.compile(r"\bAnniversary\b", re.I), "Anniv."),
    (re.compile(r"\bVersion\b ?", re.I), ""),
    (re.compile(r"\bEdition\b ?", re.I), ""),
    (re.compile(r"\bCard Set\b", re.I), "Set"),
    (re.compile(r"\bThe ", re.I), ""),
    (re.compile(r"\bOfficial Playmat\b", re.I), "Playmat"),
    (re.compile(r"\bBandai Card Games\b", re.I), "Bandai"),
    (re.compile(r"\bSet\b ?", re.I), ""),
    (re.compile(r"\bPack\b ?", re.I), ""),
)


def suffix_label(name: str) -> str:
    """Label from the last parenthesised part of a TCGPlayer name, else "Promo"."""
    m = SUFFIX.search(TRAILING_BRACKET.sub("", name).strip())
    s = re.sub(r"\s+", " ", m.group(1)).strip(" -") if m else ""
    if not s or NOT_A_NAME.match(s):
        return "Promo"
    a = ANNIVERSARY.search(s)
    if a:
        lang = (a.group(1) or "japanese").lower() if a.group(2) else "japanese"
        n, ordinal = (a.group(2), a.group(3)) if a.group(2) else (a.group(4), a.group(5))
        return f"Anniversary ({n}{ordinal}, {'EN' if lang == 'english' else 'JP'})"
    s = s.replace("Seven Warlords of the Sea Binder Set", "Seven Warlords Binder")
    s = re.sub(r"\bRegional(?:s)? Participation Pack\b", "Regional", s, flags=re.I)
    for pattern, repl in TRIM_STEPS:
        if len(s) <= LABEL_MAX:
            break
        s = re.sub(r"\s+", " ", pattern.sub(repl, s)).strip(" -")
    if len(s) > LABEL_MAX:
        s = s[: LABEL_MAX - 1].rsplit(" ", 1)[0].rstrip(" -,:") + "\u2026"
    return s


def next_alt_number(taken_ids: set[str]) -> int:
    """The number after the highest `pN` in use (gaps are never reused)."""
    nums = [int(m.group(1)) for i in taken_ids if (m := ALT_NUM.match(i))]
    return max(nums, default=0) + 1


def unique_label(label: str, taken: list[str]) -> str:
    """`label`, or `label 2`, `label 3`... when the card already has it."""
    if label not in taken:
        return label
    n = 2
    while f"{label} {n}" in taken:
        n += 1
    return f"{label} {n}"


def plan_card(
    *,
    primary_pid: int | None,
    known_pids: set[int],
    taken_ids: set[str],
    taken_labels: list[str],
    ref_pids: list[int],
    products: list[dict],
    hashes: dict[int, str | None],
) -> tuple[list[dict], dict[str, int]]:
    """New alts for one card, in order, plus skip counts.

    `products`: tcgcsv rows (productId, name, imageCount) sharing the card's
    Number. `hashes`: productId -> hex hash (None when the picture is missing).
    `ref_pids`: primary and existing alts, the art new alts must differ from.
    """
    stats = {"same_art": 0, "no_marker": 0, "no_primary_art": 0}
    refs = [hashes[p] for p in ref_pids if hashes.get(p)]
    primary_has_art = bool(primary_pid and hashes.get(primary_pid))
    ids = set(taken_ids)
    labels = list(taken_labels)
    out: list[dict] = []
    for prod in sorted(products, key=lambda p: p["productId"]):
        pid = prod["productId"]
        if pid == primary_pid or pid in known_pids:
            continue
        marked = has_distinct_marker(prod["name"])
        h = hashes.get(pid) if int(prod.get("imageCount") or 0) > 0 else None
        if not h and not marked:
            stats["no_marker"] += 1  # nothing to hash and no name marker
            continue
        if h and not marked and not primary_has_art:
            stats["no_primary_art"] += 1
            continue
        if h and refs and not is_new_art(h, refs):
            stats["same_art"] += 1
            continue
        if h:
            refs.append(h)
        alt_id = f"p{next_alt_number(ids)}"
        ids.add(alt_id)
        label = unique_label(
            label_for(prod["name"]) if marked else suffix_label(prod["name"]), labels
        )
        labels.append(label)
        out.append(
            {
                "id": alt_id,
                "label": label,
                "imageUrl": f"{CDN}/{pid}_400w.jpg",
                "productId": pid,
            }
        )
    return out, stats


# --- hashing ----------------------------------------------------------------


def dhash(data: bytes) -> str | None:
    """256-bit difference hash as 64 hex chars; None for a landscape placeholder."""
    from PIL import Image  # lazy: only hashing needs Pillow

    img = Image.open(io.BytesIO(data))
    if img.width >= img.height:
        return None  # TCGPlayer's "Image Coming Soon" picture
    g = img.convert("L").resize((HASH_SIDE + 1, HASH_SIDE), Image.LANCZOS)
    px = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata())
    bits = 0
    for y in range(HASH_SIDE):
        row = y * (HASH_SIDE + 1)
        for x in range(HASH_SIDE):
            bits = (bits << 1) | (1 if px[row + x] > px[row + x + 1] else 0)
    return f"{bits:064x}"


def fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_json(url: str):
    return json.loads(fetch(url).decode("utf-8"))


def hash_product(pid: int) -> str | None:
    try:
        return dhash(fetch(f"{CDN}/{pid}_200w.jpg"))
    except Exception as e:  # noqa: BLE001 - one bad picture must not abort the run
        print(f"  {pid}: could not hash ({e})", file=sys.stderr)
        return None


def load_hashes() -> dict[str, str]:
    return json.loads(HASH_CACHE.read_text(encoding="utf-8")) if HASH_CACHE.exists() else {}


def save_hashes(cache: dict[str, str]) -> None:
    HASH_CACHE.parent.mkdir(parents=True, exist_ok=True)
    HASH_CACHE.write_text(
        json.dumps(cache, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8"
    )


# --- data -------------------------------------------------------------------


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def products_by_number() -> dict[str, list[dict]]:
    """Card Number -> every TCGPlayer product with it, across all groups."""
    by: dict[str, list[dict]] = {}
    groups = fetch_json(f"{TCGCSV}/groups")["results"]
    for g in groups:
        try:
            rows = fetch_json(f"{TCGCSV}/{g['groupId']}/products")["results"]
        except Exception as e:  # noqa: BLE001
            print(f"  group {g['groupId']} failed: {e}", file=sys.stderr)
            continue
        for p in rows:
            number = next(
                (e["value"] for e in p.get("extendedData", []) if e.get("name") == "Number"),
                None,
            )
            if number:
                by.setdefault(number.strip().upper(), []).append(
                    {
                        "productId": p["productId"],
                        "name": p["name"],
                        "imageCount": int(p.get("imageCount") or 0),
                    }
                )
    return by


def existing_alt_info(card_id: str, catalog: dict, atlas: dict, tcg: dict):
    """(alt pids, taken ids, taken labels) across catalog, atlas and tcgProducts."""
    alts = list(catalog[card_id].get("altArts") or [])
    alts += atlas.get(card_id, {}).get("altArts") or []
    alts += tcg.get(card_id, {}).get("alts") or []
    pids = {a.get("productId") or pid_from_url(a.get("imageUrl")) for a in alts} - {None}
    return pids, {a["id"] for a in alts}, [a.get("label", "") for a in alts]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing (but the hash cache)")
    args = ap.parse_args()

    catalog = load_json(CATALOG)
    atlas = load_json(ATLAS)
    tcg = load_json(TCG_PRODUCTS)
    print("Reading tcgcsv.com products...")
    by_number = products_by_number()

    cards: dict[str, dict] = {}
    need_hash: set[int] = set()
    for card_id, row in catalog.items():
        primary = row.get("productId") or pid_from_url(row.get("imageUrl"))
        known, _, _ = existing_alt_info(card_id, catalog, atlas, tcg)
        candidates = [
            p for p in by_number.get(card_id, []) if p["productId"] != primary and p["productId"] not in known
        ]
        if not candidates:
            continue
        cards[card_id] = {"primary": primary, "known": known, "candidates": candidates}
        image_candidates = [p["productId"] for p in candidates if p["imageCount"] > 0]
        if image_candidates:
            need_hash.update(image_candidates)
            need_hash.update(p for p in [primary, *known] if p)

    cache = load_hashes()
    todo = sorted(p for p in need_hash if str(p) not in cache)
    print(f"{len(cards)} cards with candidate products; {len(need_hash)} pictures to compare, {len(todo)} to download")
    if todo:
        with futures.ThreadPoolExecutor(8) as ex:
            for pid, h in zip(todo, ex.map(hash_product, todo)):
                if h:
                    cache[str(pid)] = h
    hashes: dict[int, str | None] = {int(k): v for k, v in cache.items()}

    changed = 0
    added: list[tuple[str, dict]] = []
    totals = Counter()
    for card_id, info in sorted(cards.items()):
        row = catalog[card_id]
        _, taken_ids, taken_labels = existing_alt_info(card_id, catalog, atlas, tcg)
        new, stats = plan_card(
            primary_pid=info["primary"],
            known_pids=info["known"],
            taken_ids=taken_ids,
            taken_labels=taken_labels,
            ref_pids=[p for p in [info["primary"], *sorted(info["known"])] if p],
            products=info["candidates"],
            hashes=hashes,
        )
        totals.update(stats)
        if new:
            changed += 1
            names = {p["productId"]: p["name"] for p in info["candidates"]}
            added.extend((card_id, {**a, "name": names[a["productId"]]}) for a in new)
            if not args.dry_run:
                row["altArts"] = [*(row.get("altArts") or []), *new]

    if not args.dry_run:
        CATALOG.write_text(
            json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
    save_hashes(cache)  # a cache only: kept on --dry-run so a second run is cheap

    by_label = Counter(a["label"] for _, a in added)
    tag = " (dry run, nothing written)" if args.dry_run else ""
    print(f"\nAlt art sync{tag}")
    print(f"  cards changed:        {changed}")
    print(f"  alts added:           {len(added)}")
    print(f"  skipped (same art):   {totals['same_art']}")
    print(f"  skipped (no picture and no distinct-art marker): {totals['no_marker']}")
    print(f"  skipped (no marker and the card's own picture is missing): {totals['no_primary_art']}")
    print(f"  by label: {dict(by_label.most_common())}")
    kinds = Counter(
        (m.group(1).lower() if (m := re.search(r"\(([^)]*)\)\s*$", a["name"])) else "(no suffix)")
        for _, a in added
    )
    print(f"  by product name suffix: {dict(kinds.most_common(40))}")
    for card_id, a in added[:25]:
        print(f"    {card_id} {a['id']} {a['label']} (product {a['productId']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
