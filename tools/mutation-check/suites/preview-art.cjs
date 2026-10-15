/** Preview art sync script mutations (scripts/test_sync_preview_art.py, unittest). */
module.exports = {
  cwd: "scripts",
  runner: "unittest",
  module: "test_sync_preview_art",
  mutations: [
    { id: "preview-map-any-position", file: "scripts/sync_preview_art.py", from: `m = re.match(r"^([A-Z0-9]+-\\d+[A-Z]?)[ _]", name)`, to: `m = re.search(r"([A-Z0-9]+-\\d+[A-Z]?)[ _]", name)`, kills: ["test_only_files_that_start_with_the_exact_id"] },
    { id: "preview-map-first-copy-wins", file: "scripts/sync_preview_art.py", from: `if prev is None or ("(" in prev and "(" not in name):`, to: `if prev is None:`, kills: ["test_copy_with_parentheses_loses_to_plain_file"] },
    { id: "preview-keeps-card-with-art", file: "scripts/sync_preview_art.py", from: `    return has_art.get(card_id) is True`, to: `    return False`, kills: ["test_prunes_when_the_card_now_has_tcgplayer_art"] },
    { id: "preview-prunes-unchecked-card", file: "scripts/sync_preview_art.py", from: `    return has_art.get(card_id) is True`, to: `    return has_art.get(card_id) is not False`, kills: ["test_keeps_when_art_is_missing_or_could_not_be_checked"] },
    { id: "preview-keeps-card-left-atlas", file: "scripts/sync_preview_art.py", from: `    if card_id not in atlas_ids:\n        return True\n    return has_art`, to: `    return has_art`, kills: ["test_prunes_a_card_that_left_the_atlas"] },
    { id: "preview-webp-swaps-size", file: "scripts/sync_preview_art.py", from: `        return w & 0x3FFF, h & 0x3FFF`, to: `        return h & 0x3FFF, w & 0x3FFF`, kills: ["test_reads_width_then_height"] },
    // alt previews (#581)
    { id: "alt-preview-variant-any-set", file: "scripts/sync_preview_art.py", from: `if full.startswith(self.start) and full not in self.paths:`, to: `if full and full not in self.paths:`, kills: ["test_variant_buttons_are_read_from_data_full"] },
    { id: "alt-preview-version-ignored", file: "scripts/sync_preview_art.py", from: `    version = next((int(w[1:]) for w in words if re.fullmatch(r"V\\d+", w)), 1)`, to: `    version = 1`, kills: ["test_kind_card_and_version_come_from_the_file_name"] },
    { id: "alt-preview-prefers-latest-version", file: "scripts/sync_preview_art.py", from: `matches[a["pid"]] = min(by_kind.pop(kind), key=lambda v: v["version"])["path"]`, to: `matches[a["pid"]] = max(by_kind.pop(kind), key=lambda v: v["version"])["path"]`, kills: ["test_kind_pairs_the_product_and_prefers_the_unversioned_file"] },
    { id: "alt-preview-kind-unchecked", file: "scripts/sync_preview_art.py", from: `if kind and len(same) == 1 and kind in by_kind:`, to: `if kind and kind in by_kind:`, kills: ["test_two_products_of_one_kind_are_not_guessed"] },
    { id: "alt-preview-sp-unpaired", file: "scripts/sync_preview_art.py", from: `    if "(sp)" in n:\n        return "SP"`, to: `    if "(sp)" in n:\n        return "ALT"`, kills: ["test_alt_and_sp_of_one_card_each_take_their_own_kind"] },
    { id: "alt-preview-fallback-guesses", file: "scripts/sync_preview_art.py", from: `if len(left) == 1 and len(by_kind) == 1:\n            (group,) = by_kind.values()`, to: `if left and by_kind:\n            group = next(iter(by_kind.values()))`, kills: ["test_an_ambiguous_card_is_skipped"] },
    { id: "alt-preview-no-fallback", file: "scripts/sync_preview_art.py", from: `if len(left) == 1 and len(by_kind) == 1:`, to: `if False:`, kills: ["test_a_lone_alt_with_a_lone_file_of_another_kind_still_pairs"] },
    { id: "alt-preview-kept-with-art", file: "scripts/sync_preview_art.py", from: `    return pid not in catalog_alt_pids or has_art.get(pid) is True`, to: `    return pid not in catalog_alt_pids`, kills: ["test_an_alt_preview_goes_once_tcgplayer_has_the_picture"] },
    { id: "alt-preview-pruned-unchecked", file: "scripts/sync_preview_art.py", from: `    return pid not in catalog_alt_pids or has_art.get(pid) is True`, to: `    return pid not in catalog_alt_pids or has_art.get(pid) is not False`, kills: ["test_an_alt_preview_goes_once_tcgplayer_has_the_picture"] },
    { id: "alt-preview-kept-after-leaving-catalog", file: "scripts/sync_preview_art.py", from: `    return pid not in catalog_alt_pids or has_art`, to: `    return has_art`, kills: ["test_an_alt_preview_goes_when_the_alt_left_the_catalog"] },
    // alt files must not be read as base ids; Top Decks upgrade (#608)
    { id: "preview-alt-files-read-as-base-ids", file: "scripts/sync_preview_art.py", from: `if not ALT_STEM_RE.match(p.stem)}`, to: `}`, kills: ["test_alt_preview_files_are_not_base_card_ids_608"] },
    { id: "topdecks-url-uppercase-folder", file: "scripts/sync_preview_art.py", from: `{set_prefix(card_id).lower()}/{card_id}.jpg`, to: `{set_prefix(card_id)}/{card_id}.jpg`, kills: ["test_url_uses_the_lowercase_set_folder_and_the_exact_id"] },
    { id: "topdecks-accepts-html", file: "scripts/sync_preview_art.py", from: `in ("image/jpeg", "image/png")`, to: `in ("image/jpeg", "image/png", "text/html")`, kills: ["test_only_jpeg_and_png_bodies_are_accepted"] },
    { id: "topdecks-upgrade-threshold-off-by-one", file: "scripts/sync_preview_art.py", from: `current_height < UPGRADE_BELOW_HEIGHT`, to: `current_height <= UPGRADE_BELOW_HEIGHT`, kills: ["test_only_previews_under_600px_tall_are_upgraded"] },
    { id: "topdecks-upgrade-unknown-height", file: "scripts/sync_preview_art.py", from: `return current_height is not None and current_height < UPGRADE_BELOW_HEIGHT`, to: `return current_height is None or current_height < UPGRADE_BELOW_HEIGHT`, kills: ["test_only_previews_under_600px_tall_are_upgraded"] },
    { id: "topdecks-no-height-cap", file: "scripts/sync_preview_art.py", from: `    if height <= max_height:\n        return width, height\n`, to: `    return width, height\n`, kills: ["test_tall_scans_are_scaled_down_to_900_and_small_ones_never_up"] },
    { id: "topdecks-upscales-small-scans", file: "scripts/sync_preview_art.py", from: `    if height <= max_height:\n        return width, height\n`, to: `    if height == max_height:\n        return width, height\n`, kills: ["test_tall_scans_are_scaled_down_to_900_and_small_ones_never_up"] },
  ],
};
