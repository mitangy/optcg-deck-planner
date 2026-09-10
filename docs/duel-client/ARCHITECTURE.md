# Architecture — OPTCG Digital Duel Client

## 1. Product shape

Players open a **mobile or web** client, authenticate, select or import a deck, enter matchmaking, and play a **server-authoritative** duel. The client never decides legal plays; it sends **intents** and renders **state diffs** (plus animations).

Target constraints:

- Up to **thousands of concurrent connected players** (online ≠ all in active duels).
- **iPhone-first**; Android is a later store pass on the same codebase; **web** is the same Expo app exported to static hosting (ADR-014).
- **No Mac required** for develop, build, or submit (Expo EAS + physical device; web via Vercel).

## 2. High-level diagram

```
┌─────────────────┐     HTTPS      ┌──────────────────┐
│  Expo client    │───────────────▶│  FastAPI         │
│  (mobile/)      │  auth, decks,  │  (backend/)      │
│  iOS / Android  │  catalog, MMR  │  Postgres (Neon) │
│  + web (RN-web) │                └────────▲─────────┘
└────────┬────────┘                         │
         │ WebSocket                        │ match results,
         │ (intents / diffs)                │ ratings writeback
         ▼                                  │
┌─────────────────┐     Redis      ┌────────┴─────────┐
│  Colyseus       │◀──────────────▶│  cache / presence │
│  (game-server/) │   pub-sub,     │  matchmaking aids │
│  + rules pkg    │   room routing │                   │
└─────────────────┘                └───────────────────┘
         │
         ▼
┌─────────────────┐
│  packages/rules │  pure TS: zones, costs, combat, triggers
│  (headless)     │  used by game-server + CI sims
└─────────────────┘
```

Companion web (`frontend/`) remains the **deck planner** on the existing Vercel project. The **duel** web UI is the Expo app’s static export on a **separate** Vercel project (ADR-014) — not a second board implementation inside Vite.

## 3. Layer responsibilities

### 3.1 Client (`mobile/`)

- Expo (React Native) + Expo Router.
- Surfaces: **iOS** (EAS), **Android** (later EAS), **web** (Expo static export → Vercel, Step 4.5+).
- Sign-in (Google / later Apple Sign-In), deck pick, lobby UI, board UI, animations.
- Holds ephemeral UI state only (selection, animation queues).
- Speaks:
  - REST/JSON to FastAPI for account and deck meta.
  - WebSocket (Colyseus JS client) for match traffic.
- Ships native via **EAS Build / EAS Submit**; ships web via **`expo export --platform web`** to a Vercel project **separate** from the deck planner.

### 3.2 Game server (`game-server/`)

- **Colyseus** (TypeScript) as the v1 authoritative match runtime.
- One **room** ≈ one duel (or lobby room → duel room handoff).
- Loads `packages/rules` to validate intents and advance the duel state machine.
- Broadcasts compact patches to seated players (and later spectators).
- Handles reconnect tokens / seat reclaim within a TTL.
- Horizontally scalable behind a load balancer with Redis presence (Colyseus documented pattern).

### 3.3 Rules package (`packages/rules`)

- Pure, headless TypeScript: no React, no Colyseus imports.
- **Authority:** official OPTCG Rule Manual + Comprehensive Rules (card text wins when present).
- Encodes official zones, turn phases (Refresh → Draw → DON!! → Main → End), DON!! economy (deck / cost / give), Life cards, and battle steps (Attack → Block → Counter → Damage → End).
- Card definition schema is data-driven; Step 1 uses a tiny placeholder subset that still exercises real structure (Blocker, Counter, Stage, etc.).
- Deterministic given `(state, intent, rng_seed)` so CI can replay matches.
- Exhaustive unit tests + batch simulation harness; README must list known gaps vs comprehensive rules (never silent house rules).

### 3.4 Meta API (`backend/`)

- Existing FastAPI service: auth, users, decks, catalog, shopping (unchanged product).
- Extended over time for: duel profiles, ratings/MMR, match history ingest, short-lived game-server tokens.
- Postgres (Neon) remains system of record for durable data.
- **Not** the hot path for turn resolution.

### 3.5 Redis

- Matchmaking queues / locks.
- Colyseus presence and multi-process room discovery.
- Rate limits and short-lived reconnect keys.
- Optional hot leaderboard cache.

### 3.6 Assets

- Card art and audio on object storage + CDN.
- Catalog metadata may continue to flow from existing catalog sync patterns; duel legality comes from `packages/rules` definitions, not from CDN files.

## 4. Trust model

| Trust | Examples |
|-------|----------|
| Client may suggest | Selected card id, attack target, “pass phase” |
| Server must decide | Legality, damage, triggers, deck order, RNG, timers, victory |
| Client must never | Shuffle secretly, reveal opponent hand, apply effects locally as truth |

Cheating surface is reduced by: authoritative state, server RNG, hidden zones only sent to the owner, and intent rate limits.

## 5. Realtime protocol (conceptual)

1. Client obtains session from FastAPI.
2. Client requests a **game token** (short-lived JWT or opaque token bound to user id + expiry).
3. Client joins Colyseus with that token; server validates with FastAPI or shared secret/JWKS.
4. Messages are **intents**, e.g. `{ type: "play_card", cardInstanceId, targets? }`.
5. Server replies with **events/patches**, e.g. `{ type: "card_played", ... }` or a versioned state snapshot + diff.
6. On match end, game server writes result to FastAPI; API updates MMR and history.

Exact schema is defined in Step 2 and refined in Step 3; both sides version the protocol.

## 6. Concurrency model

Assumptions for capacity planning (tune with metrics):

- Thousands **connected** (lobbies, idle, queueing).
- Hundreds of **simultaneous duels** as the expensive unit (CPU + WS fanout).
- Separate connection budgets: lobby vs in-match where practical.
- Spectators are read-only subscribers (Step 5) so they do not double simulation cost.

Scale levers:

1. Multiple Colyseus processes + Redis.
2. Always-on hosts (no free-tier cold start).
3. Keep rules pure and cheap; avoid sync I/O inside intent handlers.
4. Persist match history asynchronously after the room closes.

## 7. Environments

| Env | Client | Game server | API | Notes |
|-----|--------|-------------|-----|-------|
| Local | Expo Go / `expo start --web` | `game-server` on localhost | existing `:8000` | SQLite/Neon local per current AGENTS.md |
| Preview | EAS preview + **Vercel preview** (Step 4.5) | staging host (WSS) | staging API | Browser demos without phones; CORS allowlist |
| Production | App Store / Play + **Vercel duel web** (Step 5) | always-on cluster | Render (or equiv) + Neon | Redis required; planner Vercel project stays separate |

## 8. Security & App Store notes

- Prefer **Apple Sign-In** once shipping on iOS (Guideline expectations when other social logins exist).
- Secrets only on servers / EAS / Vercel server env — never in the app binary; `EXPO_PUBLIC_*` is public by definition.
- TLS everywhere (HTTPS page → WSS game server); pin nothing exotic in v1 unless threatened.
- Privacy policy / data deletion for accounts before public store or public web.

## 9. Relation to existing deck planner

- Decks created in the planner should become selectable in the duel client via the same FastAPI deck APIs (Step 3/4).
- Do not block duel MVP on shopping-list UI parity.
- Shared catalog IDs should align so a planner deck can map into rules definitions when card data exists.
- Do **not** merge the duel board into `frontend/`; link users across products via URLs/API instead (ADR-014).

## 10. Step mapping

| Architecture slice | First lands in |
|--------------------|----------------|
| `packages/rules` | Step 1 |
| `game-server` Colyseus room | Step 2 |
| `mobile` board + intents | Step 3 |
| Curated-card fidelity | Step 3.5 |
| Matchmaking, reconnect, ranked + browser-capable auth | Step 4 |
| Expo web → Vercel staging | Step 4.5 |
| Content breadth, spectate, Android, production web | Step 5 |
