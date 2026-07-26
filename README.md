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
- **Vercel** project `miko21/optcg-deck-planner` — repo root, config in root `vercel.json` (install/build via `npm --prefix frontend`, `/api` rewrite → Render)
- **Render** service `optcg-api` (`srv-d9i5jin41pts73an781g`, root `backend`)
- **Neon** project `optcg-deck-planner` (`DATABASE_URL` on Render)

Vercel and Render deploy **separately**. A merge that only updates the SPA can go live on Vercel while Render is still on an older API. If deck leaders look empty after a frontend change that needs new API fields, open the Render dashboard for `optcg-api` and **Manual Deploy** the latest `main` (confirm `/health` includes `"api_revision": 3` and OpenAPI `DeckSummary` lists `leader_name` / `leader_image_url`).

Production frontend should use same-origin `/api` (leave `VITE_API_URL` as `/api` or unset in production). Do **not** point `VITE_API_URL` at the raw Render host in production — that breaks session cookies on mobile Safari.

### Google OAuth
In Google Cloud Console (OAuth Web client):
- Authorized redirect URI: `https://optcg-deck-planner.vercel.app/api/auth/callback`
- Authorized JS origins: `https://optcg-deck-planner.vercel.app` + `http://localhost:5173`
- Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on Render

### Access control
- **Allowlist:** `ALLOWED_EMAILS` = comma-separated list
- **Open to any Google user:** `ALLOW_ANY_GOOGLE_USER=true` (current prod setting)

Google Cloud **test users** only matter while the OAuth consent screen is in Testing mode.

### Catalog sync
```bash
curl -X POST https://optcg-api-nutb.onrender.com/admin/sync-catalog -H "X-Catalog-Token: YOUR_TOKEN"
```

GitHub Action (`.github/workflows/catalog-sync.yml`) secrets:
- `API_URL=https://optcg-api-nutb.onrender.com`
- `CATALOG_SYNC_TOKEN` (same value as Render)

## API overview
- `GET /` — service index
- `GET /health`, `GET /docs`
- `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /decks`, `GET/PATCH/DELETE /decks/{id}`
- `GET /shopping?deck_ids=`
- `PUT /owned/{card_id}`
- `GET /share/shopping`, `POST /share`, `DELETE /share/{token}` — create/manage public links
- `GET /public/share/{token}` — unauthenticated read-only shopping/deck view
- `GET/POST /group-buys`, `GET/DELETE /group-buys/{id}` — collaborative group buys
- `POST /group-buys/join/{token}`, `GET /public/group-buys/{token}` — invite join + preview
- `PUT /group-buys/{id}/contribution`, `POST .../lock`, `POST .../unlock`
- `PUT/DELETE /group-buys/{id}/quantities/{card_id}`, `POST .../quantities/sync`
- `PUT /group-buys/{id}/lines/{card_id}`, `GET .../export/tcgplayer`
- `GET /catalog/sales/{product_id}` — last sold prices from TCGPlayer (cached, public)
- `POST /admin/sync-catalog` (token header)
- `GET /catalog/status` (auth required)

## Sharing
From **Shopping** or a **Deck** page, use **Share public link** to copy a URL like `/share/<token>`. Anyone with the link can view the list (owned / still need / prices) without signing in. Turn the shopping link off anytime from the Shopping page.

## Group buys
Start a group buy from **Shopping** or **Group buys**, copy the invite link, and have friends sign in to join. Quantities default to each member’s shopping still-need (summed across members); each person can edit **Your buy** per card, then the host **Locks for checkout** and exports with **Open Mass Entry**.

## Backend tests
```bash
cd backend
pip install -r requirements.txt
python -m pytest
```
