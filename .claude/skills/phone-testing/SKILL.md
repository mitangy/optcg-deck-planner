---
name: phone-testing
description: Test the dev app on a real phone over LAN Wi-Fi — camera capture, mobile layout, touch interactions. Covers the CORS/host-binding gotchas and the HTTPS requirement for live camera (getUserMedia). Use when asked to test on a real device/phone, debug why a phone can't reach the dev server, or before shipping anything that uses the camera.
---

# Testing on a real phone over LAN

Emulating a phone in a desktop browser (device toolbar, resize_window) only
changes the viewport — it does not exercise a real camera, real HEIC photos,
real glare, or Mobile Safari's actual API behavior. For the card scanner in
particular, every real bug found so far (corner detection latching onto a
monitor bezel, rectification failing on close-ups where the card fills the
frame, gold-foil glare) only showed up with a genuine phone photo. Emulation would have shipped all of
them. Test on a real device before trusting a camera-facing change.

## Quick start

```bash
scripts/dev-lan.sh
```

This starts both dev servers reachable from a phone on the same Wi-Fi network,
auto-detecting the Mac's current LAN IP — nothing is hardcoded, so it works
for any developer on any network without editing a file. Prints the URL to
open on the phone, e.g. `http://192.168.1.23:5173`.

If auto-detection picks the wrong network interface, pass the IP explicitly:
`scripts/dev-lan.sh 10.0.0.5` (find it via System Settings → Wi-Fi → Details
on macOS).

**Never hardcode a LAN IP into `backend/.env` or `frontend/.env`.** Those
files should stay at their `localhost` defaults for normal dev — a hardcoded
IP breaks the moment the network changes or another developer runs it. The
script injects the detected IP as real environment variables instead, which
both pydantic-settings and Vite treat as higher priority than the `.env`
file, so the checked-in defaults are never touched.

## Why a plain port-forward isn't enough

Three things silently block phone access if you just open the LAN IP without
the script:

1. **Vite binds to localhost only** by default — needs `vite --host` (or
   `npm run dev -- --host`) to accept connections from another device. The
   script does this.
2. **Uvicorn binds to 127.0.0.1 only** by default — needs `--host 0.0.0.0`.
   The script does this too.
3. **CORS is exact-match on `FRONTEND_ORIGIN`** (`backend/app/main.py`,
   `_cors_origins = [settings.frontend_origin.rstrip("/")]`). A request from
   `http://<lan-ip>:5173` is silently rejected unless `FRONTEND_ORIGIN`
   matches that exact origin. The script sets this via env var per run.

Also relevant: `frontend/.env`'s `VITE_API_URL=http://localhost:8000` means
"localhost" on the *phone* refers to the phone itself, not your Mac — it must
point at the Mac's LAN IP for API calls to reach the backend. The script
handles this too.

## The HTTPS wall: getUserMedia needs a secure context

`navigator.mediaDevices.getUserMedia` (live camera preview, e.g. the
scanner's capture-guide view) **requires a secure context**. `localhost` is
exempt; a plain `http://<lan-ip>` is not — Mobile Safari will refuse to
expose the API at all (not even a permission prompt, just absent/throws).

This does **not** block `<input type="file" capture="environment">` (the
"Take a photo" button), which just launches the native camera app and hands
back a file — no `getUserMedia`, no secure-context requirement. That flow
works fine over the plain LAN setup above.

If a feature needs live `getUserMedia` preview on a real phone, you need
HTTPS. Two options, in order of effort:

- **mkcert**: generate a locally-trusted cert (`mkcert <lan-ip> localhost`),
  run Vite with `https: { cert, key }` in `server`, then install mkcert's
  root CA on the phone (AirDrop it, then Settings → General → About →
  Certificate Trust Settings → enable full trust) so Safari accepts it.
  Works offline, no third party involved.
- **A tunnel** (ngrok, Cloudflare Tunnel/`cloudflared`): gives a public HTTPS
  URL forwarding to `localhost:5173`. Faster to set up, but routes traffic
  through a third party — fine for throwaway testing, not for anything
  sensitive.

## Sanity-checking without a phone in hand

Before reaching for a real device, feed a real photo through the pipeline
directly in the browser console (Browser pane → `javascript_tool`) — no
simulator needed:

```js
const cache = await import('/src/descriptorCache.ts');
const match = await import('/src/cardScanMatch.ts');
const img = await import('/src/cardScanImage.ts');

// Needs a descriptor bundle in public/scan-data — see docs/card-scanning.md.
const manifest = await (await fetch('/scan-data/descriptors.manifest.json')).json();
await cache.ensureDescriptors(manifest, '/scan-data');
const candidates = await match.loadCandidates(manifest);

const blob = await (await fetch('/path/to/photo.jpg')).blob();
const result = await match.matchCard(await img.loadImageForScan(blob), candidates);
// { cardId, inliers, examined, runnerUp } — inliers >= 10 is a confident match.
await match.releaseCandidates(candidates);
```

There is also a dev-only page at `/dev/scan-validate` that runs this over a
set of fixture photos and reports per-case results.

HEIC photos (the default iPhone format) need converting first —
`sips -s format jpeg photo.HEIC --out photo.jpg` on macOS. This is the method
that has caught every real scanner bug so far; it's faster to iterate on
than a physical device and catches most issues before a phone is needed at
all.
