# Scaling duels

How the duel stack runs past one game-server process, and the steps to turn
each piece on. Everything here is off by default: with none of the new
settings, the stack behaves exactly as a single game server, a single API
worker and an in-memory API.

The capacity numbers behind this plan (2026-10-05): one game-server process on
Render Starter (0.5 CPU) holds about **400 concurrent matches**; the game
server's CPU is the limit, at about 4 ms per move. That was measured before
the rules view cache, which removes most of the per-move view cost, so the real
figure is now higher; rerun the load test below before sizing anything on it.

## Current tiers (checked 2026-10-19)

| Service | Plan | Notes |
|---|---|---|
| `optcg-game-server` (Render) | Starter, 0.5 CPU / 512 MB, 1 instance | PR previews on: each open PR gets its own Starter copy |
| `optcg-api` (Render) | Starter, 0.5 CPU / 512 MB, 1 instance | PR previews on, same as above. Start command is set in the dashboard and has no `--workers` |
| `optcg-analyst` (Render) | Free | Sleeps when idle |
| Render Key Value | none | Needed for steps 3 to 5 |
| Neon `optcg-deck-planner` | Paid (the API reports `build`), autoscaling 0.25 to 2 CU, default suspend | The billing period restarted 2026-10-17, when the plan changed |
| Vercel (`optcg-duel-web`, `optcg-deck-planner`) | Pro since 2026-10-09 | Builds are most of the bill; traffic and functions are about $0 |

The Render services are configured in the dashboard, not from `render.yaml`, so
a start command or env var in `render.yaml` only takes effect once it is copied
to the dashboard.

## What changed in the code

| Piece | Change | Why |
|---|---|---|
| Game server outbox | Drains when a result is queued, at startup and when a retry falls due, instead of polling every 5 s | An idle server sends Postgres nothing, so Neon can scale to zero |
| Game server presence | Skips the heartbeat once the API already has an empty snapshot | Same: no writes while nobody plays |
| Game server sockets | permessage-deflate (threshold 512 B, no context takeover, level 1) | A board view is about 3 KB per seat per move and deflates about 3.5x |
| Game server pool | `REDIS_URL` + `PUBLIC_ADDRESS` share rooms and seat reservations across processes (Colyseus `RedisPresence` / `RedisDriver`) | Render has no sticky sessions: each process is its own service with its own address |
| Ranked queue | One queue room holds up to 5000 players | At 64 a second queue room opened and the two never paired |
| Progress saves | A closing room's last log carries `closed: true` (from #476) | Live turn snapshots can stay in Redis; only the last one must hit Postgres |
| Playmats | Seats send a signed `/duel/cosmetics/<id>/public/<sig>` link instead of a 450 KB data URL | Memory and bandwidth per match; the image is cached by the browser and CDN |
| `/health` | Adds `commit`, `processId`, `roomCount`, `ccu` | Blue/green waits on `commit`; `roomCount` shows when a pool has drained |
| API on Redis | Named rate limits, friends presence and live progress snapshots live in Redis when `REDIS_URL` is set; only a game's result and its `closed` log are written to Postgres | Several API workers share limits, and live games stop writing Postgres every turn |
| Game server address | `/duel/token` (and the dev and guest tokens) return `game_server_url`: the pool pointer in Redis (`duel:gs:current`), else `GAME_SERVER_URL`, else null. duel-web connects there and reconnects to the server a match started on | New games can move to another pool without rebuilding the front end |
| Pool pointer | `GET`/`PUT /duel/admin/game-server-pool` with the `X-Catalog-Token` header, body `{"url": "https://…"}` (null clears it) | The blue/green workflow flips it |
| Public playmat links | `GET /duel/cosmetics/<id>/public/<sig>` serves an upload without a session; `sig` is an HMAC of the id. Cosmetics responses carry `public_path` | Seats share a link instead of the image |
| API startup | Migrations run under a Postgres advisory lock | Several workers can start at once |
| API background jobs | Catalog sync, tournament sync and the live-log sweep each take a non-blocking Postgres advisory lock for the length of a run | With `WEB_CONCURRENCY` above 1 only one worker runs a job at a time (SQLite keeps its in-process guard) |
| Open-room cap | With `REDIS_URL`, each account's open-room count (`duel:rooms:<uid>`, 6 h expiry refreshed on every claim) lives in Redis | The cap holds across a pool instead of per process; a crashed process's count expires on its own |
| Friend invites and presence | Presence entries carry the game server's `POOL_URL`; invites carry the pool the room was opened on | A friend joins on the pool the room is on, even if the pointer flipped since the invite |
| Live-log sweep | With `REDIS_URL`, the API saves live game logs that have had no update for 30 minutes to Postgres as closed rows, then drops the Redis copy | A game-server crash no longer loses unfinished logs after 6 h |
| Load test | `game-server/scripts/loadMatches.mjs` | Bot players over real decks; never point it at production |

## Environment variables

| Variable | Service | Meaning |
|---|---|---|
| `REDIS_URL` | game server | Turns on the pool. Each blue/green colour uses its own Redis database (`redis://host:6379/1`, `/2`) so a draining pool keeps its own rooms and queue |
| `PUBLIC_ADDRESS` | game server | This process's own public host (e.g. `optcg-gs-blue-1.onrender.com`). Required in production when `REDIS_URL` is set; the server refuses to start without it |
| `POOL_URL` | game server | The URL clients use for this process's pool (the value of `GS_POOL_URL_<COLOUR>` for the blue/green workflow). Sent with presence so invites and friends find a room after the pointer flips. Same rules as the pointer: https (http for localhost), no credentials or query. Unset: presence carries no URL |
| `WS_COMPRESSION` | game server | `off` disables permessage-deflate (on by default) |
| `REDIS_URL` | API | Rate limits, presence and live progress shared across workers; also holds the pool pointer |
| `GAME_SERVER_URL` | API | Game server URL handed out with each duel token when no pool pointer is set |
| `COSMETIC_URL_SECRET` | API | Signs public playmat links (falls back to `SESSION_SECRET`) |
| `WEB_CONCURRENCY` | API | Uvicorn workers. Keep `1` on Starter (512 MB); raise only with Redis set, since rate limits and presence are per-process without it. Only read when the dashboard start command ends in `--workers ${WEB_CONCURRENCY:-1}` (it doesn't yet) |

## Rollout, in order

Each step is independently useful and reversible. The ones marked **paid**
change a plan and need Miko's go-ahead.

1. **Merge the code.** No settings change. The outbox and presence fixes alone
   let Neon sleep when nobody is playing, so its compute is billed only while
   people play. Done 2026-10-19 (#389).
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
   Leave PR previews off on these services, or every PR copies the pool.
5. **Blue/green deploys.** Create the green pool the same way with
   `redis://…/2`. Turn off auto-deploy on all `gs-*` services, set the repo
   secrets and variables listed at the top of
   `.github/workflows/game-server-blue-green.yml`, and run that workflow with
   the idle colour. It refuses to deploy a pool that still has rooms, waits
   until every process reports the new commit on `/health`, then flips the
   API's pointer (`PUT /duel/admin/game-server-pool`). New games start on the
   new pool; running games finish where they are.
6. **Neon and Vercel.** Both are already on paid plans (see Current tiers).
   Neon's 2 CU autoscaling ceiling is the next limit to watch: raise it if the
   database sits at 2 CU during busy hours.

## Known limits

- Public playmat links are bearer URLs: anyone given one can load that image
  until it is deleted (cached copies outlive the delete). That is by design:
  opponents' browsers and the game server load it with no session. Rotating
  `COSMETIC_URL_SECRET` retires every link at once. The route is limited to
  600 requests a minute per address (shared across API workers with Redis),
  and the image is cached for a year, so a cache or CDN in front still takes
  most of the load at scale.
- The ranked queue lives in one room on one process. That is fine into the
  thousands of queued players, but that process does all pairing.
- An invite names the pool its room is on only if the API had handed that
  pool's address out (the current assignment, `GAME_SERVER_URL`, or any address
  the pointer has named). A pool the API never heard of is dropped from the
  invite, and the friend's client then uses the current pool, as before.
- The catalog sync status (`running`, `last_result`) is kept in memory by the
  worker that ran it, so with several workers a status poll can hit a worker
  that did not. Only one worker runs the sync at a time.

## Load testing

```bash
# Terminal 1: a server capped like Render Starter (needs cgroup v1 or a VM).
cd game-server && PORT=2567 npx tsx src/index.ts
# Terminal 2: 400 matches at about human pace.
DECKS=decks.json MATCHES=400 THINK_MS=5000 node game-server/scripts/loadMatches.mjs
```

Pass several servers in `GS_URL` (comma separated) to exercise a local pool:
each game is created on one process and joined through the next.
