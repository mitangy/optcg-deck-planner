# Scope: card scanning after the mDex findings

Status: **scoping only, nothing built.** Supersedes the earlier BoW-over-ORB
scope in this file, which is now **withdrawn** — see "Why BoW is off the table".

## Our measured position

Our own harness (`/dev/hash-validate`, 100-printing decoy pool) established:

| Technique | Foil case @13 refs | Foil case @100 refs | Verdict |
|---|---|---|---|
| Block hash, +colour/gradient, dHash, edge hash, ZNCC, CLAHE | 2-13 / 13 | 12-98 / 100 | all percentile-bound |
| **ORB feature matching** | **1 / 13** | **1 / 100** | **scale-invariant** |

Every global-statistics method holds a roughly constant *percentile* as the
pool grows, so no usable shortlist contains the answer at catalog scale. ORB
held rank 1 with margins intact across a 7.7× pool increase. OCR was
separately ruled out as a narrowing signal (1/4 at set level, 0/4 exact).

**Catalog size (measured from TCGCSV, all 85 groups): 6,637 printings across
2,745 distinct card numbers.** This number decides which architectures are
viable, so it is worth stating up front.

## Why BoW is off the table

Kevin Dela Rosa's mDex write-up (https://www.kevindelarosa.com/blog/mdex-offline-card-scanner)
benchmarks exactly the pipeline we scoped, on Pokémon/Magic/Sports cards,
using FORB (NeurIPS 2023, arXiv:2309.16249) whose queries are real eBay photos
with glare and sleeves. Top-1 accuracy as the database grows:

| variant | 500 | 2k | 5k | 10k |
|---|---|---|---|---|
| verify everything + MAGSAC++ | 90.7% | 90.0% | 89.3% | 89.3% |
| BoW k=2000 @400 shortlist | 90.0% | 76.0% | **60.0%** | 50.7% |
| FeaturePrint @400 | — | 86.7% | 82.7% | 78.0% |
| DINOv2-S @400 | — | 86.7% | 78.7% | 74.7% |
| MobileCLIP-S0 @400 | — | 82.0% | 70.0% | 62.7% |

At our 6,637 printings, classic BoW lands around **~55-60% top-1** — and the
blog's diagnosis is that *shortlist recall*, not the verifier, causes the
failures. That is the same percentile collapse we measured independently with
six hash variants. The Phase 0 experiment I proposed would have spent half a
day confirming a result already published. **Do not build BoW.**

The transferable principle, in their words: retrieval for speed, geometry for
trust — once the right card survives the shortlist, geometry almost always
ranks it first, so the improvement budget belongs in shortlist recall.

## Free wins, independent of which architecture we pick

1. **Upgrade the verifier.** Ours (`frontend/src/devtools/orbMatch.ts`) scores
   by raw `BFMatcher` good-match counts. Theirs is strictly stronger and is a
   small change: Lowe ratio test at 0.8 → `findHomography(..., USAC_MAGSAC, 5.0)`
   → geometry sanity checks (reject flips/slivers/impossible warps) → **score
   by inlier count**, with thresholds of ≥10 ratio-test survivors and ≥8
   inliers. MAGSAC++ also cut their verification from 62 ms to 17 ms as a
   one-line change. Needs checking that `USAC_MAGSAC` is exposed in
   `@techstark/opencv-js`.
2. **A viewfinder capture guide.** Their single highest-leverage design
   choice: frame the card inside a card-shaped guide and crop to exactly that
   box before matching, so every query is already clean. This is the fix for
   our whole class of rectification failures (the PSA-slab case fails in
   `findCardQuad` before matching even runs), and `cardRectify.ts`'s own
   comment already predicted it: "Once a capture guide constrains the crop,
   this whole function stops being asked to guess and the question
   disappears."
3. **Use FORB as the benchmark.** Its `animated_cards` category is Pokémon
   cards, clean scans as the database, real eBay listing photos as queries
   with verified answers — 150 queries with glare, sleeves, angles. Far better
   than our four hand-picked photos.

## Architectures still on the table

### A. Embedding shortlist + ORB/MAGSAC verify (client-side)

The blog's winner was Apple FeaturePrint (83.3% @10k, 331 ms, 0 MB because it
ships with iOS). **We are a web app, so FeaturePrint is unavailable.** Web
equivalents run via ONNX Runtime Web / transformers.js:

- DINOv2-S @400: 78.7% at 5k — best web-viable option in their sweep.
- MobileCLIP-S0 @400: 70.0% at 5k, and +50 MB bundled.

Two real caveats. First, bundle cost: these are tens of MB in a browser, on
top of `@techstark/opencv-js` at ~14.7 MB unpacked, for a "phone at a vendor
booth" use case. Second, the blog explicitly warns semantic embeddings pool
near-identical printings ("the seventeen Lightning Bolts problem") — which is
precisely our base vs alt-art vs manga problem, where OP16-073 runs $0.11 to
$1043. FeaturePrint beat DINOv2 beyond ~2k items *because* it keeps
near-identical printings apart; the web options are the ones that don't.

Storage note: their descriptors are ~20 KB/card, so our 6,637 printings would
be ~133 MB — far too large to ship to a browser. Workable shape: keep the
embedding manifest client-side (768 float32 × 6,637 ≈ 20 MB, ~5 MB int8-quantized)
and **fetch ORB descriptors for only the top-N shortlist on demand**
(20 × 20 KB = 400 KB). The photo still never leaves the device, so
`CardScanner.tsx`'s privacy promise survives intact.

### B. Server-side brute-force ORB + MAGSAC

The accuracy ceiling: **~89-90% top-1, flat from 500 to 10,000 cards.** Their
native timings are 2.3 s at 5k and 4.57 s at 10k, so ~3 s at our 6,637 on
phone-class hardware. Far less code than A and no model to bundle. Costs: the
photo (or its descriptors) leaves the device, and a ~133 MB descriptor
database plus multi-second CPU-bound matching has to live somewhere — Render
free tier is a single weak instance with 512 MB RAM, and `catalog_sync.py`
already carries a comment that long CPU work "must never run inside a request
handler".

### C. Narrow by set, then brute-force within the set

85 groups, averaging ~78 printings each. Brute-force ORB within one set is
trivially cheap even in WASM. The blocker is knowing the set: our OCR got it
1/4. But that measurement was taken *without* a capture guide and with the
rectification failures above — the guide is exactly what made cropping a
non-problem for mDex. Cheap to re-measure once the guide exists, and it would
make everything else easy if it worked.

One structural advantage worth noting for any option: we need the **card
number** right, and there are ~2.4 printings per card number (6,637 / 2,745).
Matching *any* printing of the correct card is a win for identification, which
should lift effective recall above the blog's per-item numbers. Printing-level
disambiguation for price is a separate, narrower problem — and one where
`cardScanMarker.ts` (which the original plan wanted deleted) should be kept.

## Recommendation

Take the three free wins first — they are small, they help every architecture,
and the capture guide plus a proper verifier may change the numbers enough to
re-open option C. Re-measure on FORB rather than four photos. Then decide
between A and B with real data instead of estimates.

## Verification

Re-run `/dev/hash-validate` (now pool-size aware, loading refs from
`public/dev-fixtures/refs/index.json`) after the verifier upgrade, and add
FORB's `animated_cards` queries as a second, larger case set.
