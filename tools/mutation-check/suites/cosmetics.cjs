/** Cosmetics catalog script mutations (scripts/test_cosmetics_product_ids.py, unittest). */
module.exports = {
  cwd: "scripts",
  runner: "unittest",
  module: "test_cosmetics_product_ids",
  mutations: [
    { id: "cosmetics-400w-unparsed", file: "scripts/cosmetics_common.py", from: `re.compile(r"product/(\\d+)_", re.I)`, to: `re.compile(r"product/(\\d+)_200w", re.I)`, kills: ["test_parses_400w"] },
    { id: "cosmetics-200w-unparsed", file: "scripts/cosmetics_common.py", from: `re.compile(r"product/(\\d+)_", re.I)`, to: `re.compile(r"product/(\\d+)_400w", re.I)`, kills: ["test_parses_200w"] },
    { id: "cosmetics-empty-url-zero", file: "scripts/cosmetics_common.py", from: "    if not url:\n        return None\n    m = PRODUCT", to: "    if not url:\n        return 0\n    m = PRODUCT", kills: ["test_missing"] },
    { id: "cosmetics-non-cdn-url-zero", file: "scripts/cosmetics_common.py", from: "    if not m:\n        return None", to: "    if not m:\n        return 0", kills: ["test_missing"] },
    { id: "backfill-skips-primary", file: "scripts/backfill_cosmetics_product_ids.py", from: `    pid = product_id_from_image_url(entry.get("imageUrl"))`, to: "    pid = None", kills: ["test_backfill_primary_and_alts", "test_backfill_catalog_stats"] },
    { id: "backfill-skips-alts", file: "scripts/backfill_cosmetics_product_ids.py", from: "    if isinstance(alts, list):", to: "    if False:", kills: ["test_backfill_primary_and_alts"] },
    { id: "backfill-counts-unchanged", file: "scripts/backfill_cosmetics_product_ids.py", from: "        if p:\n            primaries += 1", to: "        primaries += 1", kills: ["test_backfill_catalog_stats"] },
    { id: "export-drops-gameplay-meta", file: "scripts/export_cosmetics_from_planner_db.py", from: "        prev = dict(merged.get(card_id) or {})", to: "        prev = {}", kills: ["test_preserves_gameplay_meta"] },
    { id: "export-keeps-stale-art", file: "scripts/export_cosmetics_from_planner_db.py", from: "                prev[key] = art[key]", to: "                pass", kills: ["test_preserves_gameplay_meta"] },
  ],
};
