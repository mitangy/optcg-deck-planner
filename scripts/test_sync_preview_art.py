#!/usr/bin/env python3
"""Unit tests for the pure parts of sync_preview_art (#575)."""

from __future__ import annotations

import struct
import sys
import unittest
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from sync_preview_art import map_files_to_ids, should_prune, webp_size  # noqa: E402


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


if __name__ == "__main__":
    unittest.main()
