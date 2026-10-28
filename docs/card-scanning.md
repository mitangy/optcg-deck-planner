# Card scanning

The scanner identifies a card by matching ORB features against precomputed
descriptors for every catalog printing, entirely on the device. A small learned
embedding of the card's art decides which printings to check first.

## How it works

```
rectify -> resample to the references' scale -> CLAHE + ORB query features ->
order candidates (order hash fused with art embedding) ->
ORB-verify in that order until sure, tied, or out of time
```

A match is only believed when one homography explains it: Lowe ratio test,
MAGSAC++ consensus, geometry checks on both the matrix and the projected card
corners, scored by inlier count. Descriptor matches lie constantly on cards —
yellow borders match yellow borders — and requiring a single consistent
perspective transform is what separates a real match from coincidence.

**Order, never truncate, but bound the time.** The ordering is a permutation of
the whole catalog; it never cuts it. A poor ordering only costs time, because
the walk can still reach every candidate, and correctness rests on the verifier
alone. What changed in #701 is that the walk is now bounded by the clock: it
verifies at least 8 candidates (`minExamined`, so the runner-up has seen real
rivals), stops as soon as one is confident with a lead, stops at 48 if a
confident match never separates from its rival (reprints of one illustration
tie), and after `maxMs` (1.5 s) returns whatever it has as "check" instead of
reading the other 6,000 printings. Before, a card that never reached 10 inliers
walked the whole catalog: ~14 s on a desktop, far worse on a phone, and the
weak winner it finally reported was often wrong.

### Query scale and contrast (the biggest single fix)

Measured on 19 hand-labelled cards in four real phone photos (sleeves,
toploaders, a PSA slab, acrylic cases, a binder), identification with *perfect*
quads reached the confident threshold on 13/19 cards before and 19/19 after:

- **Resample to the references' scale.** The multi-card path rectifies to 1120 px
  tall, but a card in a phone photo is 250-450 px tall and the references are
  ~560 px: upsampling puts the same information on 4x the pixels, so ORB's 31 px
  patch sees mush. Matching at 560 px roughly doubled inliers on every card
  (`MATCH_HEIGHT`, `resizeToHeight`).
- **CLAHE on the query.** A card behind a sleeve is hazy, and the corner detector
  fires on local contrast. Contrast-limited equalisation (clip 3, 8x8 tiles)
  lifted weak cards from 9-13 inliers to 10-30 and, unexpectedly, *cut false
  positives*: on the synthetic harness without it, noisy scenes made hub
  references (cards with lots of fine detail) score 10-17 inliers on the wrong
  card (9 sure-but-wrong of 214 without CLAHE, 2 with).
- **500 query features, 250 reference features.** The query is extracted once per
  scan, so it can afford more; the references were extracted once for the
  catalog and stay at 250 (no bundle regeneration for this). 500 beat 350 and
  250 on real photos (19/19 sure vs 18 and 16).

The "wrong cards never score above zero" claim below no longer holds at this
operating point: at 500 features about 0.15% of wrong-card comparisons verify at
10+ inliers, and a reprint sharing its illustration with another card number
(Luffy leaders, character alternate arts) can score 35+ because it *is* the same
picture. That is why "sure" now needs the art embedding to agree (see below).

## Art embedding

`cardEmbed.ts`, trained by `scripts/train-embedder/`. A MobileNetV3-Small
(ImageNet-pretrained, torchvision) takes the rectified card at 160x224 and
produces a 128-d unit vector. It is fine-tuned contrastively (InfoNCE, in-batch
negatives) so that a degraded view of a printing is near its clean scan: the
augmentations imitate a sleeved phone photo (corner jitter of the quad,
downscaling to 45-100%, blur, spatially varying haze toward a tint, glare blobs,
overlapping neighbours, colour casts, noise, 180 degree rotation).

Why train rather than use a pretrained model as-is: ImageNet MobileNetV3-Large
on the same quads put the right printing in the top 5 for 13/19 cards and failed
completely on sleeved cards (rank 51-405 of 6,859 for five of them); art-only
crops, CLAHE, and three other backbones (MobileNetV3-Small, MobileNetV4-Small,
MobileCLIP-S0 sized) did not change that. After 6 epochs of fine-tuning
(~85 min on 3 shared CPU threads) the right printing is rank 0 for 18/19 and rank
1 for the other, among all 6,859.

It orders, it does not decide:

- **Fused order.** `fuseOrder` merges the hash order and the embedding order by
  reciprocal-rank fusion (k = 10): the top few of *either* list are verified
  first, then the rest of both. The two fail on different cards (the hash on a
  gold-foil alt art at rank ~830, the embedding on washed-out sleeves in the
  generic model), and the fusion is a permutation, so nothing is dropped.
- **Confidence veto.** `classifyMatch` calls a match "sure" only if the matched
  card is in the embedding's top 10 (`SURE_EMBED_RANK`). Every correct read in
  both test sets had rank 0-7; every wrong "sure" had rank 19 or worse.
  Without an embedder nothing changes.
- **Graceful absence.** No model, no embeddings (a printing newer than the
  embeddings file), or a runtime failure: `matchRectified` uses the hash order
  and the old rule.

Shipping: `scripts/pack-embedder.mjs` embeds every reference with the same
preprocessing the browser uses (`embedderInput`, shared by construction) and
writes `card-embedder-<hash>.onnx` (3.8 MB, fp32; int8 dynamic quantisation was
7x *slower* on the CPUs measured and no more accurate), `embeddings-<hash>.bin`
(6,859 x 128 int8 = 0.95 MB), and the pointer `card-embedder.json`, next to the
descriptor chunks. `cardEmbedCache.ts` keeps them in their own IndexedDB
database, offline after one download, and `useScanData` loads them in the
background like the detector. Retraining replaces the model file only; adding a
set re-embeds in the same workflow run as the descriptors.

onnxruntime-web is loaded lazily (WASM backend, single thread unless the page is
cross-origin isolated), the same way as the detector.

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

- **Precision.** Across 3,690 wrong-card comparisons (250 features, no CLAHE,
  1120 px queries), no wrong card ever scored above zero. Separation was 12-18
  versus nothing. That held for that operating point and a small pool; see
  "Query scale and contrast" for what changed.
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
(`cardDetect.ts`) uses the learned detector described below when its model
is downloaded, and otherwise this classical OpenCV pipeline, no model:

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

"Sure" means 10+ inliers, a 5+ lead over the runner-up and (when an embedder ran) the card in the embedding's top 10; anything else with
inliers is "check"; no match is "none". The multi-card path loads photos at a
3000 px long edge (`MULTI_MAX_WORK_EDGE`) rather than 2000, since each card
gets a fraction of the frame.

### Learned detector (#701)

The OpenCV detector above works on flat, high-contrast scenes and fails on real
phone photos: it finds the *sleeve*, the toploader or the PSA slab instead of
the card, merges fanned piles, and loses cards on glass tables to reflections.
`cardDetectModel.ts` runs a small learned detector instead, and the OpenCV
detector stays as the fallback.

- **Model.** YOLO11n-pose fine-tuned to output one object per visible card
  *face* with four corner keypoints (the printed card's own TL, TR, BR, BL),
  so it returns a perspective quad directly. ~2.6 M parameters, 5.8 MB
  as ONNX with float16-stored weights (cast back to float32 at load).
- **Run.** onnxruntime-web, WASM backend, loaded with a dynamic `import()` the
  first time the scanner needs it (same idea as OpenCV). The photo is
  letterboxed to a long side of 640 at its own aspect (a 9:16 phone photo is
  384x640, not a padded square), area-averaged down, run, decoded
  (`decodeDetections`), filtered to plausible card shapes
  (`isPlausibleCard`) and de-duplicated by quad IoU (`suppressDuplicates`).
  Quads come back in source pixels, in the card's printed orientation, in
  reading order.
- **Fallback.** `detectCardsAsync` (`cardDetect.ts`, called by
  `matchAllCardsWith`) uses the model's cards when it found any, and
  otherwise runs the OpenCV detector exactly as before, including its
  single-card and whole-frame fallbacks. No model file, an unsupported
  browser or a failed inference all land there silently.
- **Distribution.** The model is not committed. It is a build artifact served
  from the same `scan-data/` store as the descriptors: `card-detector-<hash>.onnx`
  (immutable) plus a tiny `card-detector.json` pointer. `cardDetectorCache.ts`
  keeps it in its own IndexedDB database, so scanning works offline after the
  first download; `useScanData.ts` loads it from the cache in the background
  and fetches it if missing. `scripts/pack-detector.mjs` produces the two
  files, `upload-descriptors.mjs` uploads them when they sit next to the
  descriptor chunks. The trained model is committed at
  `frontend/scan-models/card-detector.onnx` and the *Scan descriptors* workflow
  packs it (an optional `detector_url` input overrides it). Locally, put the
  packed files in `frontend/public/scan-data/`.
- **Labelling rule (#769).** What the model is trained to find is the printed
  card, including cards that are partly covered: a card is labelled when at
  least 35% of it is visible (`gen_scenes.py --visible-min`), with its FULL
  quad (the covered corners are extrapolated from the card's own geometry) and
  keypoint visibility flag 1 on covered corners. So a fanned pile, an
  overlapping pair or a card half behind another each come back as separate
  cards. Cards less visible than that (a thin strip of a stack), face-down
  cards, non-One-Piece cards and cards printed on boxes are not labelled; the
  generator makes covered non-One-Piece cards and box art tucked behind real
  cards on purpose (`--non-op-piles`, `--hard-negatives`) as negatives. The
  model still often returns the strips of stacked toploaders as extra cards;
  those read as "none" or "check" in the tray.
- **Overlapped cards are never "sure" unless they are the best read (#769).**
  A covered card's crop includes the card in front of it, and a printed box or
  a neighbour's art can read as a real card, so `capOverlappedConfidence`
  (`cardScanMulti.ts`) keeps "sure" only for the detection with the most
  inliers among those that overlap it by 15% or more of its area; the rest are
  at most "check". Unnamed ("none") detections that others cover by 40% or more
  are dropped (`dropHiddenUnnamed`).

#### Training it

Everything needed to rebuild the model is in `frontend/scripts/train-detector/`
(Python; use a venv outside the repo, CPU torch is enough):

```bash
cd frontend
LIMIT=1500 node scripts/fetch-reference-images.mjs .scan-build/refs-train
for i in 1 2 3 4; do python scripts/train-detector/gen_scenes.py --cards .scan-build/refs-train \
    --textures <dir of CC0 colour textures, e.g. ambientCG 1K-JPG> \
    --out /tmp/det-r$i --n 2500 --val 200 --seed 2$i; done      # ~25 min each on 4 cores
# partly covered cards (#769): add --visible-min 0.35 (the default); the last rounds also
# --non-op-piles 0.2 --hard-negatives 0.4
# rounds chain: each starts from the previous round's weights (the first from COCO).
# The shipped model was ~10 epochs at 512 px over three rounds, then 5 at 640 px.
python scripts/train-detector/train.py --rounds /tmp/det-r1 /tmp/det-r2 /tmp/det-r3 --epochs 4 --out /tmp/det-runs
python scripts/train-detector/train.py --rounds /tmp/det-r4 --epochs 5 --imgsz 640 \
    --resume-from /tmp/det-runs/round3.pt --out /tmp/det-runs-hi
python scripts/train-detector/export_onnx.py /tmp/det-runs-hi/round1.pt /tmp/card-detector.onnx
node scripts/pack-detector.mjs /tmp/card-detector.onnx public/scan-data
MODEL=public/scan-data/card-detector-<hash>.onnx npx tsx scripts/detect-eval.mjs
```

`gen_scenes.py` composites real card art onto wood, glass-with-reflections,
playmat, fabric, concrete and shelf backgrounds, inside coloured sleeves, clear
toploaders, PSA-style slabs, acrylic cases and binder pockets, as fanned,
stacked and side-by-side piles, rotated (including quarter turns) and
perspective-warped, with glare, hands, blur, noise and JPEG, plus unlabelled
distractors (boxes with printed card art, fake non-One-Piece cards, card backs,
paper). The labels are the printed card's corners. CPU training is slow, so
`train.py` trains in *rounds*, each on a freshly generated dataset, instead of
many epochs over one. The owner's real photos are the test set and are never
trained on.

`scripts/detect-eval.mjs` scores the detector (and, with the descriptor bundle,
the whole pipeline) on the real photos in `.scan-build/real-photos/`; it lists
unlabelled extra detections with what they were read as, and any "sure" read
that is wrong. `SCORE=`, `NMS=` and `LONG_SIDE=` override the decode options.

#### How well it works

Scored on five of the owner's phone photos (binder, store shelf, pink sleeves,
toploaders and a PSA slab, and a 23-card Big Mom playmat spread; hand-labelled
cards in `quads.json`, none of them trained on). Photos 1-4 are labelled with
their top cards only, photo 5 with every card including covered ones. A card
is found when a detected quad overlaps the
labelled printed card by IoU >= 0.5; the pipeline column runs detection plus
identification against all 6,774 printings.

| photo | model found, before -> after #769 | extras after (what, confidence) | piles identified, before -> after |
|---|---|---|---|
| binder (2 cards, non-One-Piece pockets around them) | 2/2 -> 2/2 | 2 non-One-Piece binder cards, none | 2/2 -> 2/2 |
| store shelf (acrylic cases in front of printed boxes) | 2/2 -> 2/2 | 2 box-art cards, none | 2/2 -> 2/2 |
| pink sleeves, fanned piles on a glass table | 5/5 -> 5/5 | 1 real back card, check; 2 stack strips, none | 4/5 -> 5/5 |
| toploaders, PSA slab, stacks | 10/10 -> 9/10 | 1 real back card of a stack, sure; 4 stack strips, none | 8/10 -> 8/10 |
| Big Mom spread, 23 cards incl. fanned and overlapped | 17/23 -> 21/23 | none | 16/23 -> 21-22/23 |
| **total** | **36/42 -> 39/42** | 12 (9 "none") | **32/42 -> 38-39/42** |

Identification varies by a card between runs (its walk is time-budgeted).
Before #769 the model had 3 extras on these photos, one each on photos 3-5.
After it the model also returns covered cards that photos 1-4 do not label
(they are labelled with top cards only). Detections that another detection
covers by 40% or more of their own area and that identification could not
name are dropped (`dropHiddenUnnamed`), since a covered card we cannot name
only gives the tray a fix form; named covered cards stay, as "check". That is
also why photo 4 reads 9/10 (one top card, EB04-018, was unnamed and mostly
overlapped by another detection) and photo 5 21/23. No labelled card was read as "sure"
and wrong (0 of 39). The covered Katakuri fan, the overlapping foil pair,
Daifuku and the gold-border Mamaragan (before: found at score 0.05) are
found now; Pudding at the frame's left edge is missed (part of its quad
leaves the photo, and the generator never labels such cards). The score
threshold (0.25) was chosen on these photos, so treat the numbers as tuned,
not blind. A higher threshold does not separate the leftovers: the non-One-Piece
binder cards score 0.34-0.50, while real cards score as low as 0.42 (photo 4)
and 0.49 (photo 5). NMS stays at IoU 0.5: with a 35% visibility rule a second
card in a fan is at most ~48% overlapped, and a higher threshold only let
duplicate quads of the same card through (0.65: 23 extras on the first four
photos of the earlier model, 0.5: 16). Mean IoU (0.85) is looser than on the
synthetic scenes because a few quads are rotated a few degrees;
identification tolerates that.

On the 30 synthetic harness scenes (flat, high contrast: the OpenCV
detector's best case) the model reaches 99.5% recall (217/218), 100%
precision and 0.91 mean IoU (96.8% / 100% / 0.89 before #769), against OpenCV's 98.2%, 100% and 0.94. The reference art is
shared with the training set, though the scenes are not.

Speed: 0.2-0.35 s per photo in headless Chromium on a 4-core server CPU with
the single-threaded WASM backend (preprocessing included; Node is similar), so
roughly 0.5-1.5 s on a phone, against ~0.2 s for the OpenCV detector. The page
is not cross-origin isolated, so ORT runs on one thread. The ONNX is 5.8 MB, plus
the ~14 MB onnxruntime-web WASM asset, fetched only when the scanner opens.
Training took about 2.5 hours of CPU in total (5 rounds of 2,500 scenes,
~5 min/epoch at 512 px, ~9 at 640), plus ~25 min of scene generation per round.
The #769 retrain (covered cards) fine-tuned the previous weights for 3.5 hours
wall clock on 4 CPUs: 8 rounds of 2,000 fresh scenes, 4 epochs each (512 px for
rounds 1-4 and 6-7, 640 px for 5 and 8; lr 0.001, AdamW), the last three with
the hard negatives.

Open problems: a stack of toploaders where only the front card is fully
visible is the weakest case, and recall there varied between training rounds
(0.30 vs 0.25 threshold decided 2 of the 19); a non-One-Piece card in a
binder sometimes comes out as a card and is left to identification to reject;
corners of small cards are good to a few pixels at 640 px but a quad can be
rotated a few degrees.

### Real-photo evaluation (#701)

`frontend/.scan-build/real-photos/` (gitignored) holds the owner's phone photos,
`truth.json` (which cards are visible) and `quads.json` (hand-verified corner
quads, `{photo:[{id,quad:[TL,TR,BR,BL]}]}`). `scripts/real-photo-eval.mjs`
rectifies each quad and calls `matchRectified`, so it measures identification
alone with perfect detection (`NOEMBED=1` turns the embedder off, `OUT=` writes json).

| 19 cards, perfect quads | Before | After |
|---|---|---|
| Correct | 16 (strict id 15) | 19 (strict 19) |
| Sure but wrong | 1 | 0 |
| Sure / check / none | - | 19 / 0 / 0 |
| Median ms per card | 159 | 173 |
| Worst ms per card | 14,507 | 292 |

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
NOEMBED=1 npx tsx scripts/multi-scan-harness.mjs    # without the embedder
REFS=.scan-build/refs-full DESC=.scan-build/full-desc2 npx tsx scripts/multi-scan-harness.mjs # full catalog
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

The descriptors are a **build artifact**, not source: ~60 MB (+4.8 MB for the art embedder: `card-embedder-<hash>.onnx` 3.8 MB, `embeddings-<hash>.bin` 0.95 MB, pointer `card-embedder.json`), regenerated when
a set releases.

They are neither committed nor served by the API. Committing would grow the
repo permanently; generating during a deploy is impossible (it needs ~6,400
image downloads); and routing tens of megabytes through the free-tier API
instance would be slow for no benefit. They live in blob storage instead,
which also means the bundle can be refreshed without redeploying.

## One-time setup

1. **Create a Vercel Blob store** for the project. Hobby includes 5 GB of
   storage and 100 GB of transfer per month; the bundle is ~60 MB and a
   full download is ~65 MB per user, so the headroom is roughly 1,800
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

### Regenerating the embedder (#701)

```bash
cd frontend/scripts/train-embedder
python train.py --refs ../../.scan-build/refs-full --out embedder.pt   # ~85 min on 3 CPU threads
python export_onnx.py embedder.pt card-embedder.onnx
cd ../.. && npx tsx scripts/pack-embedder.mjs .scan-build/refs-full card-embedder.onnx .scan-build/desc
```

The trained embedder is committed at `frontend/scan-models/card-embedder.onnx`.
The Scan descriptors workflow runs `pack-embedder` with it on every run (an
optional `embedder_url` input overrides it), so new sets get embeddings. Without
an embedder in the bundle the scanner falls back to hash order.

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
