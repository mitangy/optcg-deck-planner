# Architecture

A map of the monorepo: what each app, service and package is, who calls whom, and where the tooling lives. For commands and deploy steps see the root [README](../README.md). The duel client's design history and per-step plans are in [`duel-client/`](duel-client/README.md); those are plans, and where they disagree with the code, the code wins.

## Map

```
 Browser
   |                                             Browser
   | https://optcg-deck-planner.app              | https://optcgduel.app
   v                                             v
 frontend/  (Vercel, planner SPA)             duel-web/  (Vercel, duel SPA)
   |  /api/*  (rewrite in vercel.json)           |  /api/*  (rewrite)      |  WebSocket (Colyseus)
   |                                             |                         |  VITE_GAME_SERVER_URL
   +--------------------+------------------------+                         v
                        v                                        game-server/  (Render, Node)
                 backend/  (Render, FastAPI) <----- match ingest, API_BASE_URL + DUEL_INGEST_SECRET
                   |    ^   join tokens: API signs, game-server verifies (GAME_TOKEN_SECRET)
                   |    |
                   |    +---- reads with ANALYST_SERVICE_SECRET ---- analyst/  (Render, Node, Log Pose)
                   v                                                   ^  reads PLANNER_API_URL
              Neon Postgres (SQLite locally)                           |  MCP tools / in-app chat
                                                                  Claude app, both SPAs
```

## Apps and services

| Path | Role | Talks to |
|------|------|----------|
| `frontend/` | Deck planner: decks, Owned counts, shopping list, prices, share links, group buys | `backend` through same-origin `/api`; imports `packages/*` |
| `duel-web/` | Online duel app: lobby, board, deck editor, replays, account pages | `backend` through `/api` (auth, tokens, ratings); `game-server` over WebSocket; imports `packages/*`. Its main bundle imports `@optcg/rules` as types only; only `src/replay/` uses it at runtime |
| `backend/` | FastAPI: Google OAuth and sessions, decks, catalog and TCGPlayer prices (daily sync), shopping, sharing, group buys, duel tokens, ratings and match history, Log Pose access and chat routes. 22 router modules in `backend/app/routers/` | Neon Postgres (SQLite when `DATABASE_URL` is unset); `analyst` through `ANALYST_SERVICE_SECRET` |
| `game-server/` | Authoritative duel rooms (Colyseus), ranked queue, reconnect, bots; runs `@optcg/rules` | `backend` for match ingest; Redis when configured (see [scaling](scaling.md)) |
| `analyst/` | Log Pose: card, deck, odds, simulation and stats tools served over MCP, plus the in-app chat and the eval suites (`analyst/evals`) | `backend` for stats, matches and personal data; the Claude API |
| `mobile/` | Expo duel client. **Paused**: no new work, not deployed. It still has a CI job and a mutation suite, so it must keep passing until it is removed or revived | `game-server`, `backend` |
| `trailer/` | Remotion project and capture scripts for the duel app trailer | none |

Apps and services are npm workspaces of the root `package.json` (with `packages/*`) and share one `package-lock.json`. `mobile/` and `trailer/` are not workspaces.

## Packages

Consumed from source: each `package.json` points `main`/`exports` at `src/`, so there is no build step and the apps compile them.

| Package | Used by |
|---------|---------|
| `@optcg/rules` | game-server, analyst, duel-web (types and `src/replay/`); mobile mirrors its protocol types by hand instead of importing it, and reads its fixtures and card atlas. Headless rules engine: state, intents, views, card definitions generated from card text plus reviewed overrides, bots, simulation, replays. Deterministic given `(state, intent, rng)` |
| `@optcg/deck-analytics` | frontend, duel-web, analyst. Deck stats, draw odds, build hints |
| `@optcg/price-timing` | frontend, analyst. "When to buy" verdicts |
| `@optcg/analyst-client` | frontend, duel-web. Log Pose chat client and panel |
| `@optcg/ui` | frontend, duel-web. Card art URLs, popups, tabs, SEO pre-render helpers, first-touch attribution |
| `@optcg/patch-notes` | frontend, duel-web. "What's new" notes (`src/notes.ts`) and card |
| `@optcg/site-legal` | frontend, duel-web. Legal pages, footer, feedback dialog |

## Data flow

- **Planner**: the SPA calls `/api/...`; Vercel rewrites it to the Render API and adds a shared-secret header (root `vercel.json`). A daily GitHub workflow (`catalog-sync.yml`) enqueues the TCGCSV catalog and price sync, which runs as a background job inside the API.
- **Sign-in**: Google OAuth through the API. The duel app proxies `/api` as well, and its origin is allowed for the OAuth callback through `OAUTH_CALLBACK_ORIGINS`.
- **Duel**: duel-web asks the API for a short-lived game token (signed with `GAME_TOKEN_SECRET`), joins a Colyseus room on the game server, and sends intents. The server validates them with `@optcg/rules` and sends each seat its own private view. When a match ends, the game server posts the result to the API (`DUEL_INGEST_SECRET`), which stores it for ratings, history and Log Pose.
- **Log Pose**: `analyst/` serves MCP tools and the chat. It reads recorded games, stats and personal data from the API with `ANALYST_SERVICE_SECRET`, and runs the same `@optcg/rules` engine for simulation and replays. Scheduled workflows run bot self-play (`bot-selfplay.yml`), lesson drafts (`bot-lessons.yml`) and value refits (`value-refit.yml`); the paid evals are manual (`log-pose-*.yml`).

## Deploy targets

| Target | What | Trigger |
|--------|------|---------|
| Vercel (planner) | `frontend/`, root `vercel.json` | `main` only |
| Vercel (duel app) | `duel-web/`, `duel-web/vercel.json` | `main` only |
| Render `optcg-api` | `backend/` | Render, from the repo |
| Render `optcg-game-server` | `game-server/` + `packages/rules` | Render; optionally blue/green via `game-server-blue-green.yml` |
| Render `optcg-analyst` | `analyst/` + `packages/rules`, `packages/deck-analytics` | Render |

`render.yaml` describes the three Render services; the dashboard is authoritative (see [scaling](scaling.md)). Both Vercel configs set `deploymentEnabled` to `false` for every branch except `main`.

## Tooling

- **CI** (`.github/workflows/ci.yml`): one job per app or service. On pull requests, `tools/ci/changes.cjs` turns the changed paths into per-job flags; unknown paths run everything. Node comes from `.nvmrc` through the composite actions in `.github/actions/`. Other workflows are scheduled or manual.
- **Mutation check** (`tools/mutation-check/`): proves tests can fail. Each suite in `tools/mutation-check/suites/<suite>.cjs` lists small edits to production code (`from` -> `to`) and the tests that must fail (`kills`). `run.cjs` applies them one at a time; `--check-anchors` verifies every anchor still matches; `changed.cjs` re-proves only the mutations a PR adds or changes (the `mutation-plan`, `mutation-proofs-part` and `mutation-proofs` CI jobs). Details: [`tools/mutation-check/README.md`](../tools/mutation-check/README.md).
- **PR checks** (`tools/ci/`): `pr-media.cjs` (no screenshots or recordings in code branches), `case-collisions.cjs`, `discord-patch-notes.cjs`. Screenshots for PRs go to the `pr-assets` branch with `tools/pr-assets/upload.sh`.
- **Scripts** (`scripts/`): Python catalog, cosmetics, preview-art and price-history tools with their `test_*.py` files; `scripts/seo` is the shared pre-render plugin the two SPAs use.
- **Docs**: this file and the README are the entry points. `docs/duel-client/` holds the duel client plans and ADRs, `docs/scaling.md` the capacity and rollout plan, `docs/card-scanning.md` the card scanner. Each package and service has its own README.
