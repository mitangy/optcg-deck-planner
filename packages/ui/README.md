# @optcg/ui

Shared UI code for the planner (`frontend/`) and duel-web. Both apps compile it
from source through a Vite alias (and a `tsconfig` path), like
`@optcg/patch-notes`.

## cardArt

`import { ... } from "@optcg/ui"` or `"@optcg/ui/cardArt"`.

- `cardImageUrl(src, size)`: rewrite a TCGplayer CDN url to `_400w` (thumb) or `_in_1000x1000` (large).
- `cardArtChain(src, cardId, size, origin?)`: the planner's ordered urls to try (resized, original, preview).
- `previewArtPath` / `altPreviewArtPath` / `isPreviewArtPath` / `previewArtUrl`: unofficial preview art for cards TCGplayer has no picture for. Every function that builds a url takes an `origin` (default `""`, a relative `/cards/preview/...` path). The planner passes the duel app's origin because the webp files are hosted by duel-web (`duel-web/public/cards/preview/`).
- `artAfterError`, `localCardArtPath`, `isLocalCardsUrl`, `isTcgplayerCdnUrl`, `isPlaceholderArt`: duel-web's art fallback chain.

`src/cardArt/previewArt.json` (card ids) and `previewArtAlts.json` (alt-printing
product ids) are the manifests of the preview files. They are maintained by
`python3 scripts/sync_preview_art.py`; do not edit them by hand.
