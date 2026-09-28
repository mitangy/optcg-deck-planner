#!/usr/bin/env python3
"""Collect Bandai metadata candidates; never overwrite reviewed gameplay data.

Usage: py -3 scripts/import_bandai_metadata.py --series 569001 --output artifacts/bandai
Use --all-series instead of --series to discover every listed English series.
Reports distinguish requested-series scope from full discovered-series scope.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from datetime import datetime, timezone
from urllib.request import urlopen

IMPORTER_VERSION = 3
BASE = "https://en.onepiece-cardgame.com/cardlist/"
FIELDS = {"name": "cardName", "colors": "color", "traits": "feature",
          "attributes": "attribute", "power": "power", "counter": "counter",
          "effectText": "text", "triggerText": "trigger"}


class Node:
    def __init__(self, tag="", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, cls):
        if cls in self.attrs.get("class", "").split():
            return self
        for child in self.children:
            if isinstance(child, Node):
                found = child.find(cls)
                if found is not None:
                    return found
        return None

    def text(self):
        if self.tag == "h3":
            return ""
        if self.tag == "br":
            return "\n"
        return "".join(c.text() if isinstance(c, Node) else c for c in self.children)


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.cards = []
        self.series_options = []

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag == "dl" and "modalCol" in node.attrs.get("class", "").split():
            self.cards.append(node)
        if tag == "option" and any(n.tag == "select" and n.attrs.get("id") == "series" for n in self.stack):
            self.series_options.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def clean(value):
    return re.sub(r"\s+", " ", value).strip()


def discover_series(html):
    parser = PageParser()
    parser.feed(html)
    result = {}
    for option in parser.series_options:
        value = option.attrs.get("value", "")
        if not value:
            continue
        if not re.fullmatch(r"\d+", value):
            raise ValueError(f"Unknown series ID: {value}")
        label = clean(re.sub(r"<[^>]+>", " ", option.text()))
        if value in result and result[value] != label:
            raise ValueError(f"Conflicting series labels: {value}")
        result[value] = label
    if not result:
        raise ValueError("No series discovered; refusing an empty refresh")
    return dict(sorted(result.items()))


# Official text writes attributes as literal "<Slash>" inside the HTML, which an
# HTML parser would swallow as tags. Protect them as fullwidth brackets.
ATTRIBUTE_MARKER = re.compile(r"<(Strike|Slash|Special|Wisdom|Ranged)>")


def parse_cards(html):
    html = ATTRIBUTE_MARKER.sub(lambda m: f"\uff1c{m.group(1)}\uff1e", html)
    parser = PageParser()
    parser.feed(html)
    cards = {}
    for node in parser.cards:
        printing_id = node.attrs.get("id", "")
        if not re.fullmatch(r"[A-Z]+\d*-\d+(?:_[pr]\d+)?", printing_id):
            raise ValueError(f"Unknown card ID: {printing_id}")
        info = node.find("infoCol")
        parts = clean(info.text()).split("|") if info else []
        kind = parts[-1].strip().lower() if len(parts) == 3 else ""
        if kind not in {"leader", "character", "event", "stage"}:
            raise ValueError(f"Unknown type for {printing_id}: {kind}")
        row = {"id": re.sub(r"_[pr]\d+$", "", printing_id),
               "printingId": printing_id, "locale": "en", "type": kind}
        status = {"type": "unverified"}
        fields = {**FIELDS, ("life" if kind == "leader" else "cost"): "cost"}
        for field, cls in fields.items():
            element = node.find(cls)
            raw = clean(element.text()) if element else None
            status[field] = "unknown" if raw is None else "unverified"
            value = None if raw in (None, "", "-") else raw
            if field in {"power", "counter", "life", "cost"} and value is not None:
                if not re.fullmatch(r"\d+", value):
                    raise ValueError(f"Invalid {field} on {printing_id}: {value}")
                value = int(value)
            if field in {"colors", "traits", "attributes"} and value is not None:
                value = [part.strip() for part in value.split("/")]
                if field == "colors":
                    value = [part.lower() for part in value]
            row[field] = value
        if not row["name"]:
            raise ValueError(f"Missing name on {printing_id}")
        # Errata notices require a separate review; scraping is not verification.
        status["errata"] = "unknown"
        row["fieldStatus"] = status
        if printing_id in cards:
            raise ValueError(f"Duplicate printing: {printing_id}")
        cards[printing_id] = row
    if not cards:
        raise ValueError("No card records found; refusing an empty refresh")
    return dict(sorted(cards.items()))


def reconcile(cards, catalog, full_catalog=False):
    conflicts = []
    missing_fields = []
    base = {key: row for key, row in cards.items() if key == row["id"]}
    sets = {key.split("-")[0] for key in base}
    for key in sorted(base.keys() & catalog.keys()):
        for field in (*FIELDS, "cost", "life", "type"):
            row = base[key]
            if field in row and field not in catalog[key] and row[field] is not None:
                missing_fields.append({"id": key, "field": field, "candidate": row[field]})
            if field in row and field in catalog[key] and row[field] != catalog[key][field]:
                conflicts.append({"id": key, "field": field,
                                  "stored": catalog[key][field], "candidate": row[field]})
    return {"scope": "all discovered English series" if full_catalog else "requested series only; not full-catalog coverage",
            "additionalIds": sorted(base.keys() - catalog.keys()),
            "missingIds": sorted(catalog.keys() - base.keys()) if full_catalog else None,
            "missingIdsInObservedSets": sorted(key for key in catalog if key.split("-")[0] in sets and key not in base),
            "conflicts": conflicts,
            "missingMetadataFields": missing_fields,
            "setCounts": {prefix: {"officialBaseIds": sum(key.startswith(prefix + "-") for key in base),
                                   "bundledIds": sum(key.startswith(prefix + "-") for key in catalog)}
                          for prefix in sorted(sets | {key.split("-")[0] for key in catalog})},
            "unknownFields": {key: [f for f, state in row["fieldStatus"].items() if state == "unknown"] for key, row in cards.items()}}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def retrieved_at(fetch, url):
    """Original retrieval time for replayed snapshots; now for live fetches."""
    recorded = getattr(fetch, "retrieved", {}).get(url)
    return recorded or datetime.now(timezone.utc).isoformat()


def collect(series, output, catalog, fetch=None, all_series=False):
    fetch = fetch or (lambda url: urlopen(url, timeout=45).read())
    all_cards, sources = {}, []
    discovered = None
    raw_dir = output / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    if all_series:
        raw = fetch(BASE)
        discovered = discover_series(raw.decode("utf-8"))
        series = list(discovered)
        digest = hashlib.sha256(raw).hexdigest()
        (raw_dir / f"{digest}.html").write_bytes(raw)
        sources.append({"url": BASE, "sha256": digest,
                        "retrievedAt": retrieved_at(fetch, BASE)})
    for series_id in sorted(set(series)):
        if not re.fullmatch(r"\d+", series_id):
            raise ValueError("Series must be a numeric Bandai series ID")
        url = f"{BASE}?series={series_id}"
        raw = fetch(url)
        digest = hashlib.sha256(raw).hexdigest()
        cards = parse_cards(raw.decode("utf-8"))
        (raw_dir / f"{digest}.html").write_bytes(raw)
        source = {"url": url, "sha256": digest,
                  "retrievedAt": retrieved_at(fetch, url)}
        sources.append(source)
        for key, row in cards.items():
            existing = all_cards.get(key)
            if existing and {k: v for k, v in existing.items() if k != "sources"} != row:
                raise ValueError(f"Conflicting printing across series: {key}")
            if existing:
                existing["sources"].append({"url": url, "sha256": digest})
            else:
                all_cards[key] = {**row, "sources": [{"url": url, "sha256": digest}]}
    if not all_cards:
        raise ValueError("At least one series is required")
    payload = {"schemaVersion": 1, "importerVersion": IMPORTER_VERSION,
               "series": discovered or {key: None for key in sorted(set(series))},
               "cards": all_cards, "reconciliation": reconcile(all_cards, catalog, all_series)}
    content = encoded(payload)
    digest = hashlib.sha256(content).hexdigest()
    # Candidate is content-addressed; only the manifest changes after every fetch succeeds.
    (output / f"candidate-{digest}.json").write_bytes(content)
    manifest = output / "latest-candidate.tmp"
    manifest.write_bytes(encoded({"candidate": f"candidate-{digest}.json", "sources": sources}))
    manifest.replace(output / "latest-candidate.json")
    return payload


def replay_fetcher(directory):
    """Serve fetches from a previous run's content-addressed raw snapshots."""
    manifest = json.loads((directory / "latest-candidate.json").read_text(encoding="utf-8"))
    by_url = {source["url"]: source["sha256"] for source in manifest["sources"]}
    retrieved = {source["url"]: source.get("retrievedAt") for source in manifest["sources"]}
    def fetch(url):
        digest = by_url.get(url)
        if digest is None:
            raise ValueError(f"No recorded snapshot for {url}")
        raw = (directory / "raw" / f"{digest}.html").read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f"Snapshot hash mismatch for {url}")
        return raw
    fetch.retrieved = retrieved
    return fetch


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    selection = cli.add_mutually_exclusive_group(required=True)
    selection.add_argument("--series", action="append")
    selection.add_argument("--all-series", action="store_true")
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--catalog", type=Path, default=Path(__file__).resolve().parents[1] / "packages/rules/src/cards/catalogMeta.json")
    cli.add_argument("--replay", type=Path, help="Re-parse raw snapshots recorded by a previous run's manifest instead of fetching")
    args = cli.parse_args()
    def fetch_polite(url):
        time.sleep(0.5)
        print(f"Fetching {url}", flush=True)
        return urlopen(url, timeout=45).read()
    fetch = replay_fetcher(args.replay) if args.replay else fetch_polite
    result = collect(args.series, args.output, json.loads(args.catalog.read_text(encoding="utf-8")), fetch, args.all_series)
    print(f"Collected {len(result['cards'])} printings; {len(result['reconciliation']['conflicts'])} conflicts require review.")
