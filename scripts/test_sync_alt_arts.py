#!/usr/bin/env python3
"""Unit tests for the pure planning logic of sync_alt_arts (#581)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_alt_arts import HASH_THRESHOLD, label_for, plan_card  # noqa: E402


def bits(n: int) -> str:
    """A 256-bit hash with `n` bits set, so it is `n` bits from the all-zero hash."""
    return f"{(1 << n) - 1:064x}"


def far(n: int) -> str:
    """A hash `n` bits from the all-zero hash AND from `bits(m)` for other `m` ranges."""
    return f"{((1 << n) - 1) << (256 - n):064x}"


REF = bits(0)


def prod(pid: int, name: str, image: int = 1) -> dict:
    return {"productId": pid, "name": name, "imageCount": image}


def plan(products, hashes, *, primary=1, known=None, taken_ids=None, labels=None):
    return plan_card(
        primary_pid=primary,
        known_pids=set(known or ()),
        taken_ids=set(taken_ids or ()),
        taken_labels=list(labels or ()),
        ref_pids=[primary, *(known or ())],
        products=products,
        hashes={primary: REF, **hashes},
    )


class HashThresholdTests(unittest.TestCase):
    def test_exactly_threshold_bits_apart_is_the_same_art(self) -> None:
        new, stats = plan(
            [prod(2, "Foo (Alternate Art)"), prod(3, "Foo (SP)")],
            {2: bits(HASH_THRESHOLD), 3: bits(HASH_THRESHOLD + 1)},
        )
        self.assertEqual([a["productId"] for a in new], [3])
        self.assertEqual(stats["same_art"], 1)

    def test_art_matching_a_newly_added_alt_is_dropped(self) -> None:
        new, stats = plan(
            [prod(2, "Foo (Alternate Art)"), prod(3, "Foo (Alternate Art)")],
            {2: far(120), 3: far(120)},
        )
        self.assertEqual([a["productId"] for a in new], [2])
        self.assertEqual(stats["same_art"], 1)

    def test_art_matching_an_existing_alt_is_dropped(self) -> None:
        new, _ = plan(
            [prod(3, "Foo (SP)")],
            {2: far(120), 3: far(120)},
            known={2},
            taken_ids={"p1"},
        )
        self.assertEqual(new, [])


class MarkerTests(unittest.TestCase):
    def test_different_art_without_a_marker_is_left_out(self) -> None:
        new, stats = plan([prod(2, "Foo (Dash Pack)")], {2: far(120)})
        self.assertEqual(new, [])
        self.assertEqual(stats["no_marker"], 1)

    def test_image_less_product_with_a_marker_is_added_on_the_marker_alone(self) -> None:
        new, _ = plan([prod(2, "Foo (SP)", image=0)], {})
        self.assertEqual([a["productId"] for a in new], [2])

    def test_image_less_product_without_a_marker_is_left_out(self) -> None:
        new, _ = plan([prod(2, "Foo", image=0)], {})
        self.assertEqual(new, [])


class AppendOnlyTests(unittest.TestCase):
    def test_new_ids_follow_the_highest_existing_id_and_never_reuse_gaps(self) -> None:
        new, _ = plan(
            [prod(5, "Foo (SP)", 0), prod(6, "Foo (Manga)", 0)],
            {},
            taken_ids={"p1", "p3"},
            labels=["Special Art"],
        )
        self.assertEqual([a["id"] for a in new], ["p4", "p5"])

    def test_a_label_the_card_already_has_gets_a_number(self) -> None:
        new, _ = plan(
            [prod(5, "Foo (SP)", 0), prod(6, "Foo (SP)", 0)],
            {},
            taken_ids={"p1"},
            labels=["Special Art"],
        )
        self.assertEqual([a["label"] for a in new], ["Special Art 2", "Special Art 3"])

    def test_the_primary_and_existing_alt_products_are_never_candidates(self) -> None:
        new, _ = plan(
            [prod(1, "Foo (SP)", 0), prod(2, "Foo (SP)", 0)], {}, known={2}, taken_ids={"p1"}
        )
        self.assertEqual(new, [])


class LabelTests(unittest.TestCase):
    def test_premium_card_collection_keeps_a_short_volume(self) -> None:
        self.assertEqual(
            label_for("El Thor (Premium Card Collection -Best Selection Vol. 2-)"),
            "PCC Best Selection Vol. 2",
        )

    def test_sp_and_treasure_rare(self) -> None:
        self.assertEqual(label_for("Nami (SP)"), "Special Art")
        self.assertEqual(label_for("Nami (TR)"), "Treasure Rare")


if __name__ == "__main__":
    unittest.main()
