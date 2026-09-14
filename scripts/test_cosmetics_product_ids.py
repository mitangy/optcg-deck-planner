#!/usr/bin/env python3
"""Unit tests for cosmetics_common + backfill helpers."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from backfill_cosmetics_product_ids import backfill_catalog, backfill_entry  # noqa: E402
from cosmetics_common import product_id_from_image_url  # noqa: E402
from export_cosmetics_from_planner_db import merge_onto_existing  # noqa: E402


class ProductIdFromUrlTests(unittest.TestCase):
    def test_parses_400w(self) -> None:
        self.assertEqual(
            product_id_from_image_url(
                "https://tcgplayer-cdn.tcgplayer.com/product/712086_400w.jpg"
            ),
            712086,
        )

    def test_parses_200w(self) -> None:
        self.assertEqual(
            product_id_from_image_url(
                "https://tcgplayer-cdn.tcgplayer.com/product/710591_200w.jpg"
            ),
            710591,
        )

    def test_missing(self) -> None:
        self.assertIsNone(product_id_from_image_url(""))
        self.assertIsNone(product_id_from_image_url(None))
        self.assertIsNone(product_id_from_image_url("/cards/OP17-039.png"))


class BackfillTests(unittest.TestCase):
    def test_backfill_primary_and_alts(self) -> None:
        entry = {
            "id": "OP17-039",
            "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/712086_400w.jpg",
            "altArts": [
                {
                    "id": "p1",
                    "label": "Alternate Art",
                    "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/710591_400w.jpg",
                }
            ],
        }
        p, a = backfill_entry(entry)
        self.assertTrue(p)
        self.assertTrue(a)
        self.assertEqual(entry["productId"], 712086)
        self.assertEqual(entry["altArts"][0]["productId"], 710591)

    def test_backfill_catalog_stats(self) -> None:
        catalog = {
            "A": {
                "id": "A",
                "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
            },
            "B": {"id": "B", "imageUrl": "/cards/B.png"},
        }
        stats = backfill_catalog(catalog)
        self.assertEqual(stats["primaries_updated"], 1)
        self.assertEqual(catalog["A"]["productId"], 1)
        self.assertNotIn("productId", catalog["B"])


class MergeExportTests(unittest.TestCase):
    def test_preserves_gameplay_meta(self) -> None:
        existing = {
            "OP01-001": {
                "id": "OP01-001",
                "name": "Old",
                "cost": 5,
                "power": 7000,
                "effectText": "Keep me",
                "type": "leader",
                "colors": ["red"],
                "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/1_400w.jpg",
            }
        }
        exported = {
            "OP01-001": {
                "id": "OP01-001",
                "name": "New Name",
                "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/2_400w.jpg",
                "productId": 2,
                "altArts": [
                    {
                        "id": "p1",
                        "label": "Alternate Art",
                        "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/3_400w.jpg",
                        "productId": 3,
                    }
                ],
            }
        }
        merged = merge_onto_existing(existing, exported)
        row = merged["OP01-001"]
        self.assertEqual(row["effectText"], "Keep me")
        self.assertEqual(row["cost"], 5)
        self.assertEqual(row["power"], 7000)
        self.assertEqual(row["type"], "leader")
        self.assertEqual(row["productId"], 2)
        self.assertEqual(row["imageUrl"], exported["OP01-001"]["imageUrl"])
        self.assertEqual(row["altArts"][0]["productId"], 3)


if __name__ == "__main__":
    unittest.main()
