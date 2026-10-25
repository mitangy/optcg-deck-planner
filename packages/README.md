# packages/

Shared libraries for the digital duel client.

| Package | Purpose | First step |
|---------|---------|------------|
| [rules](./rules/) | Headless authoritative rules engine | [Step 1](../docs/duel-client/steps/01-rules-engine.md) |
| [deck-analytics](./deck-analytics/) | Deck stats, draw odds and build hints for the planner and duel-web | — |
| [analyst-client](./analyst-client/) | Log Pose chat for the planner and duel-web: SSE client, session, safe markdown, compass + panel (`src/logPose.css` themes via `--lp-*` properties) | — |
| [ui](./ui/) | Shared UI code for the planner and duel-web: card art urls and preview-art manifests (`src/cardArt/`), Headless UI popups (`src/popups/`) and tabs (`src/tabs/`) | — |
| [patch-notes](./patch-notes/) | "What's new" notes, page and once-per-update card for the planner and duel-web (`src/whatsNew.css` themes via `--wn-*` properties) | — |
