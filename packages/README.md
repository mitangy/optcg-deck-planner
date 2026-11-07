# packages/

Shared libraries for the deck planner (`frontend/`), the duel app (`duel-web/`) and the Node services (`game-server/`, `analyst/`). They are npm workspaces of the repo root, installed once with `npm ci`, and are compiled from `src/` by their consumers.

| Package | Purpose | First step |
|---------|---------|------------|
| [rules](./rules/) | Headless authoritative rules engine | [Step 1](../docs/duel-client/steps/01-rules-engine.md) |
| [duel-protocol](./duel-protocol/) | The duel wire protocol shared by game-server and duel-web: message names, constants, error codes, payload types and envelope parsers. Reaches `@optcg/rules` for `PlayerView`, `Intent` and `GameEvent` through `import type` only | — |
| [deck-analytics](./deck-analytics/) | Deck stats, draw odds, build hints and the meta-deck text formatters (`src/metaFormat.ts`) for the planner and duel-web | — |
| [price-timing](./price-timing/) | "When to buy" for a card: art kind, typical price curve after release and a plain verdict, for the planner and Log Pose | — |
| [analyst-contract](./analyst-contract/) | The Log Pose wire contract shared by `analyst/`, `analyst-client` and the API: scope pattern, model ids, refusal codes, hint limits, stream event names; `fixtures/backend-values.json` pins the API's copies | — |
| [analyst-client](./analyst-client/) | Log Pose chat for the planner and duel-web: SSE client, session, safe markdown, compass + panel (`src/logPose.css` themes via `--lp-*` properties) | — |
| [ui](./ui/) | Shared code for the planner and duel-web: card art urls and preview-art manifests (`src/cardArt/`), Headless UI popups (`src/popups/`) and tabs (`src/tabs/`), page-meta and pre-render helpers (`src/seo/`), signup attribution (`src/firstTouch/`), the app shell's build tag, version check and analytics scrubber (`src/appShell/`), `useMediaQuery`, `cx` and the username rules | — |
| [patch-notes](./patch-notes/) | "What's new" notes, page and once-per-update card for the planner and duel-web (`src/whatsNew.css` themes via `--wn-*` properties) | — |
| [site-legal](./site-legal/) | Fan-project footer, Terms & Credits / Privacy / Cookies pages, and the feedback dialog and payload, for both apps | — |
