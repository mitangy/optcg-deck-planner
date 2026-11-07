# packages/

Shared libraries for the deck planner (`frontend/`), the duel app (`duel-web/`) and the Node services (`game-server/`, `analyst/`). They are npm workspaces of the repo root, installed once with `npm ci`, and are compiled from `src/` by their consumers.

| Package | Purpose | First step |
|---------|---------|------------|
| [rules](./rules/) | Headless authoritative rules engine | [Step 1](../docs/duel-client/steps/01-rules-engine.md) |
| [deck-analytics](./deck-analytics/) | Deck stats, draw odds and build hints for the planner and duel-web | — |
| [price-timing](./price-timing/) | "When to buy" for a card: art kind, typical price curve after release and a plain verdict, for the planner and Log Pose | — |
| [analyst-client](./analyst-client/) | Log Pose chat for the planner and duel-web: SSE client, session, safe markdown, compass + panel (`src/logPose.css` themes via `--lp-*` properties) | — |
| [ui](./ui/) | Shared code for the planner and duel-web: card art urls and preview-art manifests (`src/cardArt/`), Headless UI popups (`src/popups/`) and tabs (`src/tabs/`), page-meta and pre-render helpers (`src/seo/`), signup attribution (`src/firstTouch/`) | — |
| [patch-notes](./patch-notes/) | "What's new" notes, page and once-per-update card for the planner and duel-web (`src/whatsNew.css` themes via `--wn-*` properties) | — |
| [site-legal](./site-legal/) | Fan-project footer, Terms & Credits / Privacy / Cookies pages, and the feedback dialog and payload, for both apps | — |
