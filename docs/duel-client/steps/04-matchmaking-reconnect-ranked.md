# Step 4 — Matchmaking, reconnect, ranked

**Status:** `planned` (not started)  
**Depends on:** Step 3 / 3.5 acceptance criteria met  
**Unblocks:** Step 4.5 web staging deploy; Step 5 production-minded features

## Ready for development (gate)

- [ ] Step 3 / 3.5 exit notes reviewed (auth gaps listed)
- [ ] Redis available in target deploy env (or explicitly single-node with documented limit)
- [ ] MMR formula choice (simple Elo vs Glicko-lite) recorded below
- [ ] FastAPI endpoints sketched (token mint, match result ingest, rating read)
- [ ] Browser client path agreed: **bearer game tokens** + CORS hooks (ADR-014); full Vercel URL is Step 4.5
- [ ] Checklist complete before coding

## Goal

Players can **queue for a duel**, get matched, **reconnect** after a drop within a TTL without losing the match, and have **ranked results** persisted through FastAPI/Postgres. Game server ready for **multi-instance** with Redis when deploying beyond one process. The same lobby/match path must work from a **browser** (`expo start --web` / local web) as well as Expo Go — so Step 4.5 can point a Vercel URL at staging without redesigning auth.

## In scope

- Matchmaking: queue → pair → create/join `DuelRoom` with both seats.
- FastAPI: issue short-lived game connect tokens; accept match results; store match history + ratings.
- Reconnect: reconnect token / Colyseus seat reclaim; disconnect grace timer; intentional concede.
- Ranked: initial rating, update on `match_over`, basic leaderboard or profile rating read API.
- Redis for matchmaker locks + Colyseus presence when running ≥2 game-server processes.
- Lobby UI in Expo: queue, cancel, reconnect banner (works on **iOS and web**).
- Basic abuse controls: queue rate limit, intent rate limit.
- **Browser readiness (ADR-014):** join/queue using **bearer** (or Colyseus join options) — not third-party cookies; document CORS allowlist env for upcoming web origins; prove happy path with local `npm run web` against staging/local game-server.

## Out of scope

- Full tournament brackets / Swiss events.
- Spectate (Step 5).
- Perfect paper-rules coverage / large set expansion (Step 5).
- Nakama migration (decision checkpoint only — see below).
- **Vercel hosting of the Expo web export** (Step 4.5).
- Desktop layout polish / production duel domain (Step 5).
- Merging duel UI into the Vite deck planner (rejected — ADR-014).

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

- [ ] Two ranked users can queue and land in the same duel without pasting a room id.
- [ ] Killing the app mid-turn and returning within TTL resumes the same match for that seat.
- [ ] Match result appears in API/storage exactly once; ratings move as designed.
- [ ] Documented path to run two game-server processes with Redis (even if staging-only).
- [ ] Mobile shows queue state, in-match reconnect, and post-match rating change (minimal UI OK).
- [ ] **Web (local):** two browser tabs using `expo start --web` can queue (or join) and finish a duel with bearer tokens — no Expo Go required for this proof.

## Risks

| Risk | Mitigation |
|------|------------|
| Split-brain matchmaking | Single leader or Redis lock; tests for double-fire |
| Abandoned rooms | TTL + concede + cleanup job |
| Auth bugs on mobile Safari / web | Prefer bearer tokens for game path, not third-party cookies |
| Mixed content when someone points HTTPS web at `http://` game server | Document; Step 4.5 requires WSS staging |

## Open questions

- Disconnect grace period length?
- Allow unranked / casual queue in same step or ranked-only?

## Exit notes (fill when step completes)

- Grace TTL:
- Rating formula shipped:
- Colyseus vs Nakama checkpoint outcome:
- Browser smoke notes (local web):
