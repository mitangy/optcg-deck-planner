"""Offline contract tests for candidate ingestion and failed refresh recovery."""
import json
from pathlib import Path
import tempfile
import unittest

from import_bandai_metadata import collect, parse_cards, reconcile, discover_series, BASE


def card(kind="CHARACTER", card_id="ST01-002", counter="-", trigger=True):
    return f'''<dl class="modalCol" id="{card_id}"><dt>
      <div class="infoCol"><span>{card_id.split('_')[0]}</span> | <span>C</span> | <span>{kind}</span></div>
      <div class="cardName">A &amp; B</div></dt><dd>
      <div class="cost"><h3>Cost</h3>5</div>
      <div class="power"><h3>Power</h3>5000</div>
      <div class="counter"><h3>Counter</h3>{counter}</div>
      <div class="color"><h3>Color</h3>Red/Green</div>
      <div class="feature"><h3>Type</h3>Straw Hat Crew</div>
      <div class="text"><h3>Effect</h3>[DON!! x2] This card gains [Rush].</div>
      {'<div class="trigger"><h3>Trigger</h3>[Trigger] Draw 1 card.</div>' if trigger else ''}
      </dd></dl>'''


class BandaiMetadataTests(unittest.TestCase):
    def test_discovery_and_full_scope(self):
        html = '<select id="unrelated"><option value="999">Ignore</option></select><select id="series"><option value>ALL</option><option value="569001">Starter &lt;br&gt; [ST-01]</option></select>'
        self.assertEqual(discover_series(html), {"569001": "Starter [ST-01]"})
        with tempfile.TemporaryDirectory() as directory:
            result = collect(None, Path(directory), {"OP18-001": {}},
                             lambda url: (html if url == BASE else card()).encode(), True)
            self.assertEqual(result["reconciliation"]["missingIds"], ["OP18-001"])
            self.assertEqual(result["series"], {"569001": "Starter [ST-01]"})
        with self.assertRaises(ValueError):
            discover_series("<html>Maintenance</html>")

    def test_all_card_types_and_leader_life(self):
        for kind in ("LEADER", "CHARACTER", "EVENT", "STAGE"):
            row = parse_cards(card(kind))["ST01-002"]
            self.assertEqual(row["type"], kind.lower())
            self.assertEqual(row["life" if kind == "LEADER" else "cost"], 5)
            self.assertNotIn("cost" if kind == "LEADER" else "life", row)
            self.assertEqual(row["traits"], ["Straw Hat Crew"])
            self.assertEqual(row["name"], "A & B")
            self.assertNotIn("rush", row)
            self.assertEqual(row["triggerText"], "[Trigger] Draw 1 card.")
            self.assertNotIn("verified", row["fieldStatus"].values())

    def test_absent_and_blank_are_distinguishable(self):
        row = parse_cards(card(trigger=False))["ST01-002"]
        self.assertIsNone(row["counter"])
        self.assertEqual(row["fieldStatus"]["counter"], "unverified")
        self.assertIsNone(row["triggerText"])
        self.assertEqual(row["fieldStatus"]["triggerText"], "unknown")

    def test_printings_and_conflicts(self):
        rows = parse_cards(card() + card(card_id="ST01-002_p1"))
        self.assertEqual(rows["ST01-002_p1"]["id"], "ST01-002")
        report = reconcile(rows, {"ST01-002": {"cost": 3}, "ST01-003": {}, "OP01-001": {}})
        self.assertEqual(report["missingIdsInObservedSets"], ["ST01-003"])
        self.assertEqual(report["conflicts"][0]["field"], "cost")
        self.assertEqual(report["additionalIds"], [])
        self.assertIn({"id": "ST01-002", "field": "traits", "candidate": ["Straw Hat Crew"]}, report["missingMetadataFields"])
        self.assertEqual(report["setCounts"]["ST01"], {"officialBaseIds": 1, "bundledIds": 2})

    def test_cross_series_duplicates_keep_provenance_and_reject_conflicts(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            result = collect(["1", "2"], output, {}, lambda url: card().encode())
            self.assertEqual(len(result["cards"]["ST01-002"]["sources"]), 2)
            previous = (output / "latest-candidate.json").read_bytes()
            with self.assertRaises(ValueError):
                collect(["1", "2"], output, {}, lambda url: card(counter="1000" if url.endswith("2") else "-").encode())
            self.assertEqual(previous, (output / "latest-candidate.json").read_bytes())

    def test_malformed_refresh_is_rejected(self):
        for html in ("<html>Maintenance</html>", card(counter="oops"), card() + card()):
            with self.assertRaises(ValueError):
                parse_cards(html)

    def test_deterministic_candidates_and_partial_failure_preserves_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            fetch = lambda url: card().encode()
            first = collect(["569001"], output, {}, fetch)
            original = json.loads((output / "latest-candidate.json").read_text())
            self.assertEqual(first, collect(["569001"], output, {}, fetch))
            second = json.loads((output / "latest-candidate.json").read_text())
            self.assertEqual(original["candidate"], second["candidate"])
            before_failure = (output / "latest-candidate.json").read_bytes()
            def fail_second(url):
                if url.endswith("569002"):
                    raise OSError("network unavailable")
                return card().encode()
            with self.assertRaises(OSError):
                collect(["569001", "569002"], output, {}, fail_second)
            self.assertEqual(before_failure, (output / "latest-candidate.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
