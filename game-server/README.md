# game-server — OPTCG duel runtime (Colyseus)

Authoritative Colyseus match server for Step 2. Loads `@optcg/rules`, seats two players in a `duel` room, and speaks **message-based** `protocolVersion: 1` (private views — no full `MatchState` in Schema).

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
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` |
| `NODE_ENV` | unset | Set `production` to disable playground/monitor |

## Protocol (v1)

**Create / joinOrCreate options**

```ts
{ protocolVersion: 1, seed?: number, autoSkipMulligan?: boolean /* default true */ }
```

**Join options**

```ts
{ protocolVersion: 1, devUserId: string, secret?: string, preferredSeat?: 0 | 1 }
```

**Client → server:** `intent` `{ protocolVersion: 1, intent }`, `ping` `{ t? }`

**Server → client:** `welcome`, `view`, `events`, `error`, `match_over`, `pong`

Intents and private views are produced by `@optcg/rules` (`getPlayerView`). Opponent hand / life faces / deck order are never sent.

## Tests

```bash
npm run test:game-server
# or from this package
npm test
```

## Docker

```bash
# from repo root
docker build -f game-server/Dockerfile -t optcg-game-server .
docker run --rm -p 2567:2567 optcg-game-server
```

## See also

- [Step 2 plan](../docs/duel-client/steps/02-game-server.md)
- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [ADR-003 / ADR-011](../docs/duel-client/DECISIONS.md)
