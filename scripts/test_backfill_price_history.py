"""Tests for scripts/backfill_price_history.py (#950)."""

import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from unittest import mock

import backfill_price_history as bf


class BackfillKeepsGoingTests(unittest.TestCase):
    def run_main(self, download, read_day):
        posted = []
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(bf, "download", download), mock.patch.object(bf, "read_day", read_day), \
                mock.patch.object(bf, "post_day", lambda _u, _t, day, _p: posted.append(day) or {"stored": 1}), \
                mock.patch.object(bf.time, "sleep", lambda _s: None), \
                mock.patch.dict(bf.os.environ, {"CATALOG_SYNC_TOKEN": "t"}), \
                redirect_stdout(out), redirect_stderr(err):
            code = bf.main(["--start", "2024-06-23", "--end", "2024-06-25"])
        return code, posted, out.getvalue() + err.getvalue()

    def test_a_day_whose_download_keeps_failing_is_skipped_and_the_run_continues_950(self):
        def download(url, _dest):
            if "2024-06-24" in url:
                raise RuntimeError(f"could not download {url}")
            return True

        code, posted, log = self.run_main(download, lambda _a, _d: {1: 2.5})
        self.assertEqual(posted, [date(2024, 6, 23), date(2024, 6, 25)])
        self.assertEqual(code, 1)
        self.assertIn("Failed days (re-run each with --start D --end D): 2024-06-24", log)

    def test_a_corrupt_archive_is_skipped_and_the_run_continues_950(self):
        def read_day(_archive, day):
            if day == date(2024, 6, 24):
                raise ValueError("bad 7z header")
            return {1: 2.5}

        code, posted, _log = self.run_main(lambda _u, _d: True, read_day)
        self.assertEqual(posted, [date(2024, 6, 23), date(2024, 6, 25)])
        self.assertEqual(code, 1)

    def test_a_clean_run_exits_zero_950(self):
        code, posted, _log = self.run_main(lambda _u, _d: True, lambda _a, _d: {1: 2.5})
        self.assertEqual(len(posted), 3)
        self.assertEqual(code, 0)


class DownloadRetryTests(unittest.TestCase):
    def test_download_retries_past_three_transient_failures_950(self):
        calls = []

        def urlopen(_req, timeout):
            calls.append(1)
            if len(calls) <= 3:
                raise bf.urllib.error.URLError("reset")
            return io.BytesIO(b"7z")

        with mock.patch.object(bf.urllib.request, "urlopen", urlopen), \
                mock.patch.object(bf.time, "sleep", lambda _s: None), \
                redirect_stderr(io.StringIO()), mock.patch("builtins.open", mock.mock_open()):
            self.assertTrue(bf.download("https://x/prices-2024-06-24.ppmd.7z", "dest"))
        self.assertEqual(len(calls), 4)


if __name__ == "__main__":
    unittest.main()
