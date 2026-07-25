"""Seed catalog from existing optcg_tracker cache and import sample decks."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db import SessionLocal, init_db  # noqa: E402
from app.domain import parse_decklist  # noqa: E402
from app.models import CatalogCard, CatalogMeta, User  # noqa: E402
from app import services  # noqa: E402

TRACKER_DIR = Path(__file__).resolve().parents[2].parent / "optcg_tracker"
CACHE_PATH = TRACKER_DIR / "cache" / "catalog.json"
DECK_FILES = [
    TRACKER_DIR / "Lucy_Barto.txt",
    TRACKER_DIR / "Lucy_Cav.txt",
    TRACKER_DIR / "Teach.txt",
    TRACKER_DIR / "Teach_Boa.txt",
]


def import_catalog_from_cache(db) -> int:
    if not CACHE_PATH.exists():
        print(f"No cache at {CACHE_PATH}; skip catalog import (run API sync later)")
        return 0
    payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    by_number = payload.get("by_number") or {}
    now = datetime.now(timezone.utc)
    count = 0
    for card_id, printings in by_number.items():
        # Prefer standard then cheapest
        def key(p: dict):
            special = 1 if p.get("is_special") else 0
            market = p.get("market_price")
            return (special, market if market is not None else 1e9)

        best = sorted(printings, key=key)[0]
        row = db.get(CatalogCard, card_id)
        fields = dict(
            name=best.get("name") or card_id,
            rarity=best.get("rarity") or "",
            color=best.get("color") or "",
            card_type=best.get("card_type") or "",
            cost=(best.get("cost") or None),
            market_price=best.get("market_price"),
            low_price=best.get("low_price"),
            image_url=best.get("image_url") or "",
            tcgplayer_url=best.get("tcgplayer_url") or "",
            group_name=best.get("group_name") or "",
            is_special=1 if best.get("is_special") else 0,
            updated_at=now,
        )
        if row is None:
            db.add(CatalogCard(card_id=card_id, **fields))
        else:
            for k, v in fields.items():
                setattr(row, k, v)
        count += 1
    meta = db.scalar(select(CatalogMeta).limit(1))
    if meta is None:
        db.add(CatalogMeta(card_count=count, last_synced_at=now, notes="Imported from cache"))
    else:
        meta.card_count = count
        meta.last_synced_at = now
        meta.notes = "Imported from cache"
    db.commit()
    print(f"Imported {count} catalog cards from cache")
    return count


def ensure_dev_user(db) -> User:
    user = db.scalar(select(User).where(User.email == "dev@localhost"))
    if user is None:
        user = User(email="dev@localhost", name="Dev User", google_sub="dev-local")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def seed_decks(db, user: User) -> None:
    existing = {d.name for d in services.list_decks(db, user)}
    for path in DECK_FILES:
        if not path.exists():
            print(f"Missing deck file {path}")
            continue
        name = path.stem
        if name in existing:
            print(f"Deck already exists: {name}")
            continue
        text = path.read_text(encoding="utf-8")
        services.create_deck(db, user, name, text)
        print(f"Seeded deck: {name}")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        import_catalog_from_cache(db)
        user = ensure_dev_user(db)
        seed_decks(db, user)
    finally:
        db.close()


if __name__ == "__main__":
    main()
