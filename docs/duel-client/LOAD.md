# Load notes (Step 5)

Lightweight soak against a local or staging Colyseus game-server.

## Script

```bash
# from repo root, with game-server running on :2567
node game-server/scripts/loadSpectators.mjs
```

Env:

| Variable | Default | Purpose |
|----------|---------|---------|
| `GS_URL` | `http://127.0.0.1:2567` | Game server |
| `PLAYERS` | `2` | Seeded duel creators (fixed) |
| `SPECTATORS` | `8` | Concurrent spectator joins (matches `MAX_SPECTATORS`) |
| `HOLD_MS` | `5000` | How long to hold connections |

## Observed (local agent VM)

Recorded during Step 5 implementation:

| Metric | Value |
|--------|-------|
| Host | local `game-server` (`npm run start -w @optcg/game-server`) |
| Players | 2 (create + join) |
| Spectators | 8 concurrent (`spectatorsOk: 8`, `elapsedMs: ~70`) |
| Cap check | 9th join fails (`room is locked` / `spectatorsFail: 1`) |
| Result | All spectators received `welcome` with `role: spectator` and empty `you.hand` |
| Notes | Free Render staging cold-starts; prefer local for soak. Cap is `MAX_SPECTATORS=8` per room — raise carefully. |

Re-run and paste fresh numbers into Step 5 exit notes when staging soak is available.
