# game-server — OPTCG duel runtime (Colyseus)

Authoritative Colyseus match server for Steps 2–4. Loads `@optcg/rules`, seats two players in a `duel` room, runs a **ranked_queue** matchmaker, and speaks **message-based** `protocolVersion: 2` (private views — no full `MatchState` in Schema).

**Deploy pin:** Render `optcg-game-server` tracks `cursor/duel-web-deploy-afeb`. Keep that branch fast-forwarded to `main` whenever duel-web protocol/defs change — a stale pin (e.g. GS on v1 while Vercel serves v2) makes create/join fail with a misleading **`seat reservation expired`**.

## Requirements

- Node.js ≥ 22
- npm workspaces (install from repo root)

## Install

```bash
cd /path/to/repo
npm install
```

## Run

```bash
# from repo root
npm run dev:game-server
# or
npm run start:game-server
```

Listens on `0.0.0.0:$PORT` (default **2567**).

Dev tools (non-production):

- Playground: `http://localhost:2567/`
- Monitor: `http://localhost:2567/monitor`
- Health: `http://localhost:2567/health`

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `2567` | HTTP / WebSocket bind port |
| `DEV_JOIN_SECRET` | unset | If set, join options must include matching `secret` |
| `GAME_TOKEN_SECRET` | `SESSION_SECRET` or weak default | HMAC secret shared with FastAPI for `gameToken` |
| `REQUIRE_GAME_TOKEN` | `false` | When `true`, reject `devUserId`-only joins |
| `API_BASE_URL` | `http://localhost:8000` | FastAPI base for match result ingest |
| `DUEL_INGEST_SECRET` | `dev-duel-ingest` | Must match FastAPI `DUEL_INGEST_SECRET` |
| `RECONNECT_GRACE_SECONDS` | `60` | Seat reclaim window after drop |
| `CORS_ORIGINS` | localhost Expo + duel-web (`5174`) | Allowlist enforced via `matchMaker.controller.getCorsHeaders` (not Express `cors()`) |
| `REDIS_URL` | unset | When set, enable Colyseus presence for multi-instance (ops) |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` |
| `NODE_ENV` | unset | Set `production` to disable playground/monitor |

### Multi-instance / Redis

Single-process is fine for local and small staging. For **≥2 game-server processes**, set `REDIS_URL` and use Colyseus Redis presence (document in deploy notes). Matchmaker pairing is in-process FIFO today — sticky load balancing or a shared queue is required before horizontal matchmaking.

## Protocol (v1)

**Rooms:** `duel` (match), `ranked_queue` (matchmaker)

**Join options**

```ts
{
  protocolVersion: 2,
  gameToken?: string,       // preferred (FastAPI POST /duel/token or /duel/dev-token)
  devUserId?: string,       // local legacy when REQUIRE_GAME_TOKEN is false
  secret?: string,
  preferredSeat?: 0 | 1
}
```

**Matchmaker messages (server → client):** `queued`, `matched` `{ roomId, seat, ranked }`, `queue_cancelled`

**Duel client → server:** `intent`, `concede`, `sync`, `ping`

**Duel server → client:** `welcome`, `view`, `events`, `error`, `match_over`, `pong`

On disconnect mid-match, the seat is held for `RECONNECT_GRACE_SECONDS`; use the Colyseus SDK reconnection token to reclaim.

## Tests

```bash
npm run test:game-server
```

## See also

- [Step 4 plan](../docs/duel-client/steps/04-matchmaking-reconnect-ranked.md)
- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [rules README](../packages/rules/README.md)
