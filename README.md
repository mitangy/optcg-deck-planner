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

## Deploy

### 1. Neon
Create a free Postgres project and copy the connection string.

### 2. Google OAuth
In Google Cloud Console create an OAuth client (Web):
- Authorized redirect URI: `https://YOUR-API.onrender.com/auth/callback`
- Authorized JS origins: your Vercel URL + `http://localhost:5173`

### 3. Render
- New Web Service from this repo, root `backend`
- Or use [`render.yaml`](render.yaml)
- Set env vars (see `.env.example`): `DATABASE_URL`, `SESSION_SECRET`, `FRONTEND_ORIGIN`, `BACKEND_PUBLIC_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `ALLOW_ANY_GOOGLE_USER=false`, `CATALOG_SYNC_TOKEN`
- After first deploy, sync catalog:
  ```bash
  curl -X POST https://YOUR-API.onrender.com/admin/sync-catalog -H "X-Catalog-Token: YOUR_TOKEN"
  ```
  (Takes ~1 minute.)

### 4. Vercel
- Import repo, root `frontend`
- Env: `VITE_API_URL=https://YOUR-API.onrender.com`
- Deploy

### 5. Daily catalog sync
Use the included GitHub Action (`.github/workflows/catalog-sync.yml`) with secrets:
- `API_URL`
- `CATALOG_SYNC_TOKEN`

## API overview
- `GET /auth/google`, `GET /auth/callback`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST /decks`, `GET/PATCH/DELETE /decks/{id}`
- `GET /shopping`
- `PUT /owned/{card_id}`
- `POST /admin/sync-catalog` (token header)
- `GET /health`
