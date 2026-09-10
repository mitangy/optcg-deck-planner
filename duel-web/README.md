# duel-web — OPTCG Duel (Vite web frontend)

Dedicated **Vite + React** SPA for the browser duel product (Step 4.5 / ADR-014). Speaks Colyseus `protocolVersion: 1`, renders server `legalIntents`, and uses Step 4 bearer game tokens.

This package is **outside** root npm workspaces (same isolation as `frontend/` and `mobile/`). It is **not** the deck planner (`frontend/`) and **not** Expo web export.

## Requirements

- Node.js ≥ 22
- Running `game-server` (`:2567`) and FastAPI (`:8000`) for local play

## Setup

```bash
cd duel-web
npm install
```

Regenerate the card atlas after editing `@optcg/rules` defs:

```bash
cd ../packages/rules
npm run export-atlas -- ../../duel-web/src/assets/cardAtlas.json
cp ../../duel-web/src/assets/cardAtlas.json ../../duel-web/public/cardAtlas.json
```

(Default `export-atlas` still writes `mobile/assets/cardAtlas.json`.)

## Environment

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_GAME_SERVER_URL` | `http://localhost:2567` | Colyseus HTTP(S); SDK uses WS/WSS |
| `VITE_API_URL` | `http://localhost:8000` | FastAPI for `/duel/dev-token` and ratings |
| `VITE_DEV_JOIN_SECRET` | (optional) | Must match game-server `DEV_JOIN_SECRET` |

Copy `.env.example` → `.env` for local overrides. Staging/production bake `VITE_*` at **build** time on Vercel.

HTTPS pages require a **WSS** game server (`https://` / `wss://`). Mixed content (HTTPS → `http://` Colyseus) fails closed.

### Staging mint (`POST /duel/dev-token`)

Production APIs keep `ENABLE_DEV_LOGIN=false` (startup refuses otherwise). For duel-web staging demos, set **`ENABLE_DUEL_DEV_TOKEN=true`** on the FastAPI service that `VITE_API_URL` points at. That unlocks cookie-free `/duel/dev-token` without enabling `/auth/dev-login`.

| Staging target | Notes |
|----------------|-------|
| `https://optcg-api-pr-84.onrender.com` | PR preview for this branch — prefer while Step 4.5 is unmerged |
| `https://optcg-api-nutb.onrender.com` | Production API — needs `ENABLE_DUEL_DEV_TOKEN` **and** the flag shipped on `main` |

If Create duel shows `Token mint failed (404)`, the API is hiding `/duel/dev-token` (flag off or old deploy).

## Run

```bash
# terminal 1 — repo root
npm run start:game-server

# terminal 2 — backend with ENABLE_DEV_LOGIN=true
cd backend && python3 -m uvicorn app.main:app --reload --port 8000

# terminal 3
cd duel-web
npm run dev
# → http://localhost:5174
```

### Two-browser local flow

1. Tab A: **Create duel** or **Ranked queue** (user key e.g. `web-a`).
2. Tab B: join room id **or** also **Ranked queue** (different user key).
3. Play from the action bar (intents only from the server).

## Vercel

Separate Vercel project from the deck planner. Config: `duel-web/vercel.json` (SPA rewrite). Suggested project root directory: `duel-web`.

Do **not** edit the repo-root `vercel.json` (planner).

## Architecture notes

- Board is a **pure renderer** of `welcome` / `view` / `events` / `error` / `match_over`.
- Playmat zones follow **OPTCG Sim / official layout** (Step 5.5 / ADR-015); visual chrome is TFT-inspired (gold HUD, bottom hand rail).
- Cosmetics from bundled **card atlas** keyed by `defId`.
- **Do not** import `@optcg/rules` for legality.
- Wire types: `src/net/protocol.ts` (mirrored from game-server).
- Layout QA: open `/demo` for a static playmat with sample zones (no live match).

## IP / private prototype

Official card names and Bandai cardlist art URLs are for **private prototype testing only**. Public production needs rights / feature flags (Step 5).

## Tests

```bash
cd duel-web
npm test
npm run build
```

## See also

- [Step 4.5 plan](../docs/duel-client/steps/04.5-web-deploy.md)
- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [mobile README](../mobile/README.md) — Expo is the **native** client; Expo web is **dev smoke only**
- [game-server README](../game-server/README.md)
