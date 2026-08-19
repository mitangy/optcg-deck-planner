# Card scanning: descriptor bundle

The scanner identifies a card by matching ORB features against precomputed
descriptors for every catalog printing. Those descriptors are a **build
artifact**, not source: ~55 MB, regenerated when a set releases.

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
   variables to the uploaded bundle's base URL. The upload script prints it,
   e.g. `https://<store>.public.blob.vercel-storage.com/scan-data`.

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

`public/scan-data/` is gitignored, and `VITE_SCAN_DATA_BASE` defaults to
`/scan-data`, so a local bundle is picked up by `npm run dev` with no further
configuration.

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
