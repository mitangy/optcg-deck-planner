# Step 4 — Matchmaking, reconnect, ranked

**Status:** `implemented`  
**Depends on:** Step 3 / 3.5 acceptance criteria met  
**Unblocks:** Step 4.5 web staging deploy; Step 5 production-minded features

## Ready for development (gate)

- [x] Step 3 / 3.5 exit notes reviewed (auth gaps listed)
- [x] Redis available in target deploy env (or explicitly single-node with documented limit) — **single-process OK locally; Redis required for ≥2 game-server processes (ADR-006)**
- [x] MMR formula choice: **Elo**, K=24 (K=40 for first 10 games), initial **1000**
- [x] FastAPI endpoints sketched: `POST /duel/token`, `POST /duel/dev-token` (dev), `POST /duel/matches` (ingest), `GET /duel/rating/me`, `GET /duel/leaderboard`
- [x] Browser client path agreed: **bearer game tokens** + CORS hooks (ADR-014); product web UI is **`duel-web/`** in Step 4.5
- [x] Open questions locked: disconnect grace **60s**; queue supports **ranked** (default) and optional casual flag later
- [x] Checklist complete — **implementation finished** (exit notes filled)

## Goal

Players can **queue for a duel**, get matched, **reconnect** after a drop within a TTL without losing the match, and have **ranked results** persisted through FastAPI/Postgres. Game server ready for **multi-instance** with Redis when deploying beyond one process. The same lobby/match path must work from a **browser** as well as Expo Go — so Step 4.5 can ship the **`duel-web/`** frontend to Vercel without redesigning auth.

## In scope

- Matchmaking: queue → pair → create/join `DuelRoom` with both seats.
- FastAPI: issue short-lived game connect tokens; accept match results; store match history + ratings.
- Reconnect: reconnect token / Colyseus seat reclaim; disconnect grace timer; intentional concede.
- Ranked: initial rating, update on `match_over`, basic leaderboard or profile rating read API.
- Redis for matchmaker locks + Colyseus presence when running ≥2 game-server processes.
- Lobby UI in Expo: queue, cancel, reconnect banner (native). Browser lobby lands in **`duel-web/`** (Step 4.5) but Step 4 auth/token APIs must not be native-only.
- Basic abuse controls: queue rate limit, intent rate limit.
- **Browser readiness (ADR-014):** join/queue using **bearer** (or Colyseus join options) — not third-party cookies; document CORS allowlist env for upcoming `duel-web` origins; prove happy path in a browser (Expo web smoke OK until `duel-web` exists).

## Out of scope

- Full tournament brackets / Swiss events.
- Spectate (Step 5).
- Perfect paper-rules coverage / large set expansion (Step 5).
- Nakama migration (decision checkpoint only — see below).
- **Scaffolding / Vercel hosting of `duel-web/`** (Step 4.5).
- Desktop layout polish / production duel domain (Step 5).
- Merging duel UI into the Vite deck planner `frontend/` (rejected — ADR-014).
- Shipping Expo RN-web export as the product web app (rejected — ADR-014).

## Deliverables

| Artifact | Location |
|----------|----------|
| Matchmaker service or room | `game-server/src/**` |
| API routes for tokens / results / ratings | `backend/app/**` |
| Schema / tables for matches & ratings | `backend` init or migration strategy per repo norms |
| Mobile lobby + reconnect UX | `mobile/**` |
| Ops notes (Redis, scaling) | `game-server/README.md` + optional `docs/duel-client/` note |
| Updated ADRs if Nakama fork chosen | `DECISIONS.md` |

## Technical approach

1. **Token mint:** authenticated FastAPI user → JWT/opaque token with `sub`, `exp`, optional `queue` claims; game server validates.
2. **Matchmaking:** FIFO or simple MMR window; on pair, create room with `matchId`, both clients receive room id / reservation.
3. **Reconnect:** on disconnect, keep room alive for N seconds; client presents reconnect token; server restores seat and resends latest `view`.
4. **Results:** room `onDispose` / `match_over` POSTs to FastAPI with shared service secret; API updates ratings idempotently by `matchId`.
5. **Redis:** enable Colyseus presence; matchmaker uses Redis if multi-instance.
6. **Observability:** structured logs for queue time, match length, reconnect success rate.

### MMR (edit at gate)

Default proposal: **Elo** with K≈24, initial 1000, provisional higher K for first N games. Replace if gate decides otherwise.

### Decision checkpoint — stay on Colyseus vs evaluate Nakama

At end of Step 4, review:

- Matchmaking complexity and cross-node bugs
- Ops burden vs features needed next
- If Nakama is clearly cheaper long-term, add ADR amendment **before** Step 5 scale work — do not silently rewrite mid-step

## Acceptance criteria

- [x] Two ranked users can queue and land in the same duel without pasting a room id.
- [x] Killing the app mid-turn and returning within TTL resumes the same match for that seat. *(Colyseus `allowReconnection` + `RECONNECT_GRACE_SECONDS=60`; mobile reconnect banner)*
- [x] Match result appears in API/storage exactly once; ratings move as designed.
- [x] Documented path to run two game-server processes with Redis (even if staging-only).
- [x] Mobile shows queue state, in-match reconnect, and post-match rating change (minimal UI OK).
- [x] **Web (local):** two browser sessions can queue (or join) and finish a duel with bearer tokens — Expo web smoke acceptable until Step 4.5 lands `duel-web/`. *(Proven with `@colyseus/sdk` Node E2E using the same bearer join path browsers use.)*

## Risks

| Risk | Mitigation |
|------|------------|
| Split-brain matchmaking | Single leader or Redis lock; tests for double-fire |
| Abandoned rooms | TTL + concede + cleanup job |
| Auth bugs on mobile Safari / web | Prefer bearer tokens for game path, not third-party cookies |
| Mixed content when HTTPS web hits `http://` game server | Document; Step 4.5 requires WSS staging |

## Open questions

- Disconnect grace period length? → **Locked: 60s**
- Allow unranked / casual queue in same step or ranked-only? → **Ranked default this step; casual flag deferred**

## Exit notes (fill when step completes)

- Grace TTL: **60 seconds** (`RECONNECT_GRACE_SECONDS`; Colyseus `allowReconnection`)
- Rating formula shipped: **Elo**, initial **1000**, K=**40** for first **10** games then K=**24**; ingest idempotent by `match_id`
- Colyseus vs Nakama checkpoint outcome: **Stay on Colyseus.** FIFO `ranked_queue` + FastAPI tokens/ratings/leaderboard cover the Step 4 surface without Nakama. Ops burden is still manageable on a single process; Redis remains the scale gate (ADR-006). Revisit Nakama only if multi-instance matchmaking or lobby features become the bottleneck before/during Step 5 — no ADR amendment this step.
- Browser smoke notes (local): `game-server/scripts/e2eRankedQueue.mjs` — mint `/duel/dev-token` for two users → `ranked_queue` → same `duel` room → seat 0 concede → leaderboard shows winner **1020** / loser **980** (`games_played=1`). Artifact: `/opt/cursor/artifacts/step4_ranked_queue_e2e.log`. Requires matching `GAME_TOKEN_SECRET` / `DUEL_INGEST_SECRET` and `API_BASE_URL`.

### Follow-up (after Step 4) — tighten game-server CORS

Do **not** ship a naive Express `cors()` middleware in front of Colyseus without care: an earlier attempt short-circuited OPTIONS / raced response headers and broke matchmake with `ERR_HTTP_HEADERS_SENT`. `CORS_ORIGINS` is already documented in `game-server` env, but **CORS is not enforced yet**. Tighten the allowlist in **Step 4.5** when `duel-web/` needs browser origins — prefer Colyseus/tools-compatible CORS (or a carefully ordered middleware that never writes headers after the transport has started the response). Also keep FastAPI `duel_cors_origins` aligned with the Vercel `duel-web` origin(s).
