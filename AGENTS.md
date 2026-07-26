# AGENTS.md — OPTCG Deck Planner

See `CLAUDE.md` for product context and required UI-polish rules. See `README.md` for the canonical local-dev and deploy commands.

## Cursor Cloud specific instructions

Two services plus a zero-setup local DB:

- Backend: FastAPI in `backend/`, runs on `http://localhost:8000`.
- Frontend: Vite/React SPA in `frontend/`, runs on `http://localhost:5173`.
- DB: defaults to local SQLite (`backend/optcg.db`); tables auto-create on backend startup via `init_db()`. No Postgres needed locally.

Non-obvious caveats:

- Only `python3` is available (no `python`). Run the backend and tests with `python3 -m ...`: `python3 -m uvicorn app.main:app --reload --port 8000` and `python3 -m pytest`. Console scripts (`uvicorn`, `pytest`) install to `~/.local/bin`, which is not on PATH.
- The `.env` files are gitignored and are recreated from `*.env.example` by the update script. `enable_dev_login` defaults to `False` in `backend/app/config.py`, so **without `backend/.env` the "Dev login (local)" button fails**. Keep `FRONTEND_ORIGIN` as `http://...` locally — an `https://` origin flips the app into production mode and it refuses to start with dev login / default `SESSION_SECRET`.
- Auth for local testing: click **Dev login (local)** on the sign-in screen (no Google OAuth needed). It logs in as `dev@localhost`.
- The card catalog is empty locally, so imported cards render as their ID with "(not in catalog)" and no prices/images. This is expected — real names/prices require the optional TCGCSV catalog sync (`POST /admin/sync-catalog`) and external network access.
- `backend/scripts/seed.py` is a no-op locally: it only imports data when a sibling `../optcg_tracker/` cache exists (not in this repo). Skipping it is fine; tables still auto-create on startup.
- README's local-dev commands use Windows syntax (`py -3`, `copy`); on this Linux VM use `python3` and `cp`.

Common commands:

- Backend tests: `cd backend && python3 -m pytest`
- Frontend tests: `cd frontend && npm test`
- Frontend typecheck + build: `cd frontend && npm run build` (runs `tsc --noEmit && vite build`)
- Frontend dev: `cd frontend && npm run dev`
