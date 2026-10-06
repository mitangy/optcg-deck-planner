# Scaling duels

How the duel stack runs past one game-server process, and the steps to turn
each piece on. Everything here is off by default: with none of the new
settings, the stack behaves exactly as a single game server, a single API
worker and an in-memory API.

The capacity numbers behind this plan (2026-10-05): one game-server process on
Render Starter (0.5 CPU) holds about **400 concurrent matches**; the game
server's CPU is the limit, at about 4 ms per move.

## What changed in the code

| Piece | Change | Why |
|---|---|---|
| Game server outbox | Drains when a result is queued, at startup and when a retry falls due, instead of polling every 5 s | An idle server sends Postgres nothing, so Neon can scale to zero |
| Game server presence | Skips the heartbeat once the API already has an empty snapshot | Same: no writes while nobody plays |
| Game server sockets | permessage-deflate (threshold 512 B, no context takeover, level 1) | A board view is about 3 KB per seat per move and deflates about 3.5x |
| Game server pool | `REDIS_URL` + `PUBLIC_ADDRESS` share rooms and seat reservations across processes (Colyseus `RedisPresence` / `RedisDriver`) | Render has no sticky sessions: each process is its own service with its own address |
| Ranked queue | One queue room holds up to 5000 players | At 64 a second queue room opened and the two never paired |
| Progress saves | A closing room's last log carries `final: true` | Live turn snapshots can stay in Redis; only the last one must hit Postgres |
| Playmats | Seats send a signed `/duel/cosmetics/<id>/public/<sig>` link instead of a 450 KB data URL | Memory and bandwidth per match; the image is cached by the browser and CDN |
| `/health` | Adds `commit`, `processId`, `roomCount`, `ccu` | Blue/green waits on `commit`; `roomCount` shows when a pool has drained |
| Load test | `game-server/scripts/loadMatches.mjs` | Bot players over real decks; never point it at production |

## Environment variables

| Variable | Service | Meaning |
|---|---|---|
| `REDIS_URL` | game server | Turns on the pool. Each blue/green colour uses its own Redis database (`redis://host:6379/1`, `/2`) so a draining pool keeps its own rooms and queue |
| `PUBLIC_ADDRESS` | game server | This process's own public host (e.g. `optcg-gs-blue-1.onrender.com`). Required in production when `REDIS_URL` is set; the server refuses to start without it |
| `WS_COMPRESSION` | game server | `off` disables permessage-deflate (on by default) |
| `REDIS_URL` | API | Rate limits, presence and live progress shared across workers; also holds the pool pointer |
| `GAME_SERVER_URL` | API | Game server URL handed out with each duel token when no pool pointer is set |
| `COSMETIC_URL_SECRET` | API | Signs public playmat links (falls back to `SESSION_SECRET`) |
| `WEB_CONCURRENCY` | API | Uvicorn workers. Keep `1` on Starter (512 MB); raise only with Redis set, since rate limits and presence are per-process without it |

## Rollout, in order

Each step is independently useful and reversible. The ones marked **paid**
change a plan and need Miko's go-ahead.

1. **Merge the code.** No settings change. The outbox and presence fixes alone
   let Neon sleep when nobody is playing, which is what keeps the free plan's
   compute-hours from running out mid-month.
2. **Game server Starter to Standard (paid).** One process, 1 CPU and 2 GB:
   roughly 800 concurrent matches. No Redis needed.
3. **Redis (paid).** Render Key Value in the same region. Set `REDIS_URL` on the
   API, then on the game server with `PUBLIC_ADDRESS`. Nothing else changes
   while there is one game server.
4. **A pool of game servers (paid).** Create `optcg-gs-blue-1..N` as separate
   Render web services from this repo (same build and start commands as
   `optcg-game-server`), each with `REDIS_URL=redis://…/1` and its own
   `PUBLIC_ADDRESS`. Any process can take a matchmaking request; the client's
   socket then goes straight to the process holding its room. Each process
   holds about 800 matches on Standard, so 5 processes cover about 4000.
5. **Blue/green deploys.** Create the green pool the same way with
   `redis://…/2`. Turn off auto-deploy on all `gs-*` services, set the repo
   secrets and variables listed at the top of
   `.github/workflows/game-server-blue-green.yml`, and run that workflow with
   the idle colour. It refuses to deploy a pool that still has rooms, waits
   until every process reports the new commit on `/health`, then flips the
   API's pointer (`PUT /duel/admin/game-server-pool`). New games start on the
   new pool; running games finish where they are.
6. **Neon Launch (paid)** once traffic keeps the database awake most of the
   day anyway, and **Vercel Pro** if the app becomes commercial (Hobby terms).

## Known limits

- The per-account open-room cap (`liveRoomsByCreator`) is per process, so in a
  pool of N processes an account can hold up to N times the cap.
- A friend invite carries a room id. If the pool pointer flips between the
  invite and the join, the friend's client looks on the new pool and gets
  "room not found"; re-inviting fixes it.
- The ranked queue lives in one room on one process. That is fine into the
  thousands of queued players, but that process does all pairing.

## Load testing

```bash
# Terminal 1: a server capped like Render Starter (needs cgroup v1 or a VM).
cd game-server && PORT=2567 npx tsx src/index.ts
# Terminal 2: 400 matches at about human pace.
DECKS=decks.json MATCHES=400 THINK_MS=5000 node game-server/scripts/loadMatches.mjs
```

Pass several servers in `GS_URL` (comma separated) to exercise a local pool:
each game is created on one process and joined through the next.
