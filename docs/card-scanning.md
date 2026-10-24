# Card scanning

The scanner identifies a card by matching ORB features against precomputed
descriptors for every catalog printing, entirely on the device.

## How it works

```
rectify -> extract query features -> order candidates by a cheap hash ->
ORB-verify in that order, stopping at the first confident match
```

A match is only believed when one homography explains it: Lowe ratio test,
MAGSAC++ consensus, geometry checks on both the matrix and the projected card
corners, scored by inlier count. Descriptor matches lie constantly on cards —
yellow borders match yellow borders — and requiring a single consistent
perspective transform is what separates a real match from coincidence.

**Order, never truncate.** The hash sorts the whole catalog; it never cuts it.
That distinction is the design: a shortlist would drop the answer, whereas a
poor ordering only costs time, because the walk can still reach every
candidate. Correctness rests on the verifier alone.

## Why not perceptual hashing

Every global-statistics hash tried — block, block+colour+gradient, 2x192-bit
dHash, edge-map, ZNCC, CLAHE-normalised, specular-excluded — is
**percentile-bound**: it holds a roughly constant *percentile* as the
reference pool grows, so the right card is reliably in a top slice but never
in a fixed top-N. Growing the pool 13 -> 100 -> 500 moved ranks
proportionally, exactly as that predicts. Useless for shortlisting; ideal for
ordering, which is what they now do.

Classic bag-of-visual-words was scoped and abandoned unbuilt: the FORB
benchmark in [mDex](https://www.kevindelarosa.com/blog/mdex-offline-card-scanner)
puts BoW at 90% top-1 over 500 cards but 60% at 5k and 50.7% at 10k, with
*shortlist recall* causing the failures — around 55-60% at our 6,600.

OCR was the original implementation and was replaced on measurement. Over six
real phone photos it read the exact card number on 1, the set prefix on 2
(the same tiny glyphs, so not an independent signal), and the card name on 3.
ORB gets 6/6 at rank 1 on the same photos, including two gold-foil SEC cards
that defeat OCR entirely and three lying sideways in frame — ORB computes
keypoint orientation, so rotation costs nothing.

Two measured properties carry the design:

- **Precision.** Across 3,690 wrong-card comparisons, no wrong card ever
  scored above zero. Separation is 12-18 versus nothing, which is what makes
  an early-exit threshold safe.
- **Scale-invariance.** Correct matches held rank 1 with margins intact as the
  pool grew 12.8x, because the score is geometric agreement between two
  specific images rather than a position in a distribution.

At the full catalog a scan examines 1-454 of 6,387 candidates and takes
100-700 ms, with ~1.2 ms per candidate at 250 features. 250 is the measured
knee: 150 drops to 3/6 and fails by rejecting everything rather than by
mis-ranking, while 500 is no more accurate and 3.5x slower.

ORB also distinguishes *printings*, not just card numbers — in five of six
photos every other printing of the same card scored zero rather than merely
ranking lower, and for one it correctly chose the Alternate Art over the base.
The exception is printings sharing near-identical art, which tie closely.

## Many cards in one photo

`matchAllCards` (`cardScanMulti.ts`) finds every card in a photo, then
identifies each one with the same matcher as a single scan. Detection
(`cardDetect.ts`) is classical OpenCV, no model:

1. Downscale to ~1000 px, grayscale, blur.
2. Binary maps, each contoured with `findContours`: Canny at three
   sensitivities (a busy table needs strong edges only, a dim card weak
   ones), Canny per colour channel (a yellow border on a pink table has no
   luminance step), adaptive threshold, and Otsu in both polarities.
3. Each contour becomes a quad: `approxPolyDP` on its convex hull, falling
   back to `minAreaRect` for near-rectangular blobs. Quads must be card-shaped
   (63:88 in either orientation, with perspective tolerance) and 1-90% of the
   frame.
4. Suppression: duplicates from different maps merge; a card's inner art box
   is dropped; a binder page that merely *contains* two or more cards is
   dropped; interiors that are flat (an empty pocket) are dropped.
5. Touching cards form one outline, and two portrait cards side by side are as
   wide as one sideways card. A block is cut along a line only where every
   interior line is a straight run of edge pixels and the lines either side
   are not. If the cells then identify as nothing, `matchAllCards` tries the
   block as one card.
6. A regular grid with missing cells (a binder pocket the contours missed)
   gets them filled in, unless the cell is blank or runs into a real card.
7. Quads return in source pixels, long side top to bottom, in reading order.
   Each card is rectified from the **full-resolution** photo, not the
   detection copy. No card found falls back to the single-card path, then the
   whole frame.

"Sure" means 10+ inliers and a 5+ lead over the runner-up; anything else with
inliers is "check"; no match is "none". The multi-card path loads photos at a
3000 px long edge (`MULTI_MAX_WORK_EDGE`) rather than 2000, since each card
gets a fraction of the frame.

### Harness

`scripts/multi-scan-harness.mjs` builds 30 synthetic scenes from reference art
(3x3 and 4x3 binder pages on dark and coloured sheets, table spreads of 2-12
cards with rotation, sideways cards, perspective, noise/gradient/solid
backgrounds, touching pairs, JPEG, blur, brightness) and runs the real
pipeline in Node:

```bash
cd frontend
LIMIT=240 node scripts/fetch-reference-images.mjs .scan-build/refs
npx tsx scripts/extract-descriptors.mjs .scan-build/refs .scan-build/desc
npx tsx scripts/multi-scan-harness.mjs              # full pipeline
DETECT_ONLY=1 npx tsx scripts/multi-scan-harness.mjs # detection only, fast
```

Scenes, ground truth and detection overlays land in `.scan-build/scenes/`.
Detection is scored by IoU >= 0.5 against the true quads.

Last run (219 reference printings, 30 scenes, 218 cards, Node/WASM):

| | |
|---|---|
| Detection recall | 98.2% (214/218) |
| Detection precision | 99.1% (214/216) |
| Mean IoU of matched quads | 0.94 |
| Identified correctly | 96.3% of all cards, 98.1% of detected |
| Confidence | 213 sure, 1 check, 0 none; 3 sure-but-wrong |
| Time per scene | detection ~200 ms; detection + identification ~1.4 s (219 candidates) |

Known weaknesses:

- **Low-contrast tables.** Misses were gold or yellow-bordered cards on
  busy or similarly bright backgrounds, and one card on a blocky, high-contrast
  noise texture.
- **A card with a long straight line through its middle** (a manga-panel
  layout) can be cut in two; the halves then identify as the same card, so it
  shows up twice. A block whose cells identify as nothing is retried whole.
- **Touching cards** are only cut where the seam is a straight edge. Two cards
  with identical borders and no gap read as one block.
- **Look-alike cards.** The 3 sure-but-wrong reads are reprints of the same
  character sharing rule text and, in the harness, the "SAMPLE" watermark that
  unreleased reference art carries. The matcher stops at the first 10+ inlier
  match, so the runner-up it reports is only what it had seen by then.

## The descriptor bundle

The descriptors are a **build artifact**, not source: ~55 MB, regenerated when
a set releases.

They are neither committed nor served by the API. Committing would grow the
repo permanently; generating during a deploy is impossible (it needs ~6,400
image downloads); and routing tens of megabytes through the free-tier API
instance would be slow for no benefit. They live in blob storage instead,
which also means the bundle can be refreshed without redeploying.

## One-time setup

1. **Create a Vercel Blob store** for the project. Hobby includes 5 GB of
   storage and 100 GB of transfer per month; the bundle is ~55 MB and a
   full download is ~55 MB per user, so the headroom is roughly 1,800
   first-time downloads a month.
2. **Add `BLOB_READ_WRITE_TOKEN`** to the repository's GitHub Actions
   secrets. Without it the workflow still runs and publishes the bundle as a
   downloadable artifact, but skips the upload.
3. **Set `VITE_SCAN_DATA_BASE`** in the Vercel project's environment
   variables to the store *root* — e.g.
   `https://<store>.public.blob.vercel-storage.com`, which the upload script
   prints. The `scan-data/` prefix is appended by the client, so it is not
   part of this value. Vite inlines `VITE_*` at build time, so redeploy after
   changing it.

Until step 3 is done the scanner shows "Scan data unavailable" rather than
failing silently — matching cannot work without the descriptors.

## Regenerating

Run the **Scan descriptors** workflow (`workflow_dispatch`, or monthly on a
schedule). It fetches one reference image per printing from TCGCSV, extracts
descriptors, and uploads the result.

It is deliberately *not* part of the nightly catalog sync: prices change
daily, card art does not, and this job downloads thousands of images — which
would make an already fragile free-tier nightly workflow considerably worse.

Locally:

```bash
cd frontend
node scripts/fetch-reference-images.mjs .scan-build/refs   # LIMIT=200 to sample
npm run extract-descriptors -- .scan-build/refs public/scan-data
```

`public/scan-data/` is gitignored, and `VITE_SCAN_DATA_BASE` is empty by
default — resolving to a same-origin `/scan-data` — so a local bundle is
picked up by `npm run dev` with no further configuration.

Node 20+ is required: `@vercel/blob` declares it, and on Node 18 the upload
fails inside undici with a message that points at Node internals rather than
the version.

## Why chunks are content-addressed

Each chunk's filename is a hash of its bytes, and chunks are grouped **by
set**. Both matter:

- Content addressing makes chunks immutable, so a CDN can cache them
  indefinitely and a client refetches only what changed.
- Grouping by set keys a chunk to something stable in the data rather than to
  its position. Fixed-size slices of a sorted list were tried first; a new set
  inserting in the middle shifted every later record into a different chunk
  and invalidated **100%** of them. Keyed by set, adding a card rewrites only
  that set's chunk — measured at 89 KB of 4.34 MB.

The client stores chunks in IndexedDB and requests persistent storage.
Browsers may refuse persistence, so eviction and re-download must stay
survivable — never assume the cache is present.

## Coverage

262 of 6,649 printings have no published art on TCGPlayer (mostly brand-new
products) and are skipped. They cannot be matched until art appears; the
next regeneration picks them up automatically.
