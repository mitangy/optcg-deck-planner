# mobile/ — OPTCG Duel Client (Expo)

Expo Router iOS-first client for **Step 3**: connect to the Colyseus `duel` room, render the private player view with **curated real OPTCG card ids / names / art**, and send intents from `view.legalIntents`.

This package is **outside** the root npm workspaces (same isolation as `frontend/`).

## Requirements

- Node.js ≥ 22
- Expo Go (or EAS development build) on a physical iPhone for device proof
- Running `game-server` reachable on your LAN (`0.0.0.0:2567`)

## Setup

```bash
cd mobile
npm install
```

Regenerate the card atlas after editing `@optcg/rules` defs:

```bash
cd ../packages/rules
npm run export-atlas
```

Writes `mobile/assets/cardAtlas.json`.

## Environment

| Variable | Example | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_GAME_SERVER_URL` | `http://192.168.1.10:2567` | Colyseus HTTP endpoint for `@colyseus/sdk` |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.10:8000` | FastAPI for `/duel/dev-token` and ratings |
| `EXPO_PUBLIC_DEV_JOIN_SECRET` | (optional) | Must match game-server `DEV_JOIN_SECRET` when set |

Defaults to `http://localhost:2567` (fine for web / iOS Simulator on the same machine). On a **physical phone**, use your computer’s LAN IP — `localhost` points at the phone.

## Run

```bash
# terminal 1 — from repo root
npm run start:game-server

# terminal 2
cd mobile
npm start
# then press i / scan QR for Expo Go, or `npm run web`
```

### Two-player local flow

1. Device A: **Create duel** → copy room id shown on the board chrome.
2. Device B: paste room id → **Join by room id** (different `devUserId`).
3. Play using the action bar (intents come only from the server).

You can also seat the second player with the game-server scripted test client.

## Architecture notes

- Board is a **pure renderer** of `welcome` / `view` / `events` / `error` / `match_over`.
- Cosmetics (name, art) come from the bundled **card atlas** keyed by `defId`.
- **Do not** import `@optcg/rules` for legality on device.
- Wire types live in `src/net/protocol.ts` (mirrored from `game-server/src/protocol.ts`).

## IP / private prototype

Official card names and Bandai cardlist art URLs are included for **private prototype testing only**. Public store builds need rights / feature flags (Step 5). Do not present this build as an official OPTCG product.

## Tests

```bash
cd mobile
npm test
npx tsc --noEmit
```

## EAS

`eas.json` stubs `development` / `preview` / `production` profiles. First vertical slice targets Expo Go; use a development client if cleartext LAN / WS needs native config.

```bash
npx eas-cli build --profile development --platform ios
```

## See also

- [Step 3 plan](../docs/duel-client/steps/03-expo-client-board.md)
- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [game-server README](../game-server/README.md)
- [rules README](../packages/rules/README.md)
