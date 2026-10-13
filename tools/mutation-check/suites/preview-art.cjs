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
  ],
};
