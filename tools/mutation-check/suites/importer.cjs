/** Bandai importer mutations (scripts/import_bandai_metadata.py, unittest). */
module.exports = {
  cwd: "scripts",
  runner: "unittest",
  module: "test_bandai_metadata",
  mutations: [
  { id: "full-scope-missing-ids", file: "scripts/import_bandai_metadata.py", from: `"missingIds": sorted(catalog.keys() - base.keys()) if full_catalog else None,`, to: `"missingIds": None,`, kills: ["test_discovery_and_full_scope"] },
  { id: "empty-discovery-accepted", file: "scripts/import_bandai_metadata.py", from: `        raise ValueError("No series discovered; refusing an empty refresh")`, to: `        pass`, kills: ["test_discovery_and_full_scope"] },
  { id: "leader-cost-not-life", file: "scripts/import_bandai_metadata.py", from: `fields = {**FIELDS, ("life" if kind == "leader" else "cost"): "cost"}`, to: `fields = {**FIELDS, "cost": "cost"}`, kills: ["test_all_card_types_and_leader_life"] },
  { id: "absent-looks-blank", file: "scripts/import_bandai_metadata.py", from: `status[field] = "unknown" if raw is None else "unverified"`, to: `status[field] = "unverified"`, kills: ["test_absent_and_blank_are_distinguishable"] },
  { id: "printing-not-mapped", file: "scripts/import_bandai_metadata.py", from: `row = {"id": re.sub(r"_[pr]\\d+$", "", printing_id),`, to: `row = {"id": printing_id,`, kills: ["test_printings_and_conflicts"] },
  { id: "conflicts-dropped", file: "scripts/import_bandai_metadata.py", from: `                conflicts.append({"id": key, "field": field,`, to: `                [].append({"id": key, "field": field,`, kills: ["test_printings_and_conflicts"] },
  { id: "cross-series-conflict-accepted", file: "scripts/import_bandai_metadata.py", from: `                raise ValueError(f"Conflicting printing across series: {key}")`, to: `                pass`, kills: ["test_cross_series_duplicates_keep_provenance_and_reject_conflicts"] },
  { id: "provenance-dropped", file: "scripts/import_bandai_metadata.py", from: `                existing["sources"].append({"url": url, "sha256": digest})`, to: `                pass`, kills: ["test_cross_series_duplicates_keep_provenance_and_reject_conflicts"] },
  { id: "attributes-swallowed", file: "scripts/import_bandai_metadata.py", from: `    html = ATTRIBUTE_MARKER.sub(lambda m: f"\\uff1c{m.group(1)}\\uff1e", html)\n`, to: ``, kills: ["test_attribute_markers_survive_html_parsing"] },
  { id: "invalid-number-accepted", file: "scripts/import_bandai_metadata.py", from: `                    raise ValueError(f"Invalid {field} on {printing_id}: {value}")\n                value = int(value)`, to: `                    value = 0\n                value = int(value)`, kills: ["test_malformed_refresh_is_rejected"] },
  { id: "duplicate-printing-accepted", file: "scripts/import_bandai_metadata.py", from: `            raise ValueError(f"Duplicate printing: {printing_id}")`, to: `            pass`, kills: ["test_malformed_refresh_is_rejected"] },
  { id: "empty-page-accepted", file: "scripts/import_bandai_metadata.py", from: `        raise ValueError("No card records found; refusing an empty refresh")`, to: `        pass`, kills: ["test_malformed_refresh_is_rejected"] },
  { id: "candidate-not-deterministic", file: "scripts/import_bandai_metadata.py", from: `    payload = {"schemaVersion": 1, "importerVersion": IMPORTER_VERSION,`, to: `    payload = {"schemaVersion": 1, "importerVersion": IMPORTER_VERSION, "generatedAt": datetime.now(timezone.utc).isoformat(),`, kills: ["test_deterministic_candidates_and_partial_failure_preserves_manifest"] },
  { id: "manifest-written-before-fetch", file: "scripts/import_bandai_metadata.py", from: `    raw_dir.mkdir(parents=True, exist_ok=True)\n`, to: `    raw_dir.mkdir(parents=True, exist_ok=True)\n    (output / "latest-candidate.json").write_bytes(b"{}")\n`, kills: ["test_deterministic_candidates_and_partial_failure_preserves_manifest", "test_cross_series_duplicates_keep_provenance_and_reject_conflicts"] },
  ],
};
