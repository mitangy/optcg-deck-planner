#!/usr/bin/env python3
"""Keep unofficial card preview art in step with what TCGPlayer has posted.

Usage: python3 scripts/sync_preview_art.py [--dry-run]

Cards that are not on Bandai's list yet (cardData source "tcgplayer" /
"bundled") often have no TCGPlayer image for a while. For those, this script
downloads a preview image from opdeckguide.com into
`duel-web/public/cards/preview/<ID>.webp` and lists the id in
`duel-web/src/cards/previewArt.json`. duel-web only falls back to a preview
when the real art fails to load, so real art wins as soon as it is posted.

On every run it also prunes: a preview whose card now has TCGPlayer art (or is
gone from the atlas) is deleted and dropped from the manifest.

"Has TCGPlayer art" is read from tcgcsv.com (`imageCount` per product), with an
HTTP probe of the CDN image for products tcgcsv does not list. Python standard
library only. Downloaded files are only checked for type and size, never run.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "duel-web/src/assets/cardAtlas.json"
CATALOG = ROOT / "duel-web/src/assets/cardCatalog.json"
TCG_PRODUCTS = ROOT / "duel-web/src/assets/tcgProducts.json"
CARD_DATA = ROOT / "packages/rules/src/cards/cardData.json"
MANIFEST = ROOT / "duel-web/src/cards/previewArt.json"
PREVIEW_DIR = ROOT / "duel-web/public/cards/preview"
PUBLIC_DIR = ROOT / "duel-web/public"

UA = "Mozilla/5.0"
GUIDE_BASE = "https://opdeckguide.com"
TCGCSV = "https://tcgcsv.com/tcgplayer/68"
CDN = "https://tcgplayer-cdn.tcgplayer.com/product"
MAX_GROUPS = 15
MIN_BYTES = 2000

CDN_URL_RE = re.compile(r"^https?://tcgplayer-cdn\.tcgplayer\.com/product/(\d+)", re.I)
ID_RE = re.compile(r"^[A-Z0-9]+-\d+[A-Z]?$")


# --- pure helpers (unit-testable) ------------------------------------------


def set_prefix(card_id: str) -> str:
    return card_id.split("-", 1)[0]


def product_id_from_url(url: str | None) -> int | None:
    m = CDN_URL_RE.match(url or "")
    return int(m.group(1)) if m else None


def map_files_to_ids(files: list[str], wanted: set[str]) -> dict[str, str]:
    """Map opdeckguide image file names to card ids in `wanted`.

    A file belongs to an id only when its name starts with exactly `<ID> ` or
    `<ID>_`, so ALT / SP files, other sets' cards listed on the page, and
    `OP18-02` vs `OP18-021` never mix. Copies like "(2)" lose to a file without
    parentheses.
    """
    best: dict[str, str] = {}
    for name in files:
        m = re.match(r"^([A-Z0-9]+-\d+[A-Z]?)[ _]", name)
        if not m:
            continue
        card_id = m.group(1)
        if card_id not in wanted:
            continue
        prev = best.get(card_id)
        if prev is None or ("(" in prev and "(" not in name):
            best[card_id] = name
    return best


def should_prune(card_id: str, atlas_ids: set[str], has_art: dict[str, bool | None]) -> bool:
    """A preview goes when its card left the atlas or now has TCGPlayer art."""
    if card_id not in atlas_ids:
        return True
    return has_art.get(card_id) is True


def webp_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) of a WebP, or None when it is not a WebP we can read."""
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    kind = data[12:16]
    if kind == b"VP8 ":
        w, h = struct.unpack("<HH", data[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if kind == b"VP8L":
        v = struct.unpack("<I", data[21:25])[0]
        return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    if kind == b"VP8X":
        return (int.from_bytes(data[24:27], "little") + 1,
                int.from_bytes(data[27:30], "little") + 1)
    return None


class _ImgSrcParser(HTMLParser):
    def __init__(self, prefix: str):
        super().__init__(convert_charrefs=True)
        self.start = f"/Cards/{prefix}/"
        self.paths: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "img":
            return
        src = dict(attrs).get("src") or ""
        if src.startswith(self.start) and src not in self.paths:
            self.paths.append(src)


def parse_card_paths(html: str, prefix: str) -> list[str]:
    parser = _ImgSrcParser(prefix)
    parser.feed(html)
    return parser.paths


# --- network ----------------------------------------------------------------


def fetch(url: str, timeout: int = 60) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), resp.headers.get("Content-Type", "")


def fetch_json(url: str):
    return json.loads(fetch(url)[0].decode("utf-8"))


def cdn_has_art(pid: int) -> bool | None:
    """CDN answers 200 + a portrait image when art exists, 403 when it does not."""
    try:
        data, ctype = fetch(f"{CDN}/{pid}_400w.jpg", timeout=30)
    except urllib.error.HTTPError as e:
        return False if e.code in (403, 404) else None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    if not ctype.startswith("image/") or len(data) < MIN_BYTES:
        return False
    return _jpeg_portrait(data)


def _jpeg_portrait(data: bytes) -> bool:
    """Portrait check from the first JPEG SOF marker (placeholder is landscape)."""
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return h > w
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return True


def product_art_map(pids: set[int]) -> dict[int, bool]:
    """productId -> has art, from tcgcsv groups walked newest first."""
    found: dict[int, bool] = {}
    if not pids:
        return found
    try:
        groups = fetch_json(f"{TCGCSV}/groups")["results"]
    except Exception as e:  # noqa: BLE001 - one source down must not abort the run
        print(f"  tcgcsv groups unavailable: {e}", file=sys.stderr)
        return found
    groups.sort(key=lambda g: g.get("publishedOn", ""), reverse=True)
    for group in groups[:MAX_GROUPS]:
        if pids <= found.keys():
            break
        try:
            products = fetch_json(f"{TCGCSV}/{group['groupId']}/products")["results"]
        except Exception as e:  # noqa: BLE001
            print(f"  tcgcsv group {group['groupId']} failed: {e}", file=sys.stderr)
            continue
        for p in products:
            if p["productId"] in pids:
                found[p["productId"]] = int(p.get("imageCount") or 0) > 0
    return found


# --- data -------------------------------------------------------------------


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def resolved_image_url(card_id: str, atlas: dict, catalog: dict, tcg: dict) -> str | None:
    """The art URL duel-web resolves for a card (mirrors cards/atlas.ts)."""
    def local(u):
        return bool(u) and (u.startswith("/cards/") or u.startswith("cards/"))

    url = atlas.get(card_id, {}).get("imageUrl")
    cat = catalog.get(card_id, {}).get("imageUrl")
    pid = tcg.get(card_id, {}).get("productId")
    tcg_url = f"{CDN}/{pid}_400w.jpg" if pid else None
    if local(url):
        if cat and not local(cat):
            return cat
        return tcg_url or url
    if not url:
        return (cat if cat and not local(cat) else None) or tcg_url
    return url


def local_file_exists(url: str) -> bool:
    return (PUBLIC_DIR / url.lstrip("/")).is_file()


def existing_preview_ids() -> set[str]:
    ids = set(load_json(MANIFEST)) if MANIFEST.exists() else set()
    if PREVIEW_DIR.is_dir():
        ids |= {p.stem for p in PREVIEW_DIR.glob("*.webp")}
    return ids


def download_preview(prefix: str, card_id: str, rel_path: str) -> tuple[bytes | None, str]:
    url = GUIDE_BASE + urllib.parse.quote(rel_path)
    try:
        data, ctype = fetch(url)
    except Exception as e:  # noqa: BLE001
        return None, f"download failed: {e}"
    if not ctype.lower().startswith("image/webp"):
        return None, f"not image/webp ({ctype or 'no content-type'})"
    size = webp_size(data)
    if size is None or len(data) < MIN_BYTES:
        return None, "unreadable or tiny WebP"
    if size[0] >= size[1]:
        return None, f"not portrait ({size[0]}x{size[1]})"
    return data, ""


# --- main -------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    args = ap.parse_args()

    atlas = load_json(ATLAS)
    catalog = load_json(CATALOG)
    tcg = load_json(TCG_PRODUCTS)
    cards = load_json(CARD_DATA)["cards"]
    atlas_ids = set(atlas)
    have = existing_preview_ids()

    candidates = {i for i in atlas_ids if cards.get(i, {}).get("source") != "bandai"} | (have & atlas_ids)

    # has_art: True / False / None (could not tell)
    has_art: dict[str, bool | None] = {}
    cdn_pid: dict[str, int] = {}
    for cid in sorted(candidates):
        url = resolved_image_url(cid, atlas, catalog, tcg)
        pid = product_id_from_url(url)
        if pid is not None:
            cdn_pid[cid] = pid
        elif url and local_file_exists(url):
            has_art[cid] = True  # a bundled local image
        else:
            has_art[cid] = False

    pids = set(cdn_pid.values())
    print(f"{len(candidates)} candidate cards, {len(pids)} TCGPlayer products to check")
    by_pid = product_art_map(pids)
    for cid, pid in cdn_pid.items():
        art = by_pid.get(pid)
        if art is None:
            art = cdn_has_art(pid)
        has_art[cid] = art

    pruned = sorted(i for i in have if should_prune(i, atlas_ids, has_art))
    keep = have - set(pruned)
    needs = sorted(i for i in candidates if has_art.get(i) is False and i not in keep)

    added: list[str] = []
    still_missing: list[str] = list(needs)
    new_files: dict[str, bytes] = {}
    for prefix in sorted({set_prefix(i) for i in needs}):
        wanted = {i for i in needs if set_prefix(i) == prefix}
        try:
            html = fetch(f"{GUIDE_BASE}/cards-list/{prefix}/")[0].decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001 - keep going with the other sets
            print(f"  {prefix}: list page unavailable: {e}", file=sys.stderr)
            continue
        paths = parse_card_paths(html, prefix)
        by_name = {p.rsplit("/", 1)[-1]: p for p in paths}
        mapping = map_files_to_ids(list(by_name), wanted)
        for cid, name in sorted(mapping.items()):
            if args.dry_run:
                added.append(cid)
                still_missing.remove(cid)
                continue
            data, why = download_preview(prefix, cid, by_name[name])
            if data is None:
                print(f"  {cid}: {why}", file=sys.stderr)
                continue
            new_files[cid] = data
            added.append(cid)
            still_missing.remove(cid)

    final = sorted((keep | set(added)))

    if not args.dry_run:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        for cid, data in new_files.items():
            (PREVIEW_DIR / f"{cid}.webp").write_bytes(data)
        for cid in pruned:
            (PREVIEW_DIR / f"{cid}.webp").unlink(missing_ok=True)
        MANIFEST.write_text(json.dumps(final, indent=2) + "\n", encoding="utf-8")

    tag = " (dry run, nothing written)" if args.dry_run else ""
    print(f"\nPreview art sync{tag}")
    print(f"  kept:    {len(keep)}")
    print(f"  added:   {len(added)} {added}")
    print(f"  pruned:  {len(pruned)} {pruned}")
    print(f"  missing: {len(still_missing)} {still_missing}  (no preview found)")
    unknown = sorted(i for i, v in has_art.items() if v is None)
    if unknown:
        print(f"  unknown: {len(unknown)} {unknown}  (art status could not be checked)")
    print(f"  manifest: {len(final)} ids")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
