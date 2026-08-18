from __future__ import annotations

from datetime import datetime, timezone

from app import services
from app.models import CatalogMeta, CatalogPrinting


def test_hash_manifest_only_includes_hashed_printings(db):
    db.add(
        CatalogPrinting(
            card_id="OP01-001",
            product_id=111,
            name="Monkey.D.Luffy",
            image_url="https://tcgplayer.example/111.jpg",
            phash="abcd1234abcd1234",
            phash_source="https://tcgplayer.example/111.jpg",
        )
    )
    # No hash yet — should be excluded from the manifest.
    db.add(
        CatalogPrinting(
            card_id="OP01-002",
            product_id=222,
            name="Roronoa Zoro",
            image_url="https://tcgplayer.example/222.jpg",
        )
    )
    db.commit()

    manifest = services.hash_manifest(db)
    assert [p.product_id for p in manifest.printings] == [111]
    assert manifest.printings[0].phash == "abcd1234abcd1234"
    assert manifest.version == "0"  # no CatalogMeta row yet


def test_hash_manifest_version_tracks_phash_synced_at(db):
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    db.add(CatalogMeta(card_count=1, phash_synced_at=now))
    db.commit()

    manifest = services.hash_manifest(db)
    # SQLite (used in this test) drops tz-awareness on read; Postgres would
    # round-trip it, so compare the naive form rather than the exact string.
    assert manifest.version == now.replace(tzinfo=None).isoformat()
