# Step 2 — Game server (`game-server/`)

**Status:** `planned` (not started)  
**Depends on:** Step 1 acceptance criteria met  
**Unblocks:** Step 3

## Ready for development (gate)

- [ ] Step 1 exit notes filled; rules public API reviewed
- [ ] Hosting choice for local + staging documented below
- [ ] Auth approach for room join (dev token vs FastAPI-issued) chosen for this step
- [ ] Protocol draft (intent + event names) written in this file or linked
- [ ] Checklist complete before coding

## Goal

Run an **authoritative Colyseus duel room** that loads `packages/rules`, accepts two players, applies intents, and broadcasts per-player views/events. Playable via a thin scripted client or Colyseus playground — **not** the Expo UI yet.

## In scope

- Colyseus project scaffold in `game-server/`.
- `DuelRoom` (name TBD) wiring: onJoin seat assignment, onMessage intent handling, onLeave.
- Integration with `packages/rules` (`applyIntent`, player views).
- Dev-only auth: shared secret or unsigned dev user id (production token in Step 4).
- Logging of match start/end; in-memory match id.
- Dockerfile or start script for local always-on process.
- Basic automated test: two mock clients play a scripted line to terminal state.

## Out of scope

- Expo app.
- Ranked MMR, matchmaking queues, Redis multi-node (single process OK).
- Spectators.
- Full FastAPI writeback (optional stub callback OK; required in Step 4).
- Production hardening / rate limits beyond a simple per-message cap.

## Deliverables

| Artifact | Location |
|----------|----------|
| Colyseus app | `game-server/src/**` |
| Room implementation | e.g. `game-server/src/rooms/DuelRoom.ts` |
| Protocol types (shared or duplicated temporarily) | `game-server` and/or `packages/rules` |
| Dev run docs | `game-server/README.md` |
| Scripted two-client test | `game-server` test or script |

## Technical approach

1. Scaffold Colyseus TypeScript server; depend on `packages/rules` via workspace link.
2. On create/join: build initial rules state from two fixed test decks (from Step 1 subset).
3. Message handler: parse intent → `applyIntent` → send `view` or `events` to each client; reject illegal intents with error code.
4. Seat model: `seat0` / `seat1`; refuse a third player for v1.
5. Keep room CPU-bound only; no DB calls inside intent apply path.

### Protocol draft (refine at gate)

**Client → server**

- `intent` — body matches rules intent union
- `ping` — optional keepalive

**Server → client**

- `welcome` — `{ matchId, seat, view }`
- `events` — ordered list from last apply
- `view` — authoritative private view for that seat (or diff + version)
- `error` — `{ code, message }` for illegal/unknown
- `match_over` — `{ result }`

Version field: `protocolVersion: 1`.

## Acceptance criteria

- [ ] Two local clients can complete a duel to `match_over` using only server-validated intents.
- [ ] Illegal intent does not mutate authoritative state.
- [ ] Each client only receives its own private view (no opponent hand).
- [ ] `game-server` README: install, run, run tests.
- [ ] Server process does not import Expo/React Native.

## Risks

| Risk | Mitigation |
|------|------------|
| Leaking full state over WS | Only send `getViewForPlayer`; add regression test |
| Tight coupling to Step 3 UI | Keep protocol document stable; fixtures for messages |
| Workspace packaging pain | Document resolution in README; pin Node version |

## Open questions

- Colyseus version / `@colyseus/sdk` client pin?
- Fixed test decks only, or accept deck list in `onCreate` options now?

## Exit notes (fill when step completes)

- Final protocol summary / link:
- Room name registered:
- Known limitations:
