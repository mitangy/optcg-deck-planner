# OPTCG Deck Planner

Import decks and keep track of what cards you need to buy to finish them.

FastAPI + Vite/React app for tracking One Piece TCG decks, shared Owned counts, and TCGPlayer market prices.

## Stack
- **Frontend:** Vite + React on Vercel
- **Backend:** FastAPI on Render
- **DB:** Neon Postgres (SQLite locally)
- **Auth:** Google OAuth + `ALLOWED_EMAILS` allowlist (dev login available locally)
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

Seed imports the catalog from `../optcg_tracker/cache/catalog.json` (if present) and loads the sample deck `.txt` files.

### Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5173 — use **Dev login** if Google OAuth is not configured.

## Live URLs

| Piece | URL |
|-------|-----|
| Frontend | https://optcg-deck-planner.vercel.app |
| API | https://optcg-api-nutb.onrender.com |

## Deploy

### Current prod (already wired)
- **Vercel** project `miko21/optcg-deck-planner` (root: `frontend`, env `VITE_API_URL`)
- **Render** service `optcg-api` (`srv-d9i5jin41pts73an781g`, root: `backend`)
- **Neon** project `optcg-deck-planner` (Postgres connection string in Render `DATABASE_URL`)

### Still required for Google login
In Google Cloud Console create an OAuth client (Web):
- Authorized redirect URI: `https://optcg-api-nutb.onrender.com/auth/callback`
- Authorized JS origins: `https://optcg-deck-planner.vercel.app` + `http://localhost:5173`
- Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the Render service

Until those are set, the API is up but Google login returns 503. Local **Dev login** still works.

### After deploy / DB reset
Sync catalog (~1 min):
```bash
curl -X POST https://optcg-api-nutb.onrender.com/admin/sync-catalog -H "X-Catalog-Token: YOUR_TOKEN"
```

### Daily catalog sync
GitHub Action (`.github/workflows/catalog-sync.yml`) secrets:
- `API_URL=https://optcg-api-nutb.onrender.com`
- `CATALOG_SYNC_TOKEN` (same value as Render)

## API overview
- `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /decks`, `GET/PATCH/DELETE /decks/{id}`
- `GET /shopping`
- `PUT /owned/{card_id}`
- `POST /admin/sync-catalog` (token header)
- `GET /health`
