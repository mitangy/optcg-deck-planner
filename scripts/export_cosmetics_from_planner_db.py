#!/usr/bin/env python3
"""Export duel cosmetics cardCatalog.json from the planner catalog DB.

Reads local SQLite `backend/optcg.db` (or `DATABASE_URL` if set) tables
`catalog_cards` + `catalog_printings`, then merges art / productIds / altArts
onto the existing build-time JSON so gameplay meta (effectText, cost, power, …)
from TCGCSV remains intact.

Does not wipe the JSON when the DB is empty or missing tables.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# Allow `python3 scripts/export_cosmetics_from_planner_db.py` from repo root.
_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from cosmetics_common import (  # noqa: E402
    SPECIAL_MARKERS,
    alt_label,
    is_special_name,
    normalize_cosmetics_image_url,
    product_id_from_image_url,
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "duel-web" / "src" / "assets" / "cardCatalog.json"
DEFAULT_SQLITE = ROOT / "backend" / "optcg.db"


def _special_markers() -> tuple[str, ...]:
    """Prefer planner domain markers when the backend package is importable."""
    try:
        sys.path.insert(0, str(ROOT / "backend"))
        from app.domain import SPECIAL_NAME_MARKERS  # type: ignore

        # Union cosmetics + planner markers so either source stays consistent.
        merged = tuple(dict.fromkeys((*SPECIAL_MARKERS, *SPECIAL_NAME_MARKERS)))
        return merged
    except Exception:
        return SPECIAL_MARKERS


def _connect():
    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if database_url.startswith("postgres"):
        try:
            import sqlalchemy
        except ImportError as exc:
            raise SystemExit(
                "DATABASE_URL is Postgres but sqlalchemy is not installed. "
                "Install backend deps or unset DATABASE_URL to use local SQLite."
            ) from exc
        return sqlalchemy.create_engine(database_url).connect()

    env_path = os.environ.get("OPTCG_DB")
    sqlite_path = Path(env_path) if env_path else DEFAULT_SQLITE
    if not sqlite_path.is_file():
        raise SystemExit(
            f"Planner DB not found at {sqlite_path}. "
            "Sync the catalog first, or set DATABASE_URL / OPTCG_DB. "
            "Existing cardCatalog.json was not modified."
        )
    return sqlite3.connect(str(sqlite_path))


def _fetch_rows(conn) -> tuple[list[dict], list[dict]]:
    """Return (catalog_cards, catalog_printings) as list of dicts."""
    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if database_url.startswith("postgres"):
        from sqlalchemy import text

        try:
            cards = [dict(r._mapping) for r in conn.execute(text("SELECT * FROM catalog_cards"))]
            printings = [
                dict(r._mapping) for r in conn.execute(text("SELECT * FROM catalog_printings"))
            ]
        except Exception as exc:
            raise SystemExit(
                f"Could not read catalog tables ({exc}). "
                "Existing cardCatalog.json was not modified."
            ) from exc
        return cards, printings

    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cards = [dict(r) for r in cur.execute("SELECT * FROM catalog_cards")]
        printings = [dict(r) for r in cur.execute("SELECT * FROM catalog_printings")]
    except sqlite3.Error as exc:
        raise SystemExit(
            f"Could not read catalog tables ({exc}). "
            "Existing cardCatalog.json was not modified."
        ) from exc
    return cards, printings


def _printing_is_special(row: dict, markers: tuple[str, ...]) -> bool:
    flag = row.get("is_special")
    if flag is not None and int(flag) == 1:
        return True
    return is_special_name(str(row.get("name") or ""), markers)


def _build_from_db(
    cards: list[dict],
    printings: list[dict],
    markers: tuple[str, ...],
) -> dict[str, dict]:
    by_card: dict[str, list[dict]] = defaultdict(list)
    for row in printings:
        cid = (row.get("card_id") or "").strip().upper()
        if not cid:
            continue
        by_card[cid].append(row)

    card_by_id = {
        (c.get("card_id") or "").strip().upper(): c
        for c in cards
        if (c.get("card_id") or "").strip()
    }

    out: dict[str, dict] = {}
    for card_id, rows in by_card.items():
        preferred = card_by_id.get(card_id)
        # Preferred face: CatalogCard row when present, else best non-special printing.
        if preferred is not None:
            pref_img = (preferred.get("image_url") or "").strip()
            pref_name = preferred.get("name") or card_id
            # Match product id to preferred image when possible.
            primary_pid: int | None = product_id_from_image_url(pref_img)
            if not primary_pid:
                for row in sorted(
                    rows,
                    key=lambda r: (
                        int(_printing_is_special(r, markers)),
                        int(r.get("product_id") or 0),
                    ),
                ):
                    if not _printing_is_special(row, markers):
                        primary_pid = int(row.get("product_id") or 0) or None
                        if not pref_img:
                            pref_img = (row.get("image_url") or "").strip()
                        break
            if not primary_pid and rows:
                primary_pid = int(rows[0].get("product_id") or 0) or None
        else:
            rows_sorted = sorted(
                rows,
                key=lambda r: (
                    int(_printing_is_special(r, markers)),
                    int(r.get("product_id") or 0),
                ),
            )
            best = rows_sorted[0]
            pref_name = best.get("name") or card_id
            pref_img = (best.get("image_url") or "").strip()
            primary_pid = int(best.get("product_id") or 0) or None

        image_url = normalize_cosmetics_image_url(pref_img, primary_pid)
        entry: dict = {
            "id": card_id,
            "name": re_sub_qty(str(pref_name)),
            "imageUrl": image_url,
        }
        if primary_pid and primary_pid > 0:
            entry["productId"] = primary_pid

        alt_arts: list[dict] = []
        seen_urls: set[str] = set()
        if image_url:
            seen_urls.add(image_url)
        primary_pid_set = {primary_pid} if primary_pid else set()

        specials = [
            r
            for r in rows
            if _printing_is_special(r, markers)
            and int(r.get("product_id") or 0) not in primary_pid_set
        ]
        specials.sort(key=lambda r: int(r.get("product_id") or 0))
        for row in specials:
            pid = int(row.get("product_id") or 0)
            url = normalize_cosmetics_image_url(row.get("image_url"), pid if pid else None)
            if not url or url in seen_urls:
                continue
            # Skip specials that reuse the preferred face art.
            if pref_img and (row.get("image_url") or "").strip() == pref_img:
                continue
            seen_urls.add(url)
            alt: dict = {
                "id": f"p{len(alt_arts) + 1}",
                "label": alt_label(str(row.get("name") or "")),
                "imageUrl": url,
            }
            if pid > 0:
                alt["productId"] = pid
            alt_arts.append(alt)
        if alt_arts:
            entry["altArts"] = alt_arts
        out[card_id] = entry
    return out


def re_sub_qty(name: str) -> str:
    import re

    return re.sub(r"\s*\(\d+\)\s*$", "", name).strip() or name


# Art / identity fields refreshed from the planner DB; gameplay meta is preserved.
_ART_KEYS = ("imageUrl", "productId", "altArts", "name")


def merge_onto_existing(existing: dict[str, dict], exported: dict[str, dict]) -> dict[str, dict]:
    """Refresh art/productIds/alts; keep effectText/cost/power/type/… from existing."""
    merged = dict(existing)
    for card_id, art in exported.items():
        prev = dict(merged.get(card_id) or {})
        if not prev:
            # New id from DB only — keep art-focused shape; full meta needs TCGCSV.
            merged[card_id] = {k: v for k, v in art.items() if v is not None and v != []}
            continue
        for key in _ART_KEYS:
            if key in art and art[key] is not None and art[key] != []:
                prev[key] = art[key]
            elif key == "altArts" and "altArts" not in art:
                prev.pop("altArts", None)
        # Ensure id stays canonical.
        prev["id"] = card_id
        merged[card_id] = {k: v for k, v in prev.items() if v is not None and v != []}
    return merged


def main() -> None:
    markers = _special_markers()
    conn = _connect()
    try:
        cards, printings = _fetch_rows(conn)
    finally:
        conn.close()

    if not cards and not printings:
        raise SystemExit(
            "Planner catalog is empty (no catalog_cards / catalog_printings rows). "
            "Run a catalog sync first. Existing cardCatalog.json was not modified."
        )
    if not printings:
        raise SystemExit(
            "No catalog_printings rows found. Existing cardCatalog.json was not modified."
        )

    exported = _build_from_db(cards, printings, markers)
    out_path = Path(os.environ.get("COSMETICS_OUT") or DEFAULT_OUT)
    existing: dict[str, dict] = {}
    if out_path.is_file():
        existing = json.loads(out_path.read_text(encoding="utf-8"))
        if not isinstance(existing, dict):
            existing = {}

    merged = merge_onto_existing(existing, exported)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    with_alts = sum(1 for v in merged.values() if v.get("altArts"))
    with_pid = sum(1 for v in merged.values() if v.get("productId"))
    print(
        f"merged {len(exported)} DB cards → {out_path} "
        f"({len(merged)} total, {with_alts} with altArts, {with_pid} with productId)"
    )


if __name__ == "__main__":
    main()
