#!/usr/bin/env python3
"""Keep unofficial card preview art in step with what TCGPlayer has posted.

Usage: python3 scripts/sync_preview_art.py [--dry-run]

Cards that are not on Bandai's list yet (cardData source "tcgplayer" /
"bundled") often have no TCGPlayer image for a while. For those, this script
downloads a preview image into `duel-web/public/cards/preview/<ID>.webp` and
lists the id in `duel-web/src/cards/previewArt.json`. duel-web only falls back
to a preview when the real art fails to load, so real art wins as soon as it
is posted.

Base cards prefer onepiecetopdecks.com (Top Decks), which hosts the same scans
at about 2x resolution as JPEG; they are converted to WebP with Pillow (native
size, height capped at 900). When Top Decks has no image, or Pillow is not
installed, the card falls back to opdeckguide.com (small WebP, as before). Kept
previews shorter than 600px are upgraded from Top Decks when it has a taller
one. Alt previews (`p<productId>.webp`) still come from opdeckguide.

On every run it also prunes: a preview whose card now has TCGPlayer art (or is
gone from the atlas) is deleted and dropped from the manifest.

"Has TCGPlayer art" is read from tcgcsv.com (`imageCount` per product), with an
HTTP probe of the CDN image for products tcgcsv does not list. Python standard
library only, plus Pillow when available (optional; without it Top Decks is
skipped). Downloaded files are only checked for type and size, never run.
"""
from __future__ import annotations

import argparse
import io
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
ALT_MANIFEST = ROOT / "duel-web/src/cards/previewArtAlts.json"
PREVIEW_DIR = ROOT / "duel-web/public/cards/preview"
PUBLIC_DIR = ROOT / "duel-web/public"

UA = "Mozilla/5.0"
GUIDE_BASE = "https://opdeckguide.com"
TOPDECKS_BASE = "https://onepiecetopdecks.com"
TOPDECKS_GALLERY = TOPDECKS_BASE + "/wp-content/gallery"
TCGCSV = "https://tcgcsv.com/tcgplayer/68"
CDN = "https://tcgplayer-cdn.tcgplayer.com/product"
MAX_GROUPS = 15
MIN_BYTES = 2000
UPGRADE_BELOW_HEIGHT = 600  # kept previews shorter than this try Top Decks
MAX_PREVIEW_HEIGHT = 900  # converted Top Decks scans are capped to this height
WEBP_QUALITY = 85

CDN_URL_RE = re.compile(r"^https?://tcgplayer-cdn\.tcgplayer\.com/product/(\d+)", re.I)
ID_RE = re.compile(r"^[A-Z0-9]+-\d+[A-Z]?$")
ALT_STEM_RE = re.compile(r"^p\d+$")  # p<productId>.webp is an alt preview, not a card id


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


def topdecks_url(card_id: str) -> str:
    """Top Decks gallery URL of a card: .../gallery/eb05/EB05-001.jpg."""
    return f"{TOPDECKS_GALLERY}/{set_prefix(card_id).lower()}/{card_id}.jpg"


def topdecks_urls(card_id: str) -> list[str]:
    """Candidate Top Decks URLs, best first (#608).

    Some secret rares only exist as <ID>_p1.jpg there (that is the regular art).
    _p2 and higher are alt arts, so they are never tried.
    """
    base = topdecks_url(card_id)
    return [base, base[: -len(".jpg")] + "_p1.jpg"]


def topdecks_type_ok(ctype: str) -> bool:
    """Missing cards answer 404 text/html; only real JPEG / PNG bodies count."""
    return ctype.split(";")[0].strip().lower() in ("image/jpeg", "image/png")


def should_upgrade(current_height: int | None) -> bool:
    """A kept preview is worth a Top Decks lookup when it is low resolution."""
    return current_height is not None and current_height < UPGRADE_BELOW_HEIGHT


def capped_size(width: int, height: int, max_height: int = MAX_PREVIEW_HEIGHT) -> tuple[int, int]:
    """Native size, scaled down (never up) so the height is at most `max_height`."""
    if height <= max_height:
        return width, height
    return max(1, round(width * max_height / height)), max_height


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


class _VariantParser(HTMLParser):
    """`data-full` paths of the ALT / SP / MANGA variant buttons on a set page."""

    def __init__(self, prefix: str):
        super().__init__(convert_charrefs=True)
        self.start = f"/Cards/{prefix}/"
        self.paths: list[str] = []

    def handle_starttag(self, tag, attrs):
        full = dict(attrs).get("data-full") or ""
        if full.startswith(self.start) and full not in self.paths:
            self.paths.append(full)


def parse_variant_paths(html: str, prefix: str) -> list[str]:
    parser = _VariantParser(prefix)
    parser.feed(html)
    return parser.paths


ID_ANYWHERE_RE = re.compile(r"\b([A-Z0-9]+-\d+[A-Z]?)\b")


def guide_variant(path: str) -> dict | None:
    """Kind / card id / version of an opdeckguide variant file, or None.

    "ALT V2 EB05-055 Nami.jpg" -> ALT, EB05-055, 2; "ALT Leader Nico Robin
    EB05-010.jpg" -> ALT, EB05-010, 1; "SUPER ALT ..." -> SUPER; "SP OP01-016.jpg"
    -> SP. The card id is the first id-shaped word (leader files put it last).
    """
    base = path.rsplit("/", 1)[-1]
    stem = re.sub(r"(_small)?\.[a-z0-9]+$", "", base, flags=re.I)
    m = ID_ANYWHERE_RE.search(stem)
    if not m:
        return None
    words = stem[: m.start()].split()
    if "SUPER" in words:
        kind = "SUPER"
    elif words and words[0] in ("ALT", "SP", "MANGA"):
        kind = words[0]
    else:
        return None
    version = next((int(w[1:]) for w in words if re.fullmatch(r"V\d+", w)), 1)
    return {"path": path, "kind": kind, "card": m.group(1), "version": version}


def tcg_alt_kind(name: str) -> str | None:
    """Which opdeckguide kind a TCGPlayer alt product name pairs with."""
    n = name.lower()
    if "manga" in n:
        return "MANGA"
    if "(sp)" in n:
        return "SP"
    if "alternate art" in n or "alt art" in n:
        return "ALT"
    return None


def match_alt_previews(alts: list[dict], variants: list[dict]) -> tuple[dict[int, str], list[int]]:
    """productId -> variant path for image-less alt products, plus the unmatched.

    `alts`: {pid, card, name}; `variants`: guide_variant() results. A product
    pairs with the lowest-version file of its kind when it is the card's only
    product of that kind. Failing that, a card with exactly one leftover alt and
    exactly one leftover file kind pairs those two. Otherwise it is skipped.
    """
    matches: dict[int, str] = {}
    for card in sorted({a["card"] for a in alts}):
        mine = [a for a in alts if a["card"] == card]
        files = [v for v in variants if v["card"] == card]
        by_kind: dict[str, list[dict]] = {}
        for v in files:
            by_kind.setdefault(v["kind"], []).append(v)
        left = []
        for a in mine:
            kind = tcg_alt_kind(a["name"])
            same = [x for x in mine if tcg_alt_kind(x["name"]) == kind]
            if kind and len(same) == 1 and kind in by_kind:
                matches[a["pid"]] = min(by_kind.pop(kind), key=lambda v: v["version"])["path"]
            else:
                left.append(a)
        if len(left) == 1 and len(by_kind) == 1:
            (group,) = by_kind.values()
            matches[left[0]["pid"]] = min(group, key=lambda v: v["version"])["path"]
    return matches, sorted(a["pid"] for a in alts if a["pid"] not in matches)


def alt_should_prune(pid: int, catalog_alt_pids: set[int], has_art: dict[int, bool | None]) -> bool:
    """An alt preview goes when its product left the catalog or TCGPlayer posted art."""
    return pid not in catalog_alt_pids or has_art.get(pid) is True


# --- network ----------------------------------------------------------------


def fetch(url: str, timeout: int = 60, referer: str | None = None) -> tuple[bytes, str]:
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
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


def alt_product_info(pids: set[int]) -> dict[int, tuple[bool, str]]:
    """productId -> (has art, set code that dominates its group), newest groups first."""
    found: dict[int, tuple[bool, str]] = {}
    if not pids:
        return found
    try:
        groups = fetch_json(f"{TCGCSV}/groups")["results"]
    except Exception as e:  # noqa: BLE001
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
        counts: dict[str, int] = {}
        for p in products:
            num = next((e["value"] for e in p.get("extendedData", []) if e.get("name") == "Number"), "")
            if "-" in num:
                pre = set_prefix(num.strip().upper())
                counts[pre] = counts.get(pre, 0) + 1
        prefix = max(counts, key=counts.get) if counts else ""
        for p in products:
            if p["productId"] in pids:
                found[p["productId"]] = (int(p.get("imageCount") or 0) > 0, prefix)
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
        ids |= {p.stem for p in PREVIEW_DIR.glob("*.webp") if not ALT_STEM_RE.match(p.stem)}
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


def _pillow_image():
    """Pillow's Image module, or None (the daily routine environment may lack it)."""
    try:
        from PIL import Image  # noqa: PLC0415 - optional dependency
    except ImportError:
        return None
    return Image


def jpeg_to_webp(Image, data: bytes) -> tuple[bytes | None, str]:
    """Decode a Top Decks scan and re-encode as WebP at native size (height capped)."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        img = img.convert("RGB")
        w, h = img.size
        if w >= h:
            return None, f"not portrait ({w}x{h})"
        size = capped_size(w, h)
        if size != (w, h):
            img = img.resize(size, Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "WEBP", quality=WEBP_QUALITY, method=6)
    except Exception as e:  # noqa: BLE001 - a bad body must not abort the run
        return None, f"undecodable image: {e}"
    return out.getvalue(), ""


def download_topdecks(Image, card_id: str) -> tuple[bytes | None, str]:
    """A card's Top Decks scan as WebP bytes, or (None, why)."""
    why = "no url"
    for url in topdecks_urls(card_id):
        try:
            data, ctype = fetch(url, timeout=30, referer=TOPDECKS_BASE + "/")
        except urllib.error.HTTPError as e:
            why = f"HTTP {e.code}"
            continue
        except Exception as e:  # noqa: BLE001
            why = f"download failed: {e}"
            continue
        if not topdecks_type_ok(ctype):
            why = f"not a jpeg/png ({ctype or 'no content-type'})"
            continue
        if len(data) < MIN_BYTES:
            why = "tiny image"
            continue
        out, why = jpeg_to_webp(Image, data)
        if out is not None:
            return out, ""
    return None, why


def preview_height(card_id: str) -> int | None:
    path = PREVIEW_DIR / f"{card_id}.webp"
    if not path.is_file():
        return None
    size = webp_size(path.read_bytes())
    return size[1] if size else None


def existing_alt_preview_pids() -> set[int]:
    pids = set(load_json(ALT_MANIFEST)) if ALT_MANIFEST.exists() else set()
    if PREVIEW_DIR.is_dir():
        pids |= {int(p.stem[1:]) for p in PREVIEW_DIR.glob("p[0-9]*.webp")}
    return pids


def sync_alt_previews(catalog: dict, dry_run: bool) -> None:
    """Preview scans for catalog alts TCGPlayer has no picture for yet (#581)."""
    alts: dict[int, dict] = {}
    for card_id, row in catalog.items():
        for a in row.get("altArts") or []:
            pid = a.get("productId") or product_id_from_url(a.get("imageUrl"))
            if pid:
                alts[pid] = {"pid": pid, "card": card_id, "name": ""}
    have = existing_alt_preview_pids()
    info = alt_product_info(set(alts))
    has_art: dict[int, bool | None] = {pid: v[0] for pid, v in info.items()}
    for pid in have - info.keys():
        has_art[pid] = cdn_has_art(pid)
    pruned = sorted(pid for pid in have if alt_should_prune(pid, set(alts), has_art))
    keep = have - set(pruned)
    # Names are only needed to pair kinds; read them from tcgcsv per needed group.
    needs = sorted(pid for pid, (art, _) in info.items() if not art and pid not in keep)
    names = alt_product_names(set(needs))
    by_prefix: dict[str, list[dict]] = {}
    for pid in needs:
        by_prefix.setdefault(info[pid][1], []).append({**alts[pid], "name": names.get(pid, "")})

    added: list[int] = []
    unmatched: list[int] = []
    new_files: dict[int, bytes] = {}
    for prefix, group in sorted(by_prefix.items()):
        try:
            html = fetch(f"{GUIDE_BASE}/cards-list/{prefix}/")[0].decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  {prefix}: list page unavailable: {e}", file=sys.stderr)
            unmatched += [a["pid"] for a in group]
            continue
        variants = [v for v in map(guide_variant, parse_variant_paths(html, prefix)) if v]
        matches, left = match_alt_previews(group, variants)
        unmatched += left
        for pid, path in sorted(matches.items()):
            if dry_run:
                added.append(pid)
                continue
            small = re.sub(r"\.[a-z0-9]+$", "_small.webp", path, flags=re.I)
            data, why = download_preview(prefix, str(pid), small)
            if data is None:
                print(f"  alt {pid}: {why}", file=sys.stderr)
                unmatched.append(pid)
                continue
            new_files[pid] = data
            added.append(pid)

    final = sorted(keep | set(added))
    if not dry_run:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        for pid, data in new_files.items():
            (PREVIEW_DIR / f"p{pid}.webp").write_bytes(data)
        for pid in pruned:
            (PREVIEW_DIR / f"p{pid}.webp").unlink(missing_ok=True)
        ALT_MANIFEST.write_text(json.dumps(final, indent=2) + "\n", encoding="utf-8")
    print("\nAlt preview art")
    print(f"  kept:      {len(keep)}")
    print(f"  added:     {len(added)} {sorted(added)}")
    print(f"  pruned:    {len(pruned)} {pruned}")
    print(f"  unmatched: {len(unmatched)} {sorted(unmatched)}  (no opdeckguide file paired)")
    print(f"  manifest:  {len(final)} product ids")


def alt_product_names(pids: set[int]) -> dict[int, str]:
    """productId -> product name, from the newest tcgcsv groups."""
    names: dict[int, str] = {}
    if not pids:
        return names
    groups = fetch_json(f"{TCGCSV}/groups")["results"]
    groups.sort(key=lambda g: g.get("publishedOn", ""), reverse=True)
    for group in groups[:MAX_GROUPS]:
        if pids <= names.keys():
            break
        try:
            for p in fetch_json(f"{TCGCSV}/{group['groupId']}/products")["results"]:
                if p["productId"] in pids:
                    names[p["productId"]] = p["name"]
        except Exception as e:  # noqa: BLE001
            print(f"  tcgcsv group {group['groupId']} failed: {e}", file=sys.stderr)
    return names


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
    Image = _pillow_image()
    if Image is None:
        print("  Pillow not installed: skipping Top Decks, using opdeckguide only", file=sys.stderr)

    # Top Decks first (not probed in a dry run); the rest falls back to opdeckguide.
    if Image is not None and not args.dry_run:
        for cid in list(needs):
            data, why = download_topdecks(Image, cid)
            if data is None:
                print(f"  {cid}: top decks: {why}", file=sys.stderr)
                continue
            new_files[cid] = data
            added.append(cid)
            still_missing.remove(cid)

    # Kept low-resolution previews: replace with a taller Top Decks scan.
    upgraded: list[str] = []
    upgrade_candidates = sorted(i for i in keep if should_upgrade(preview_height(i)))
    for cid in upgrade_candidates:
        if args.dry_run:
            upgraded.append(cid)
            continue
        if Image is None:
            break
        data, why = download_topdecks(Image, cid)
        if data is None:
            print(f"  {cid}: upgrade skipped, top decks: {why}", file=sys.stderr)
            continue
        old_h, new_h = preview_height(cid) or 0, (webp_size(data) or (0, 0))[1]
        if new_h <= old_h:
            print(f"  {cid}: upgrade skipped, not taller ({new_h} <= {old_h})", file=sys.stderr)
            continue
        new_files[cid] = data
        upgraded.append(cid)

    for prefix in sorted({set_prefix(i) for i in still_missing}):
        wanted = {i for i in still_missing if set_prefix(i) == prefix}
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
    note = "  (candidates, not downloaded)" if args.dry_run else ""
    print(f"  upgraded: {len(upgraded)} {upgraded}{note}")
    print(f"  pruned:  {len(pruned)} {pruned}")
    print(f"  missing: {len(still_missing)} {still_missing}  (no preview found)")
    unknown = sorted(i for i, v in has_art.items() if v is None)
    if unknown:
        print(f"  unknown: {len(unknown)} {unknown}  (art status could not be checked)")
    print(f"  manifest: {len(final)} ids")
    sync_alt_previews(catalog, args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
