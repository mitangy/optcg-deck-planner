# OPTCG Deck Planner

Import decks and keep track of what cards you need to buy to finish them.

FastAPI + Vite/React app for tracking One Piece TCG decks, Owned counts across your decks, and TCGPlayer market prices.

## Stack
- **Frontend:** Vite + React on Vercel
- **Backend:** FastAPI on Render
- **DB:** Neon Postgres (SQLite locally)
- **Auth:** Google OAuth (+ optional local `ENABLE_DEV_LOGIN`)
- **Prices:** [TCGCSV](https://tcgcsv.com/) daily sync

## Local development

### Backend
```bash
cd backend
py -3 -m pip install -r requirements.txt
copy .env.example .env
py -3 scripts\seed.py
py -3 -m uvicorn app.main:app --reload --port 8000
```

Or from the repo root: `start-backend.bat` (runs inside `backend/`).

Seed is **local-only** — it imports catalog from `../optcg_tracker/cache/catalog.json` (if present) and sample deck `.txt` files.

### Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5173 — use **Dev login** when `ENABLE_DEV_LOGIN=true` and Google OAuth is unset.

## Live URLs

| Piece | URL |
|-------|-----|
| App | https://optcg-deck-planner.vercel.app |
| API (via app) | https://optcg-deck-planner.vercel.app/api/… |
| API (direct) | https://optcg-api-nutb.onrender.com/health |

Browsing the bare Render host (`/`) returns a small JSON index; use `/health` or `/docs` for checks. Free Render may cold-sleep after idle (~30–60s wake).

## Deploy

### Current prod
- **Vercel** project `miko21/optcg-deck-planner` — **Root Directory = `.`** (repo root), config in the root `vercel.json` (install/build via `npm --prefix frontend`, output `frontend/dist`, `/api/*` rewrite → Render). Do **not** set Vercel's Root Directory to `frontend/` — the root `vercel.json` is the single source of truth.
- **Render** service `optcg-api` (`srv-d9i5jin41pts73an781g`, root `backend`)
- **Neon** project `optcg-deck-planner` (`DATABASE_URL` on Render)

Vercel and Render deploy **separately**. A merge that only updates the SPA can go live on Vercel while Render is still on an older API. If deck leaders look empty after a frontend change that needs new API fields, open the Render dashboard for `optcg-api` and **Manual Deploy** the latest `main` (confirm `/health` includes the expected `"api_revision"` and OpenAPI `DeckSummary` lists `leader_name` / `leader_image_url`).

Render's **free** plan cold-sleeps after ~15 min idle, so the first `/api/*` request after idle can take ~30–60s (occasional login/API flakiness). This is expected on free — use a paid instance or an external keepalive ping to avoid it.

Production frontend should use same-origin `/api` — **leave `VITE_API_URL` unset** (or use a relative path like `/api`) in production. Do **not** point `VITE_API_URL` at the raw Render host: cross-origin API calls make the session cookie third-party and break login on mobile Safari, defeating the `/api` rewrite. The production build enforces this and fails if `VITE_API_URL` is an absolute `http(s)://` URL (see `frontend/vite.config.ts`).

The `/api/*` rewrite target (the Render host) is hardcoded in the root `vercel.json`. If the Render service is renamed or its URL changes, update `vercel.json` and redeploy Vercel, or all `/api` traffic breaks.

Prod also **fails fast** on insecure defaults: with an `https://` `FRONTEND_ORIGIN` the API refuses to start unless `SESSION_SECRET` and `CATALOG_SYNC_TOKEN` are set to strong (non-default) values and `ENABLE_DEV_LOGIN` is false. Render generates `SESSION_SECRET` / `CATALOG_SYNC_TOKEN` via `render.yaml`.

### Database (Neon)
- Set `DATABASE_URL` on Render to the Neon connection string. Neon requires TLS, so include **`?sslmode=require`** (e.g. `postgresql://USER:PASS@HOST/db?sslmode=require`). `postgres://` URLs are auto-rewritten to `postgresql://`.
- The engine uses `pool_pre_ping=True` + `pool_recycle=300` for Postgres so idle Neon connections don't surface as "server closed the connection" after a lull.
- **Schema management is `create_all` + targeted `ALTER TABLE` only** (`init_db()` / `_ensure_group_buy_columns()` in `app/db.py`); there are no migrations. New tables/columns are created on startup, but broader schema changes (renames, type changes, drops) won't apply automatically — introduce Alembic (or run manual SQL) for those.

### Google OAuth
In Google Cloud Console (OAuth Web client):
- Authorized redirect URI: `https://optcg-deck-planner.vercel.app/api/auth/callback`
- Authorized JS origins: `https://optcg-deck-planner.vercel.app` + `http://localhost:5173`
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
- `API_URL=https://optcg-api-nutb.onrender.com`
- `CATALOG_SYNC_TOKEN` (same value as Render)

## API overview
- `GET /` — service index
- `GET /health`, `GET /docs`
- `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /decks`, `GET/DELETE /decks/{id}`
- `PUT/DELETE /decks/{id}/cards/{card_id}` — add/update/remove cards (`confirm_oversize` soft-confirms past 51)
- `POST /decks/{id}/reset-owned` — set Owned to 0 for every card in the deck
- `GET /shopping?deck_ids=`
- `PUT /owned/{card_id}`
- `GET /share/shopping`, `POST /share`, `DELETE /share/{token}` — create/manage public links
- `GET /public/share/{token}` — unauthenticated read-only shopping/deck view
- `GET/POST /group-buys`, `GET/DELETE /group-buys/{id}` — collaborative group buys
- `POST /group-buys/join/{token}`, `GET /public/group-buys/{token}` — invite join + preview
- `PUT /group-buys/{id}/contribution`, `POST .../lock`, `POST .../unlock`
- `POST/PATCH /group-buys/{id}/order` — mark ordered + order notes / shipping split
- `POST /group-buys/{id}/complete` — mark purchased (apply Owned)
- `PUT/DELETE /group-buys/{id}/quantities/{card_id}`, `POST .../quantities/sync`
- `PUT /group-buys/{id}/lines/{card_id}`, `GET .../export/tcgplayer`
- `GET /catalog/cards` — search catalog by name/id/color/type (auth)
- `GET /catalog/sales/{product_id}` — last sold prices from TCGPlayer (cached, public)
- `POST /admin/sync-catalog` (token header) — enqueue-only, returns `202`
- `GET /admin/sync-catalog/status` (token header) — background sync state
- `GET /catalog/status` (auth required)

## Sharing
From **Shopping** or a **Deck** page, use **Share public link** to copy a URL like `/share/<token>`. Anyone with the link can view the list (owned / still need / prices) without signing in. Turn the shopping link off anytime from the Shopping page.

## Group buys
Start a group buy from **Shopping** or **Group buys**, copy the invite link, and have friends sign in to join. Quantities default to each member’s shopping still-need (summed across members); each person can edit **Your buy** per card, then the host **Locks for checkout** and exports with **Open Mass Entry**. After placing the bulk order, **Mark ordered** (does not change Owned). Enter shipping and split costs (equal / by card cost / by copies). When cards are received, **Mark purchased** applies each member’s quantities to Owned and clears those copies from shopping.

## Backend tests
```bash
cd backend
pip install -r requirements.txt
python -m pytest
```
