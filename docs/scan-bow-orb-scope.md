# Card scanning: measured findings and proposed architecture

Status: **research complete, nothing wired into the app.** `CardScanner.tsx`
still uses OCR. Supersedes two earlier drafts of this file (a BoW-over-ORB
plan, then a post-mDex revision) — both are withdrawn, see below.

Harness: `/dev/hash-validate` (dev-only route), reference pool in
`frontend/public/dev-fixtures/refs/` (gitignored).

## The catalog

Measured from TCGCSV, all 85 groups:

- **6,637 printings** across **2,745 distinct card numbers** (~2.4 per number)
- **1,182 distinct printed names**; 61 set prefixes
- Set size: median 36 printings, mean 109, max 375

## What was ruled out, and why

**Every global-statistics method is percentile-bound.** Block hash, block +
colour + gradient, 2×192-bit dHash, edge-map hash, ZNCC, CLAHE
normalisation, specular-highlight exclusion. Each holds a roughly constant
*percentile* as the pool grows, so no fixed-size shortlist contains the
answer at catalog scale. Growing the decoy pool 13 → 100 moved the foil case
from rank 12/100-equivalent to the same percentile, exactly as predicted.

**Classic BoW collapses at scale.** Not our measurement — mDex's FORB
benchmark (https://www.kevindelarosa.com/blog/mdex-offline-card-scanner):
BoW k=2000 @400 scores 90% at 500 cards but 60% at 5k and 50.7% at 10k, and
the failures are *shortlist recall*. At our 6,637 that is ~55-60%. This
killed a scoped BoW plan before it was built.

**OCR is unreliable on real photos**, in every form tried, on six real phone
photos:

| signal | hit rate | why |
|---|---|---|
| exact card number | 1/6 | tiny ~8pt glyphs in a corner |
| set prefix only | 2/6 | same glyphs — not an independent signal |
| card name | 3/6 | large text, genuinely independent, but still half |

Name and set are complementary (union 4/6) but neither is dependable enough
to build on.

## What works: ORB + geometric verification

Lowe ratio 0.8 → `findHomography(USAC_MAGSAC, 5.0)` → geometry sanity checks
(matrix *and* projected-quad) → **score = inlier count**. Implemented in
`frontend/src/devtools/orbMatch.ts`.

Against a 115-printing pool, six real phone photos including two gold-foil
SEC cards and three lying sideways in frame: **6/6 correct, all rank 1.**
Gold foil — the case that defeats OCR and every hash — matched with the
runner-up at *zero* inliers. Rotation is free: ORB computes keypoint
orientation, so sideways cards need no re-orientation step.

Two properties matter more than the accuracy number:

- **Precision.** Across 690 verifications, **no wrong card ever scored above
  0**. Separation is 13-17 versus nothing, not 17 versus 12.
- **Scale-invariance.** Correct matches held rank 1 with margins intact when
  the pool grew 7.7×, because the score is geometric agreement between two
  specific images, not a position in a distribution.

### Cost

Extraction dominates a naive per-pair call and is *not* paid per candidate in
a real pipeline (query extracted once; references precomputed offline):

| ORB features | accuracy (6 photos) | ms/candidate | full 6,637 scan |
|---|---|---|---|
| 500 | 6/6 | 4.29 | 28.5 s |
| **250** | **6/6** | **1.23** | **8.1 s** |
| 150 | 3/6 | 0.51 | 3.4 s |
| 100 | 1/6 | 0.26 | 1.7 s |

250 features is the knee: full accuracy at 3.5× the speed. Below it the
verifier fails by *rejecting everything*, not by mis-ranking.

## Proposed architecture: order, never truncate

The percentile behaviour that made hashes useless as a *shortlist* is exactly
what makes them good at *ordering*. Sort the whole catalog by a cheap hash,
verify in that order, stop early on a confident match. Nothing is truncated,
so a bad ordering costs latency and never the answer.

Measured end-to-end, hash-ordered with early exit at ≥10 inliers, at two pool
sizes. Every stop was the correct card:

| photo | rank @115 | rank @500 | pctile @500 | projected stop @6,637 |
|---|---|---|---|---|
| OP16-119 foil | 10 | 33 | 6.6% | ~438 (~0.5 s) |
| EB03-055 foil | 1 | 8 | 1.6% | ~106 (~0.13 s) |
| OP13-037 sideways | 1 | 1 | 0.2% | ~13 (~16 ms) |
| OP11-070 | 1 | 1 | 0.2% | ~13 |
| OP11-119 sideways | 1 | 5 | 1.0% | ~66 (~80 ms) |
| OP10-014 sideways | 1 | 1 | 0.2% | ~13 |

**The percentile improved as the pool grew** (mean 5.7% → 1.6% from 115 to
500 refs): ranks stayed near-constant in absolute terms rather than scaling
with pool size. That is the opposite of the percentile-bound behaviour that
made hashes useless for *truncation* — ordering only needs the answer early,
not bounded.

**Zero false positives in 3,690 wrong-card comparisons** across both runs.
Worst case, if the ordering were useless, is a full 8.1 s scan — still
correct, just slow.

## Open questions

1. ~~Does the ordering hold at scale?~~ **Measured at 115 and 500 refs; it
   holds and improves.** Still an extrapolation to 6,637 — 500 is 7.5% of the
   catalog — but now supported by a trend across two pool sizes rather than a
   single point. Affects *latency only*: the verifier's zero-false-positive
   precision is what protects correctness.
2. **Descriptor delivery.** 250 features × 32 bytes = 8 KB/card × 6,637 ≈
   **53 MB**, too much to ship to a browser up front. With early exit a
   typical scan touches ~58-577 candidates (~0.5-5 MB), so fetching in
   batches along the ordered walk and caching in IndexedDB looks right — but
   that is an unvalidated design, not a measurement. The photo still never
   leaves the device, preserving `CardScanner.tsx`'s privacy promise.
3. **Rectify references or not?** The early-exit run rectified the query but
   not the references (already clean crops) and ordering improved markedly
   (ranks 8,16,1,1,12,1 → 10,1,1,1,1,1). That was an unintended change and
   needs a deliberate A/B.
4. **Printing disambiguation is unsolved and separate.** OP10-014's runner-up
   was the *other printing of the same card* at an equal score. Identifying
   the card number is done; choosing the treatment (base vs alt vs manga,
   $0.11 vs $1043) is a different problem — **keep `cardScanMarker.ts`**.
5. **Rectification fails on close-ups.** 4 of 6 real photos fell back to
   whole-image; ORB coped, but `findCardQuad` needs a background margin it
   does not get when the card fills the frame. The live capture guide on
   `main` (`CardCaptureLive.tsx`) draws a card-shaped box but `capture()`
   still grabs the **full frame** — cropping to that box is an obvious,
   unimplemented win.

## Free wins from mDex, independent of the above

- The verifier upgrade (already implemented in `orbMatch.ts`).
- Cropping the capture to the viewfinder guide.
- FORB (`arXiv:2309.16249`) as a benchmark — its `animated_cards` category is
  Pokémon cards with real eBay photos and verified answers, 150 queries,
  far better than a handful of hand-picked images.
