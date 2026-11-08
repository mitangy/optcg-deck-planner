# OPTCG Deck Planner

A One Piece Card Game monorepo: a deck planner and shopping list, an online duel app, the services behind them, and the shared libraries they use.

- **Deck planner** (`frontend/`): import decks, track Owned counts across decks, see TCGPlayer market prices and recent sales, share lists, run group buys.
- **Duel app** (`duel-web/`): play the card game online against people or bots, with a deck editor and replays.
- **Log Pose** (`analyst/`): an AI deck analyst served over MCP and as the in-app chat.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together and where data flows.

## What is in the repo

| Path | What it is | Runtime | Deployed to |
|------|------------|---------|-------------|
| [`frontend/`](frontend/) | Deck planner SPA (`optcg-frontend`) | Vite + React | Vercel, `main` only (root `vercel.json`) |
| [`duel-web/`](duel-web/) | Duel app SPA (`optcg-duel-web`) | Vite + React | Vercel, `main` only (`duel-web/vercel.json`) |
| [`backend/`](backend/) | API: auth, decks, catalog, prices, shopping, group buys, duel profiles and match ingest | FastAPI, Python 3.12 | Render `optcg-api` |
| [`game-server/`](game-server/) | Authoritative duel rooms, matchmaking, reconnect (`@optcg/game-server`) | Node + Colyseus | Render `optcg-game-server` |
| [`analyst/`](analyst/) | Log Pose: MCP tools, in-app chat, evals (`@optcg/analyst`) | Node | Render `optcg-analyst` |
| [`packages/`](packages/) | Shared libraries, consumed from source (see below) | TypeScript | bundled into the apps and services |
| [`mobile/`](mobile/) | Expo duel client. **Paused**: not maintained or shipped; kept in CI and in the mutation suites. | Expo / React Native | not deployed |
| [`trailer/`](trailer/) | Remotion project and capture scripts for the duel app trailer | Node | not deployed |
| [`backend/scripts/`](backend/scripts/) | Python data scripts (catalog import, cosmetics, preview art, price backfill) and their `test_*.py` files | Python | run by hand or by workflows |
| [`tools/`](tools/) | Repo tooling: `ci/` (PR path filter and checks), `mutation-check/`, `pr-assets/`, `seo/` (pre-render plugin and route table both SPAs import), `vercel-ignore-build.sh`, `dev-lan.sh` | Node | CI and builds |
| [`docs/`](docs/) | [Architecture map](docs/ARCHITECTURE.md), [scaling](docs/scaling.md), [card scanning](docs/card-scanning.md), [duel client plans](docs/duel-client/README.md) | | |

### Packages

| Package | Purpose |
|---------|---------|
| [`@optcg/rules`](packages/rules/) | Headless, deterministic rules engine, card definitions, bots and simulation; used by game-server, analyst, duel-web (replays and types) |
| [`@optcg/duel-protocol`](packages/duel-protocol/) | Duel wire protocol (message names, constants, payload types, envelope parsers) shared by game-server and duel-web; type-only link to the rules |
| [`@optcg/deck-analytics`](packages/deck-analytics/) | Deck stats, draw odds and build hints |
| [`@optcg/price-timing`](packages/price-timing/) | "When to buy" verdicts from price history |
| [`@optcg/analyst-client`](packages/analyst-client/) | Log Pose chat client and panel for both apps |
| [`@optcg/ui`](packages/ui/) | Shared UI code: card art URLs, popups, tabs, SEO pre-render helpers, first-touch attribution |
| [`@optcg/patch-notes`](packages/patch-notes/) | "What's new" notes and card shown in both apps |
| [`@optcg/site-legal`](packages/site-legal/) | Legal pages, footer and the feedback dialog |

## Local development

One install covers every JavaScript workspace (`packages/*`, `game-server`, `analyst`, `frontend`, `duel-web`). There are no per-app lockfiles or installs. Node 22 (`.nvmrc`).

```bash
npm ci                 # repo root; one package-lock.json
```

`mobile/` and `trailer/` are outside the workspaces and keep their own installs.

### Backend
Python 3.12 (`backend/.python-version`). `requirements.txt` is a generated lock (production, what Render installs); to change dependencies, edit `requirements.in` and regenerate it with the command in the lock file header. Tests use `requirements-dev.txt` (`requirements-dev.in` adds pytest, fakeredis and pytest-recording). The database is SQLite (`backend/optcg.db`) unless `DATABASE_URL` is set; tables are created on startup.
```bash
cd backend
python3 -m pip install -r requirements-dev.txt
cp .env.example .env
python3 -m uvicorn app.main:app --reload --port 8000
```
On Windows use `py -3` for `python3` and `copy` for `cp`; `start-backend.bat` at the repo root runs the backend inside `backend/`.

`backend/scripts/seed.py` is local-only: it imports a catalog from `../optcg_tracker/cache/catalog.json` (if present) and sample deck `.txt` files, and does nothing in this repo otherwise.

### Deck planner
```bash
cd frontend
cp .env.example .env
npm run dev            # http://localhost:5173
```
Use **Dev login** when `ENABLE_DEV_LOGIN=true` and Google OAuth is unset.

### Duel app, game server, Log Pose
```bash
cd duel-web && npm run dev              # Vite dev server (see duel-web/.env.example)
npm run dev:game-server                 # repo root; Colyseus on 0.0.0.0:2567 by default
npm run start:analyst                   # repo root; Log Pose service
```
`tools/dev-lan.sh` starts the stack for testing from another device on your network.

## Tests

| What | Command |
|------|---------|
| Every JS workspace's unit tests | `npm test` (repo root) |
| One package or service | `npm run test:rules`, `test:game-server`, `test:analyst`, `test:ui`, `test:patch-notes`, ... (see root `package.json`) |
| Typecheck every workspace | `npm run typecheck` |
| Lint TypeScript (ESLint, `eslint.config.js`; warnings do not fail) | `npm run lint` (repo root) |
| Lint Python (ruff, `ruff.toml`) | `ruff check backend` (`ruff` is pinned in `backend/requirements-dev.txt`) |
| Planner / duel-web | `cd frontend && npm test`; `cd duel-web && npm test` |
| Planner / duel-web browser tests (Playwright) | `npm run e2e` inside the app |
| Backend | `cd backend && python3 -m pytest` |
| Python script tests | `cd backend/scripts && python3 -m unittest test_bandai_metadata test_cosmetics_product_ids test_sync_preview_art test_sync_alt_arts test_backfill_price_history` |
| PR path filter and CI checks | `node --test "tools/ci/*.test.cjs"` |
| Mutation-check tooling | `node --test "tools/mutation-check/*.test.cjs"` |
| Mutation anchors (no tests run) | `node tools/mutation-check/run.cjs --check-anchors` |
| A mutation suite | `node tools/mutation-check/run.cjs <suite> --only '^<id>$'` |

Every test must be provable: a test ships with a mutation in `tools/mutation-check/suites/` that makes it fail. See [`tools/mutation-check/README.md`](tools/mutation-check/README.md) and `CLAUDE.md`.

### CI
`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. On pull requests the `changes` job maps the changed paths to jobs (`tools/ci/changes.cjs`); a path it does not know runs everything. Node comes from `.nvmrc` through the composite action `.github/actions/setup-node-deps`, which also runs the root `npm ci` with the npm cache. The other workflows are scheduled or manual (nightly fuzz and Stryker, catalog sync, bot self-play, Log Pose evals, game-server blue/green deploy, scan retraining).

## Live URLs

| Piece | URL |
|-------|-----|
| App | https://optcg-deck-planner.app (the old `optcg-deck-planner.vercel.app` redirects here) |
| API (via app) | https://optcg-deck-planner.app/api/… |
| Duel app | https://optcgduel.app |
| API (direct) | https://optcg-api-nutb.onrender.com/health |

Browsing the bare Render host (`/`) returns a small JSON index; use `/health` or `/docs` for checks. Free Render may cold-sleep after idle (~30–60s wake).

## Deploy

### Current prod
- **Vercel** project `miko21/optcg-deck-planner` — **Root Directory = `.`** (repo root), config in the root `vercel.json` (install with `npm ci` at the repo root, build with `cd frontend && npx vite build`, output `frontend/dist`, `/api/*` rewrite → Render). Do **not** set Vercel's Root Directory to `frontend/` — the root `vercel.json` is the single source of truth.
- **Vercel** project for the duel app, Root Directory `duel-web`, config in `duel-web/vercel.json` (install `cd .. && npm ci`, build `npx vite build`, output `dist`, same `/api/*` rewrite). Both Vercel projects deploy **from `main` only**: `deploymentEnabled` is `false` for every other branch in both `vercel.json` files, and an `ignoreCommand` (`tools/vercel-ignore-build.sh`) skips builds that touch none of the app's paths.
- **Render** service `optcg-api` (`srv-d9i5jin41pts73an781g`, root `backend`)
- **Render** services `optcg-game-server` and `optcg-analyst` (Node, installed from the repo root with `npm ci --workspace=...`, each with a `buildFilter` on its own paths and the packages it uses). `render.yaml` describes all three, but the services are configured in the Render dashboard, so a setting there only takes effect once it is copied to the dashboard (`docs/scaling.md`). The game server can also be deployed blue/green through `.github/workflows/game-server-blue-green.yml` (see `docs/scaling.md`).
- **Neon** project `optcg-deck-planner` (`DATABASE_URL` on Render)

Vercel and Render deploy **separately**. A merge that only updates the SPA can go live on Vercel while Render is still on an older API. If deck leaders look empty after a frontend change that needs new API fields, open the Render dashboard for `optcg-api` and **Manual Deploy** the latest `main` (confirm `/health` includes the expected `"api_revision"` and OpenAPI `DeckSummary` lists `leader_name` / `leader_image_url`).

Render's **free** plan cold-sleeps after ~15 min idle, so the first `/api/*` request after idle can take ~30–60s (occasional login/API flakiness). This is expected on free — use a paid instance or an external keepalive ping to avoid it.

Production frontend should use same-origin `/api` — **leave `VITE_API_URL` unset** (or use a relative path like `/api`) in production. Do **not** point `VITE_API_URL` at the raw Render host: cross-origin API calls make the session cookie third-party and break login on mobile Safari, defeating the `/api` rewrite. The production build enforces this and fails if `VITE_API_URL` is an absolute `http(s)://` URL (see `frontend/vite.config.ts`).

The SPA shows a short **build tag** (git SHA) in the top bar / login card so you can confirm which commit a deploy is running. It is baked in at build time from `VERCEL_GIT_COMMIT_SHA` (on Vercel) or `git rev-parse --short HEAD` locally — override with `VITE_GIT_SHA` if needed.

The `/api/*` rewrite target (the Render host) is hardcoded in the root `vercel.json`. If the Render service is renamed or its URL changes, update `vercel.json` and redeploy Vercel, or all `/api` traffic breaks.

Prod also **fails fast** on insecure defaults: with an `https://` `FRONTEND_ORIGIN` the API refuses to start unless `SESSION_SECRET` and `CATALOG_SYNC_TOKEN` are set to strong (non-default) values and `ENABLE_DEV_LOGIN` is false. `DUEL_INGEST_SECRET` must be strong too, and when `OPS_ADMIN_TOKEN` is set (the token for ops routes such as the game-server pool pointer and duel card-report triage) it must differ from `CATALOG_SYNC_TOKEN`; while it is unset those routes fall back to `CATALOG_SYNC_TOKEN`. Render generates `SESSION_SECRET` / `CATALOG_SYNC_TOKEN` via `render.yaml`.

### Database (Neon)
- Set `DATABASE_URL` on Render to the Neon connection string. Neon requires TLS, so include **`?sslmode=require`** (e.g. `postgresql://USER:PASS@HOST/db?sslmode=require`). `postgres://` URLs are auto-rewritten to `postgresql://`.
- The engine uses `pool_pre_ping=True` + `pool_recycle=300` for Postgres so idle Neon connections don't surface as "server closed the connection" after a lull.
- **Schema management is Alembic** (`backend/migrations`). API startup runs `alembic upgrade head` under the startup advisory lock (`app.core.migrate`, called from `init_db()` in `app/core/db.py`), then seeds reference data (`app/core/seed.py`). Change a model, then add a migration; see `backend/migrations/README.md`.

### Google OAuth
In Google Cloud Console (OAuth Web client):
- Authorized redirect URI: `https://optcg-deck-planner.app/api/auth/callback` (must match `BACKEND_PUBLIC_URL` + `/auth/callback`)
- Duel app redirect URI: `https://optcgduel.app/api/auth/callback` (duel-web proxies `/api`; enabled by `OAUTH_CALLBACK_ORIGINS`)
- Authorized JS origins: `https://optcg-deck-planner.app` + `https://optcgduel.app` + `http://localhost:5173`
- `FRONTEND_ORIGIN` and `BACKEND_PUBLIC_URL` must share a host (both `optcg-deck-planner.app`); a mismatch flips the session cookie to `SameSite=None`
- Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on Render

### Access control
Current prod **allows any signed-in Google user** — `ALLOW_ANY_GOOGLE_USER=true` is set on Render (see `render.yaml`), which lets any Google account sign in and **ignores `ALLOWED_EMAILS`**. To restrict access instead, set `ALLOW_ANY_GOOGLE_USER=false` and list permitted addresses in `ALLOWED_EMAILS`.
- **Open to any Google user (current prod):** `ALLOW_ANY_GOOGLE_USER=true`
- **Allowlist:** `ALLOW_ANY_GOOGLE_USER=false` + `ALLOWED_EMAILS` = comma-separated list

Google Cloud **test users** only matter while the OAuth consent screen is in Testing mode.

### Catalog sync
The sync is **enqueue-only**: the endpoint starts a background job and returns `202` immediately (a full TCGCSV pull is too long to run inside a request). Poll the status endpoint to see progress/results.
```bash
# Start (returns 202 {"status":"started"}; "already_running" if one is in flight)
curl -X POST https://optcg-api-nutb.onrender.com/admin/sync-catalog -H "X-Catalog-Token: YOUR_TOKEN"
# Check progress / last result
curl https://optcg-api-nutb.onrender.com/admin/sync-catalog/status -H "X-Catalog-Token: YOUR_TOKEN"
```

GitHub Action (`.github/workflows/catalog-sync.yml`) secrets:
- `CATALOG_SYNC_TOKEN` (**required**) — same value as Render `optcg-api` → Environment. Without this secret the daily job fails immediately (every run since setup has failed for this reason).
- `API_URL` (optional) — defaults to `https://optcg-api-nutb.onrender.com`

The Action enqueues the sync, retries through Render free-tier cold starts, then polls `/admin/sync-catalog/status` until the background job finishes (or fails).


## Backend API
The API serves interactive docs at `/docs` (OpenAPI at `/openapi.json`); its routers are in `backend/app/routers/`. Planner routes are reached through the app as `/api/...`.

## Sharing
From **Shopping** or a **Deck** page, use **Share public link** to copy a URL like `/share/<token>`. Anyone with the link can view the list (owned / still need / prices) without signing in. Turn the shopping link off anytime from the Shopping page.

## Group buys
Start a group buy from **Shopping** or **Group buys**, copy the invite link, and have friends sign in to join. Quantities default to each member’s shopping still-need (summed across members); each person can edit **Your buy** per card, then the host **Locks for checkout** and exports with **Open Mass Entry**. After placing the bulk order, **Mark ordered** (does not change Owned). Enter shipping and split costs (equal / by card cost / by copies). When cards are received, **Mark purchased** applies each member’s quantities to Owned and clears those copies from shopping.

