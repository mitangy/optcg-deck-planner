#!/usr/bin/env python3
"""Unit tests for the pure planning logic of sync_alt_arts (#581)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sync_alt_arts import HASH_THRESHOLD, label_for, plan_card, suffix_label  # noqa: E402


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
    def test_image_less_product_with_a_marker_is_added_on_the_marker_alone(self) -> None:
        new, _ = plan([prod(2, "Foo (SP)", image=0)], {})
        self.assertEqual([a["productId"] for a in new], [2])

    def test_image_less_product_without_a_marker_is_left_out(self) -> None:
        new, _ = plan([prod(2, "Foo", image=0)], {})
        self.assertEqual(new, [])


class UnmarkedProductTests(unittest.TestCase):
    def test_unmarked_product_with_different_art_is_added_with_its_suffix_label_590(self) -> None:
        new, _ = plan([prod(2, "Foo (Dash Pack)")], {2: far(120)})
        self.assertEqual([(a["productId"], a["label"]) for a in new], [(2, "Dash Pack")])

    def test_unmarked_product_with_the_same_art_is_left_out_590(self) -> None:
        new, stats = plan([prod(2, "Foo (Dash Pack)")], {2: bits(10)})
        self.assertEqual(new, [])
        self.assertEqual(stats["same_art"], 1)

    def test_unmarked_image_less_product_is_left_out_even_with_a_suffix_590(self) -> None:
        new, stats = plan([prod(2, "Foo (Dash Pack)", image=0)], {})
        self.assertEqual(new, [])
        self.assertEqual(stats["no_marker"], 1)

    def test_unmarked_product_needs_a_real_picture_of_the_primary_590(self) -> None:
        # The primary's own scan is still "Image Coming Soon": nothing to compare with.
        new, stats = plan_card(
            primary_pid=1,
            known_pids=set(),
            taken_ids=set(),
            taken_labels=[],
            ref_pids=[1],
            products=[prod(2, "Foo (Dash Pack)")],
            hashes={2: far(120)},
        )
        self.assertEqual(new, [])
        self.assertEqual(stats["no_primary_art"], 1)

    def test_marked_product_keeps_its_old_label_590(self) -> None:
        new, _ = plan([prod(2, "Foo (SP)"), prod(3, "Foo (Alternate Art)")], {2: far(120), 3: bits(200)})
        self.assertEqual([a["label"] for a in new], ["Special Art", "Alternate Art"])

    def test_two_unmarked_products_with_one_suffix_are_numbered_590(self) -> None:
        new, _ = plan(
            [prod(2, "Foo (Dash Pack)"), prod(3, "Foo (Dash Pack)")], {2: far(120), 3: bits(200)}
        )
        self.assertEqual([a["label"] for a in new], ["Dash Pack", "Dash Pack 2"])


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


class SuffixLabelTests(unittest.TestCase):
    def test_label_is_the_last_parenthesised_part_590(self) -> None:
        self.assertEqual(suffix_label("Nami (Dash Pack)"), "Dash Pack")
        self.assertEqual(suffix_label("Nami (OP01-016) (Gift Collection 2023)"), "Gift Collection 2023")

    def test_a_trailing_bracket_tag_is_ignored_590(self) -> None:
        self.assertEqual(
            suffix_label("Jewelry Bonney (Tournament Pack Vol. 3) [Participant]"), "Tournament Pack Vol. 3"
        )

    def test_no_suffix_or_a_card_number_suffix_is_promo_590(self) -> None:
        self.assertEqual(suffix_label("Koala - OP05-006"), "Promo")
        self.assertEqual(suffix_label("Zoro (001)"), "Promo")
        self.assertEqual(suffix_label("Zoro (ST21-001)"), "Promo")

    def test_anniversary_sets_get_a_short_year_and_language_590(self) -> None:
        self.assertEqual(suffix_label("Luffy (English Version 1st Anniversary Set)"), "Anniversary (1st, EN)")
        self.assertEqual(suffix_label("Luffy (One Piece Japanese Version 2nd Anniversary Set)"), "Anniversary (2nd, JP)")

    def test_long_names_are_trimmed_but_keep_the_identifying_part_590(self) -> None:
        self.assertEqual(suffix_label("Zoro (Offline Regional Participation Pack 2025 Vol.1)"), "Offline Regional 2025 Vol.1")
        self.assertEqual(suffix_label("Zoro (Seven Warlords of the Sea Binder Set)"), "Seven Warlords Binder")
        self.assertEqual(suffix_label("Zoro (CS 26-27 Top Player Pack Vol. 1)"), "CS 26-27 Top Player Vol. 1")
        self.assertEqual(
            suffix_label("Zoro (3rd Anniversary Treasure Campaign Pack)"), "3rd Anniv. Treasure Campaign"
        )
        long = suffix_label("Zoro (Some Extremely Long Event Name That Never Ends Vol. 12)")
        self.assertLessEqual(len(long), 28)
        self.assertTrue(long.startswith("Some Extremely Long"))


if __name__ == "__main__":
    unittest.main()
