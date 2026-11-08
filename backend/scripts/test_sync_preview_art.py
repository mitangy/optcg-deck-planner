#!/usr/bin/env python3
"""Unit tests for the pure parts of sync_preview_art (#575)."""

from __future__ import annotations

import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import sync_preview_art  # noqa: E402
from sync_preview_art import (  # noqa: E402
    alt_should_prune,
    capped_size,
    guide_variant,
    map_files_to_ids,
    match_alt_previews,
    pair_topdecks_alts,
    parse_topdecks_gallery_alts,
    parse_variant_paths,
    should_prune,
    should_upgrade,
    topdecks_type_ok,
    topdecks_url,
    topdecks_urls,
    webp_size,
)


def _vp8(width: int, height: int) -> bytes:
    return b"RIFF\0\0\0\0WEBPVP8 \0\0\0\0" + b"\0" * 6 + struct.pack("<HH", width, height)


class MapFilesToIdsTests(unittest.TestCase):
    def test_only_files_that_start_with_the_exact_id(self) -> None:
        files = [
            "OP18-021 Franky_small.webp",
            "SP EB05-006 Miss Buckingham Stussy_small.webp",
            "ALT Leader Vivi EB03-001_small.webp",
            "OP18-0210 Other_small.webp",
        ]
        got = map_files_to_ids(files, {"OP18-021", "EB05-006", "EB03-001", "OP18-02"})
        self.assertEqual(got, {"OP18-021": "OP18-021 Franky_small.webp"})

    def test_copy_with_parentheses_loses_to_plain_file(self) -> None:
        files = ["OP18-093 MMA (2)_small.webp", "OP18-093 MMA_small.webp", "OP18-093 MMA (3)_small.webp"]
        got = map_files_to_ids(files, {"OP18-093"})
        self.assertEqual(got, {"OP18-093": "OP18-093 MMA_small.webp"})


class ShouldPruneTests(unittest.TestCase):
    def test_prunes_when_the_card_now_has_tcgplayer_art(self) -> None:
        self.assertTrue(should_prune("EB05-001", {"EB05-001"}, {"EB05-001": True}))

    def test_keeps_when_art_is_missing_or_could_not_be_checked(self) -> None:
        self.assertFalse(should_prune("EB05-001", {"EB05-001"}, {"EB05-001": False}))
        self.assertFalse(should_prune("EB05-001", {"EB05-001"}, {"EB05-001": None}))

    def test_prunes_a_card_that_left_the_atlas(self) -> None:
        self.assertTrue(should_prune("EB05-003", {"EB05-001"}, {}))


class WebpSizeTests(unittest.TestCase):
    def test_reads_width_then_height(self) -> None:
        self.assertEqual(webp_size(_vp8(344, 480)), (344, 480))

    def test_rejects_other_data(self) -> None:
        self.assertIsNone(webp_size(b"<html>" + b"\0" * 40))


def _variants(*paths: str) -> list[dict]:
    return [v for v in map(guide_variant, paths) if v]


class AltPreviewMatchTests(unittest.TestCase):
    """Alt previews for image-less printings (#581)."""

    def test_variant_buttons_are_read_from_data_full(self) -> None:
        html = (
            '<img src="/Cards/EB05/EB05-001 Jewelry Bonney_small.webp">'
            '<button data-full="/Cards/EB05/ALT EB05-001 Jewelry Bonney.jpg">ALT</button>'
            '<button data-full="/Cards/OP01/ALT OP01-001 X.jpg">ALT</button>'
        )
        self.assertEqual(
            parse_variant_paths(html, "EB05"), ["/Cards/EB05/ALT EB05-001 Jewelry Bonney.jpg"]
        )

    def test_kind_card_and_version_come_from_the_file_name(self) -> None:
        v = guide_variant("/Cards/EB05/ALT V2 EB05-055 Nami.jpg")
        self.assertEqual((v["kind"], v["card"], v["version"]), ("ALT", "EB05-055", 2))
        leader = guide_variant("/Cards/EB05/ALT Leader Nico Robin EB05-010.jpg")
        self.assertEqual((leader["kind"], leader["card"]), ("ALT", "EB05-010"))
        self.assertEqual(guide_variant("/Cards/EB05/SUPER ALT EB05-010 Nico Robin.jpg")["kind"], "SUPER")
        self.assertEqual(guide_variant("/Cards/EB05/SP OP01-016.jpg")["card"], "OP01-016")

    def test_kind_pairs_the_product_and_prefers_the_unversioned_file(self) -> None:
        files = _variants(
            "/Cards/EB05/ALT V3 EB05-055 Nami.jpg",
            "/Cards/EB05/ALT EB05-055 Nami.jpg",
            "/Cards/EB05/ALT V2 EB05-055 Nami.jpg",
            "/Cards/EB05/SP EB05-055 Nami.jpg",
        )
        alts = [{"pid": 1, "card": "EB05-055", "name": "Nami (Alternate Art)"}]
        matches, left = match_alt_previews(alts, files)
        self.assertEqual(matches, {1: "/Cards/EB05/ALT EB05-055 Nami.jpg"})
        self.assertEqual(left, [])

    def test_alt_and_sp_of_one_card_each_take_their_own_kind(self) -> None:
        files = _variants("/Cards/EB05/SP EB05-016 Nico Robin.jpg", "/Cards/EB05/ALT EB05-016 Nico Robin.jpg")
        alts = [
            {"pid": 1, "card": "EB05-016", "name": "Nico Robin (SP)"},
            {"pid": 2, "card": "EB05-016", "name": "Alternate Art"},
        ]
        matches, _ = match_alt_previews(alts, files)
        self.assertEqual(matches[1], "/Cards/EB05/SP EB05-016 Nico Robin.jpg")
        self.assertEqual(matches[2], "/Cards/EB05/ALT EB05-016 Nico Robin.jpg")

    def test_a_lone_alt_with_a_lone_file_of_another_kind_still_pairs(self) -> None:
        files = _variants("/Cards/EB05/SUPER ALT EB05-010 Nico Robin.jpg")
        alts = [{"pid": 1, "card": "EB05-010", "name": "Nico Robin (Premium Card Collection)"}]
        matches, _ = match_alt_previews(alts, files)
        self.assertEqual(matches, {1: "/Cards/EB05/SUPER ALT EB05-010 Nico Robin.jpg"})

    def test_an_ambiguous_card_is_skipped(self) -> None:
        files = _variants("/Cards/EB05/ALT EB05-010 A.jpg", "/Cards/EB05/SP EB05-010 A.jpg")
        alts = [
            {"pid": 1, "card": "EB05-010", "name": "A (Premium Card Collection)"},
            {"pid": 2, "card": "EB05-010", "name": "A (Treasure Rare)"},
        ]
        matches, left = match_alt_previews(alts, files)
        self.assertEqual(matches, {})
        self.assertEqual(left, [1, 2])

    def test_two_products_of_one_kind_are_not_guessed(self) -> None:
        files = _variants("/Cards/EB05/ALT EB05-010 A.jpg")
        alts = [
            {"pid": 1, "card": "EB05-010", "name": "A (Alternate Art)"},
            {"pid": 2, "card": "EB05-010", "name": "A (Alternate Art)"},
        ]
        self.assertEqual(match_alt_previews(alts, files)[0], {})


class AltPruneTests(unittest.TestCase):
    def test_an_alt_preview_goes_once_tcgplayer_has_the_picture(self) -> None:
        self.assertTrue(alt_should_prune(5, {5}, {5: True}))
        self.assertFalse(alt_should_prune(5, {5}, {5: False}))
        self.assertFalse(alt_should_prune(5, {5}, {}))

    def test_an_alt_preview_goes_when_the_alt_left_the_catalog(self) -> None:
        self.assertTrue(alt_should_prune(5, {6}, {5: False}))


class ExistingPreviewIdsTests(unittest.TestCase):
    def test_alt_preview_files_are_not_base_card_ids_608(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for name in ("EB05-001.webp", "OP18-021A.webp", "p712884.webp", "p5.webp"):
                (folder / name).write_bytes(b"x")
            manifest = folder / "previewArt.json"
            manifest.write_text('["EB05-002"]', encoding="utf-8")
            with mock.patch.object(sync_preview_art, "PREVIEW_DIR", folder), \
                    mock.patch.object(sync_preview_art, "MANIFEST", manifest):
                got = sync_preview_art.existing_preview_ids()
        self.assertEqual(got, {"EB05-001", "OP18-021A", "EB05-002"})


class TopDecksTests(unittest.TestCase):
    def test_url_uses_the_lowercase_set_folder_and_the_exact_id(self) -> None:
        self.assertEqual(
            topdecks_url("EB05-001"),
            "https://onepiecetopdecks.com/wp-content/gallery/eb05/EB05-001.jpg",
        )
        self.assertTrue(topdecks_url("OP18-021A").endswith("/op18/OP18-021A.jpg"))

    def test_regular_art_falls_back_to_p1_never_p2_608(self) -> None:
        urls = topdecks_urls("OP18-119")
        self.assertEqual(
            urls,
            [
                "https://onepiecetopdecks.com/wp-content/gallery/op18/OP18-119.jpg",
                "https://onepiecetopdecks.com/wp-content/gallery/op18/OP18-119_p1.jpg",
            ],
        )
        self.assertEqual(urls[0], topdecks_url("OP18-119"))
        self.assertFalse(any("_p2" in u for u in urls))

    def test_only_jpeg_and_png_bodies_are_accepted(self) -> None:
        self.assertTrue(topdecks_type_ok("image/jpeg"))
        self.assertTrue(topdecks_type_ok("image/png; charset=binary"))
        self.assertFalse(topdecks_type_ok("text/html; charset=UTF-8"))
        self.assertFalse(topdecks_type_ok(""))

    def test_only_previews_under_600px_tall_are_upgraded(self) -> None:
        self.assertTrue(should_upgrade(480))
        self.assertTrue(should_upgrade(599))
        self.assertFalse(should_upgrade(600))
        self.assertFalse(should_upgrade(886))
        self.assertFalse(should_upgrade(None))

    def test_tall_scans_are_scaled_down_to_900_and_small_ones_never_up(self) -> None:
        self.assertEqual(capped_size(632, 886), (632, 886))
        self.assertEqual(capped_size(900, 1200), (675, 900))
        self.assertEqual(capped_size(344, 480), (344, 480))


_GAL = "https://onepiecetopdecks.com/wp-content/gallery/eb05/"


class TopDecksAltTests(unittest.TestCase):
    def test_gallery_links_keep_only_this_sets_alt_art_files_once_615(self) -> None:
        html = (
            f'<a href="{_GAL}EB05-006_p2.jpg"><img data-src="{_GAL}EB05-006_p2.jpg" src="{_GAL}EB05-006_p2.jpg">'
            f'<img src="{_GAL}OP17-109_p3.jpg"><img src="{_GAL}EB05-001.jpg"><img src="{_GAL}EB05-001_p1.jpg">'
            '<img src="https://onepiecetopdecks.com/wp-content/gallery/op18/OP18-001_p2.jpg">'
        )
        self.assertEqual(
            parse_topdecks_gallery_alts(html, "EB05"),
            [_GAL + "EB05-006_p2.jpg", _GAL + "OP17-109_p3.jpg"],
        )

    def test_one_alt_and_one_gallery_file_of_the_card_pair_615(self) -> None:
        alts = [{"pid": 7, "card": "OP17-109", "name": ""}]
        self.assertEqual(pair_topdecks_alts(alts, [_GAL + "OP17-109_p3.jpg"]), {7: _GAL + "OP17-109_p3.jpg"})

    def test_two_gallery_files_for_one_alt_do_not_pair_615(self) -> None:
        alts = [{"pid": 7, "card": "EB05-006", "name": ""}]
        self.assertEqual(pair_topdecks_alts(alts, [_GAL + "EB05-006_p2.jpg", _GAL + "EB05-006_p3.jpg"]), {})

    def test_two_alts_for_one_gallery_file_do_not_pair_615(self) -> None:
        alts = [{"pid": 7, "card": "EB05-006", "name": ""}, {"pid": 8, "card": "EB05-006", "name": ""}]
        self.assertEqual(pair_topdecks_alts(alts, [_GAL + "EB05-006_p2.jpg"]), {})

    def test_another_cards_gallery_file_does_not_pair_615(self) -> None:
        alts = [{"pid": 7, "card": "EB05-006", "name": ""}]
        self.assertEqual(pair_topdecks_alts(alts, [_GAL + "EB05-016_p2.jpg"]), {})


class AltUpgradeSyncTests(unittest.TestCase):
    """sync_alt_previews end to end with the network stubbed out (#615)."""

    def _run(self, files: dict[int, bytes], scan: bytes) -> dict[int, bytes]:
        catalog = {f"EB05-0{pid}": {"altArts": [{"productId": pid}]} for pid in files}
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            for pid, data in files.items():
                (out / f"p{pid}.webp").write_bytes(data)
            urls = [f"{_GAL}EB05-0{pid}_p2.jpg" for pid in files]
            patches = [
                mock.patch.object(sync_preview_art, "PREVIEW_DIR", out),
                mock.patch.object(sync_preview_art, "ALT_MANIFEST", out / "alts.json"),
                mock.patch.object(sync_preview_art, "alt_product_info", lambda pids: {p: (False, "EB05") for p in pids}),
                mock.patch.object(sync_preview_art, "alt_product_names", lambda pids: {}),
                mock.patch.object(sync_preview_art, "_pillow_image", lambda: object()),
                mock.patch.object(sync_preview_art, "topdecks_set_alt_urls", lambda prefix: urls),
                mock.patch.object(sync_preview_art, "download_topdecks_url", lambda image, url: (scan, "")),
            ]
            for patch in patches:
                patch.start()
            try:
                with mock.patch("sys.stdout"):
                    sync_preview_art.sync_alt_previews(catalog, dry_run=False)
            finally:
                mock.patch.stopall()
            return {pid: (out / f"p{pid}.webp").read_bytes() for pid in files}

    def test_a_kept_alt_under_600px_is_replaced_but_a_600px_one_is_not_615(self) -> None:
        small, placed, scan = _vp8(344, 480), _vp8(458, 640), _vp8(568, 790)
        got = self._run({11: small, 12: placed}, scan)
        self.assertEqual(got[11], scan)
        self.assertEqual(got[12], placed)

    def test_a_kept_alt_is_not_replaced_by_a_shorter_picture_615(self) -> None:
        small, scan = _vp8(344, 480), _vp8(300, 400)
        self.assertEqual(self._run({11: small}, scan)[11], small)


if __name__ == "__main__":
    unittest.main()
