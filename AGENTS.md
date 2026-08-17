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

### UI review / walkthrough artifacts (required playbook)

When a change affects layout, card arts, lightbox, list/grid/mobile, or other interactive UI, **do not rely on the `computerUse` subagent alone** for proof. It is slow and flaky in this environment (Chrome “Restore pages?” bubble, missed clicks on `.thumb-btn`, long recoveries). Use the path below for a successful review.

#### Prefer scripted Chrome (Puppeteer) for measurements + screenshots

1. Ensure backend (`:8000`) and frontend (`:5173`) are up; `backend/.env` must have `ENABLE_DEV_LOGIN=true` and an `http://` `FRONTEND_ORIGIN`.
2. **Seed real catalog image URLs** before visual card-art checks. An empty local catalog shows “(not in catalog)” with no images — that is not a UI failure. Either insert a few `CatalogCard` / `CatalogPrinting` rows with live `https://tcgplayer-cdn.tcgplayer.com/product/{id}_200w.jpg` URLs, or sync the catalog. API-create a small deck (`POST /auth/dev-login` cookie → `POST /decks`) so Shopping has rows.
3. Drive the UI with **puppeteer-core + `/usr/bin/google-chrome-stable`** (install under `/tmp` if needed). Prefer this over computer-use for:
   - Dev login (`button` text `Dev login (local)`)
   - Opening lightbox (click `.thumb-btn`, wait for `.lightbox-img`)
   - List / Grid toggles
   - Measuring CSS box size (`getBoundingClientRect`) and proving image sources (`img.src`, `naturalWidth` / `naturalHeight`)
4. Card arts: catalog rows stay `_200w`; the client rewrites thumbs to `_400w` and lightbox to `_in_1000x1000` via `frontend/src/cardImage.ts`. A successful art review asserts those URLs and that the lightbox is hundreds of CSS pixels tall (typical native scan ~600×838), not that SAMPLE watermarks disappear (many TCGplayer/Bandai assets include SAMPLE).
5. Save screenshots under `/opt/cursor/artifacts/` with short snake_case names.

#### Demo videos (`RecordScreen`) need headed Chrome

`RecordScreen` captures the VM display (`DISPLAY=:1`), not headless Chrome. For a walkthrough video:

1. Launch **headed** Chrome with `--no-sandbox`, `--disable-session-crashed-bubble`, `--disable-infobars`, and a fixed `--window-size` / `--window-position` so the app is on-screen.
2. Log the Puppeteer `browser.wsEndpoint()`, then connect a second script to click list → lightbox → close → Grid → lightbox while recording.
3. `RecordScreen` START → run the click script → SAVE immediately after. Discard and retry if the lightbox never opens.
4. Optionally use `computerUse` only for light confirmation after Puppeteer already proved the flow — do not start with computer-use for lightbox demos.

#### Fast checklist before claiming UI work is done

- [ ] Automated: `cd frontend && npm test` (and `npm run build` if TS/CSS entry points changed)
- [ ] Seeded images (or catalog sync) so thumbs are real TCGplayer arts, not placeholders
- [ ] Puppeteer: list thumb size, lightbox opens, `src` is `_400w` / `_in_1000x1000` as expected
- [ ] Spot-check ~375px and ~1200px (mobile list vs desktop table/grid) per `CLAUDE.md` polish rules
- [ ] Artifacts in `/opt/cursor/artifacts/` (screenshots; video if the change is interactive)
- [ ] No layout shift on expand; full-width chrome; no phantom mobile scroll (`CLAUDE.md`)
