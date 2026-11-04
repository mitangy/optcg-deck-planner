#!/usr/bin/env python3
"""Backfill the planner's price history from TCGCSV daily archives (#946).

Usage: python3 scripts/backfill_price_history.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]
                                                 [--step-days N] [--dry-run]

TCGCSV keeps one archive per day (from 2024-02-08) at
https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z. Each holds
`YYYY-MM-DD/<categoryId>/<groupId>/prices` JSON files; category 68 is One Piece.
For every day this downloads the archive, reads the One Piece market prices and
POSTs them to the planner API (`/catalog/price-history/import`, which drops
product ids that are not catalog printings).

Resumable: re-run with a later --start. Re-importing a day overwrites it.
Env: CATALOG_SYNC_TOKEN (required unless --dry-run), API_URL (default Render).
Needs py7zr (`pip install py7zr`).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

CATEGORY_ID = 68
FIRST_ARCHIVE_DAY = date(2024, 2, 8)
ARCHIVE_URL = "https://tcgcsv.com/archive/tcgplayer/prices-{day}.ppmd.7z"
USER_AGENT = "OPTCGWebTracker/1.0"  # tcgcsv answers 401 without one
DEFAULT_API_URL = "https://optcg-api-nutb.onrender.com"
POST_PAUSE_S = 1.0
RETRY_DELAYS_S = (15, 30, 45, 60, 60, 60, 60, 60)  # Render free cold start


def archive_member_pattern(day: date) -> re.Pattern[str]:
    return re.compile(rf"^{day.isoformat()}/{CATEGORY_ID}/(\d+)/prices$")


def prices_from_results(results: list[dict]) -> dict[int, float | None]:
    """productId -> marketPrice. A product with several sub-types (Normal/Foil) keeps the cheapest market,
    matching the catalog sync, which prefers the Normal row and otherwise the lowest."""
    best: dict[int, tuple[bool, float | None]] = {}
    for row in results:
        pid = int(row["productId"])
        market = row.get("marketPrice")
        normal = (row.get("subTypeName") or "").lower() == "normal"
        current = best.get(pid)
        if current is None:
            best[pid] = (normal, market)
            continue
        cur_normal, cur_market = current
        if normal != cur_normal:
            if normal:
                best[pid] = (normal, market)
        elif market is not None and (cur_market is None or market < cur_market):
            best[pid] = (normal, market)
    return {pid: market for pid, (_, market) in best.items()}


def download(url: str, dest: Path) -> bool:
    """Fetch an archive; False when TCGCSV has none for that day (404)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
                while chunk := resp.read(1 << 20):
                    out.write(chunk)
            return True
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return False
            err = f"HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            err = str(exc)
        print(f"  download attempt {attempt}/3 failed: {err}", file=sys.stderr)
        time.sleep(5 * attempt)
    raise RuntimeError(f"could not download {url}")


def read_day(archive: Path, day: date) -> dict[int, float | None]:
    import py7zr

    pattern = archive_member_pattern(day)
    with py7zr.SevenZipFile(archive, mode="r") as z:
        names = [n for n in z.getnames() if pattern.match(n)]
        if not names:
            return {}
        # Extract into a fresh directory; extract only the One Piece entries.
        with tempfile.TemporaryDirectory(prefix="prices-") as tmp:
            z.extract(path=tmp, targets=names)
            prices: dict[int, float | None] = {}
            for name in names:
                data = json.loads((Path(tmp) / name).read_text(encoding="utf-8"))
                prices.update(prices_from_results(data.get("results") or []))
            return prices


def post_day(api_url: str, token: str, day: date, prices: dict[int, float | None]) -> dict:
    body = json.dumps({"day": day.isoformat(), "prices": {str(k): v for k, v in prices.items()}}).encode()
    req = urllib.request.Request(
        f"{api_url}/catalog/price-history/import",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "X-Catalog-Token": token, "User-Agent": USER_AGENT},
    )
    for attempt, delay in enumerate((*RETRY_DELAYS_S, None), start=1):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise SystemExit(f"Auth failed (HTTP {exc.code}): check CATALOG_SYNC_TOKEN matches Render.")
            err = f"HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            err = str(exc)
        if delay is None:
            raise SystemExit(f"Gave up posting {day} after {attempt} attempts ({err}).")
        print(f"  attempt {attempt} failed ({err}); retrying in {delay}s", file=sys.stderr)
        time.sleep(delay)
    raise AssertionError("unreachable")


def days_between(start: date, end: date, step: int):
    day = max(start, FIRST_ARCHIVE_DAY)
    while day <= end:
        yield day
        day += timedelta(days=step)


def main(argv: list[str] | None = None) -> int:
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--start", type=date.fromisoformat, default=FIRST_ARCHIVE_DAY)
    ap.add_argument("--end", type=date.fromisoformat, default=yesterday)
    ap.add_argument("--step-days", type=int, default=1)
    ap.add_argument("--dry-run", action="store_true", help="download and parse, do not POST")
    args = ap.parse_args(argv)
    if args.step_days < 1:
        ap.error("--step-days must be at least 1")

    token = os.environ.get("CATALOG_SYNC_TOKEN", "")
    api_url = (os.environ.get("API_URL") or DEFAULT_API_URL).rstrip("/")
    if not token and not args.dry_run:
        print("CATALOG_SYNC_TOKEN is empty.", file=sys.stderr)
        return 1

    imported = skipped = 0
    for day in days_between(args.start, args.end, args.step_days):
        with tempfile.TemporaryDirectory(prefix="archive-") as tmp:
            archive = Path(tmp) / "prices.7z"
            if not download(ARCHIVE_URL.format(day=day.isoformat()), archive):
                print(f"{day}: no archive, skipped")
                skipped += 1
                continue
            prices = read_day(archive, day)
        if not prices:
            print(f"{day}: no One Piece prices in the archive, skipped")
            skipped += 1
            continue
        if args.dry_run:
            print(f"{day}: {len(prices)} products (dry run)")
        else:
            result = post_day(api_url, token, day, prices)
            print(f"{day}: sent {len(prices)}, stored {result.get('stored')}")
            time.sleep(POST_PAUSE_S)
        imported += 1
    print(f"Done: {imported} days imported, {skipped} skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
