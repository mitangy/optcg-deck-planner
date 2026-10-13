/** Alt art sync script mutations (scripts/test_sync_alt_arts.py, unittest) (#581). */
const F = "scripts/sync_alt_arts.py";
module.exports = {
  cwd: "scripts",
  runner: "unittest",
  module: "test_sync_alt_arts",
  mutations: [
    { id: "alt-threshold-inclusive", file: F, from: `return all(hamming(h, r) > HASH_THRESHOLD for r in refs)`, to: `return all(hamming(h, r) >= HASH_THRESHOLD for r in refs)`, kills: ["test_exactly_threshold_bits_apart_is_the_same_art"] },
    { id: "alt-new-alts-not-compared", file: F, from: `        if h:\n            refs.append(h)\n`, to: ``, kills: ["test_art_matching_a_newly_added_alt_is_dropped"] },
    { id: "alt-existing-alts-not-compared", file: F, from: `refs = [hashes[p] for p in ref_pids if hashes.get(p)]`, to: `refs = [hashes[p] for p in ref_pids[:1] if hashes.get(p)]`, kills: ["test_art_matching_an_existing_alt_is_dropped"] },
    { id: "alt-marker-not-required", file: F, from: `        if not has_distinct_marker(prod["name"]):`, to: `        if False:`, kills: ["test_different_art_without_a_marker_is_left_out", "test_image_less_product_without_a_marker_is_left_out"] },
    { id: "alt-imageless-needs-a-hash", file: F, from: `        if h and refs and not is_new_art(h, refs):`, to: `        if not (h and refs and is_new_art(h, refs)):`, kills: ["test_image_less_product_with_a_marker_is_added_on_the_marker_alone"] },
    { id: "alt-id-reuses-gaps", file: F, from: `return max(nums, default=0) + 1`, to: `return len(nums) + 1`, kills: ["test_new_ids_follow_the_highest_existing_id_and_never_reuse_gaps"] },
    { id: "alt-duplicate-label-kept", file: F, from: `    if label not in taken:\n        return label\n`, to: `    return label\n`, kills: ["test_a_label_the_card_already_has_gets_a_number"] },
    { id: "alt-known-product-readded", file: F, from: `        if pid == primary_pid or pid in known_pids:\n            continue\n`, to: ``, kills: ["test_the_primary_and_existing_alt_products_are_never_candidates"] },
    { id: "alt-pcc-label-plain", file: F, from: `if suffix and len(suffix) <= PCC_SUFFIX_MAX:`, to: `if False:`, kills: ["test_premium_card_collection_keeps_a_short_volume"] },
  ],
};
