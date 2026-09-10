# Step 2 — Game server (`game-server/`)

**Status:** `plan ready` (not implemented)  
**Depends on:** Step 1 acceptance criteria met (**done** — `@optcg/rules` on `main`)  
**Unblocks:** Step 3  
**Branch for implementation:** prefer `cursor/duel-game-server-afeb`

## Ready for development (gate)

| Gate item | Decision |
|-----------|----------|
| Step 1 exit / public API | Use frozen `@optcg/rules` exports: `createMatch`, `applyIntent`, `getPlayerView`, `listLegalIntents`, `skipMulligans`, `createSeededRng`, `buildTestDeck` (+ types). Note: view helper is **`getPlayerView`**, not `getViewForPlayer`. |
| Hosting (local + staging) | **Local:** single Node process on `0.0.0.0:2567` (Colyseus default). **Dockerfile** optional for parity. **Staging host:** deferred to Step 4; Step 2 proves local + CI only. |
| Auth for room join | **Dev auth only:** join options carry `devUserId` + optional `DEV_JOIN_SECRET` match. No FastAPI token validation in this step. Production tokens → Step 4. |
| Protocol draft | Locked below (`protocolVersion: 1`); message-based (not full `MatchState` Schema sync). |
| Card / deck source | **Fixed Step 1 test decks** by default (`leader_red_5k` + `buildTestDeck(20)`). Optional `onCreate` overrides for seed/decks (tests + playground). |
| Workspaces | Root **npm workspaces** link `packages/rules` ↔ `game-server`. |
| Colyseus pin | **`colyseus` ^0.18** + matching `@colyseus/sdk` / `@colyseus/testing` (pin exact minors at implement time). Node **≥ 20** (prefer 22 if 0.18 docs require it). |
| Owner / CI | Implementer of this step; CI = `npm test` from repo root (or `cd game-server && npm test`) plus rules package still green. |

- [x] Goal and acceptance criteria match product intent (authoritative room, no Expo yet)
- [x] Step 1 API reviewed and named correctly in this plan
- [x] Hosting / auth / protocol / deck source decided for this step
- [x] Open questions resolved or explicitly deferred
- [x] Checklist complete — **implementation may start** on a separate branch

---

## Goal

Run an **authoritative Colyseus duel room** that loads `@optcg/rules`, seats two players, applies intents, and sends **per-seat private views** plus events. Playable via a **scripted two-client test** (and optionally Colyseus playground) — **not** the Expo UI yet.

Success looks like: Step 3 can connect with `@colyseus/sdk`, send `intent` messages shaped like rules `Intent`, and only ever render `welcome` / `view` / `events` / `error` / `match_over` — without importing rules on the phone for legality.

---

## Decisions locked

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Transport | Colyseus WebSocket room | ADR-003 |
| Authority | Server holds `MatchState`; clients never apply rules as truth | ADR-007 |
| Sync model | **Custom messages only** for duel payload; do **not** put hand/Life/deck into Colyseus Schema shared state | Hidden-info TCG; Schema would leak or force awkward filters |
| Public Schema (optional) | Minimal lobby fields OK: `matchId`, `seatsFilled`, `phase`, `activeSeat`, `winner` — never private zones | Enough for monitors/playground without privacy bugs |
| Room name | `"duel"` | Stable for Step 3 |
| Seats | `0` / `1` only; third join rejected | 1v1 v1 |
| Match start | When both seats filled → `createMatch` (or create on room create and wait); then send each seat `welcome` | Clear lifecycle |
| Mulligan in tests | Scripted clients may call `skipMulligans` path via room option `autoSkipMulligan: true` (default **true** for Step 2 scripts); real mulligan intents still supported | Faster CI; Step 3 can turn off |
| RNG | One `createSeededRng(seed)` per match, owned by the room | Deterministic replays |
| Illegal intents | `applyIntent` `ok: false` → `error` to that client only; state unchanged | Acceptance criterion |
| Rate limit | Simple per-seat cap (e.g. 20 intents / second); drop/error excess | Cheap abuse floor |
| Redis | **Not** in Step 2 | ADR-006 |
| FastAPI writeback | Optional log-only stub; no required HTTP | Step 4 |
| Expo / RN | Zero imports | Acceptance criterion |

---

## In scope

- Root npm workspaces + `game-server` Colyseus TypeScript scaffold.
- `DuelRoom` registered as `"duel"`.
- Join auth (dev secret + `devUserId`); seat assignment; refuse third player.
- Integrate `@optcg/rules`: create match, apply intent, broadcast views/events.
- Protocol `protocolVersion: 1` types (shared types file under `game-server` and/or thin re-export of rules `Intent` / `GameEvent`).
- Logging: match start / end / illegal intent (structured console is enough).
- `Dockerfile` **or** documented `npm start` (at least one always-on local path).
- Automated test: two mock clients (`@colyseus/testing` or SDK) drive a scripted line (or random legal intents) to `match_over`.
- Privacy regression test: opponent hand ids / Life faces never appear in the other seat’s messages.
- Update `game-server/README.md` (install, run, test, env vars).

## Out of scope

- Expo app (`mobile/`).
- Ranked MMR, matchmaking queues, Redis multi-node.
- Spectators.
- Production FastAPI game tokens / JWT validation.
- Production hardening beyond a simple intent rate cap.
- Real catalog decks / card art.
- Changing rules engine behavior (bugfixes only if Step 2 is blocked).

---

## Deliverables

| Artifact | Location |
|----------|----------|
| Root workspace | `package.json` (workspaces) |
| Colyseus app | `game-server/src/**` |
| Room | `game-server/src/rooms/DuelRoom.ts` |
| Protocol types / helpers | `game-server/src/protocol.ts` (and tests) |
| Dev run docs | `game-server/README.md` |
| Two-client test | `game-server/src/**/*.test.ts` or `scripts/` |
| Optional Docker | `game-server/Dockerfile` |

---

## Protocol (`protocolVersion: 1`)

All client↔server duel traffic uses Colyseus **room messages** (string type + JSON-serializable body). Bump `protocolVersion` only on breaking changes.

### Join options (`joinOrCreate` / `join`)

```ts
type DuelJoinOptions = {
  protocolVersion: 1;
  devUserId: string;           // required in Step 2
  // Optional; if DEV_JOIN_SECRET is set on server, must match
  // secret?: string;
  preferredSeat?: 0 | 1;       // hint only; server assigns
};
```

### Create options (`create` / `joinOrCreate` room options)

```ts
type DuelCreateOptions = {
  protocolVersion: 1;
  seed?: number;                 // default: time-derived or fixed for tests
  autoSkipMulligan?: boolean;    // default true for Step 2
  // Optional overrides; omit → Step 1 buildTestDeck(20) + leader_red_5k both seats
  players?: [
    { leaderId: string; deck: string[] },
    { leaderId: string; deck: string[] },
  ];
};
```

### Client → server

| Type | Body | Notes |
|------|------|-------|
| `intent` | `{ protocolVersion: 1; intent: Intent }` | `Intent` = `@optcg/rules` union as shipped in Step 1 |
| `ping` | `{ t?: number }` | Optional keepalive; server may `pong` |

**Step 1 intent types (authoritative — do not invent aliases):**

```ts
type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterId?: string }
  | { type: "give_don"; donId: string; targetId: string }
  | { type: "declare_attack"; attackerId: string; target: AttackTarget }
  | { type: "declare_block"; blockerId: string }
  | { type: "pass_block" }
  | { type: "counter_from_hand"; handIndex: number }
  | { type: "counter_event"; handIndex: number }
  | { type: "pass_counter" }
  | { type: "resolve_trigger"; accept: boolean }
  | { type: "end_turn" };
```

### Server → client

| Type | Body | Notes |
|------|------|-------|
| `welcome` | `{ protocolVersion: 1; matchId: string; seat: 0\|1; view: PlayerView }` | Sent once when match is ready for that seat |
| `events` | `{ protocolVersion: 1; events: GameEvent[] }` | Ordered events from the last successful apply (and setup transitions if useful) |
| `view` | `{ protocolVersion: 1; view: PlayerView }` | Full private view for **that** seat after each successful apply (and after welcome) |
| `error` | `{ protocolVersion: 1; code: string; message: string }` | Illegal / unknown / rate limit / wrong seat |
| `match_over` | `{ protocolVersion: 1; result: { winner: 0\|1; reason: string } }` | Also reflected in final `view` |
| `pong` | `{ t?: number }` | Optional |

`PlayerView` / `GameEvent` are whatever `@optcg/rules` `getPlayerView` / apply pipeline already produce. **Do not** send raw `MatchState`.

### Error codes (initial set)

| Code | Meaning |
|------|---------|
| `illegal_intent` | `applyIntent` rejected |
| `not_your_turn` / wrong actor | Seat cannot act (may collapse into `illegal_intent` if rules already encode this) |
| `match_not_ready` | Intent before both seats / match created |
| `match_over` | Intent after winner set |
| `bad_protocol` | Missing/unsupported `protocolVersion` or malformed body |
| `rate_limited` | Too many intents |
| `unauthorized` | Dev secret / missing `devUserId` |
| `room_full` | Third player |

### Privacy rules (hard)

A message to seat \(S\) must never include:

- Opponent hand card `defId` / instance ids (only `handCount`)
- Opponent Life card faces
- Either player’s main-deck or DON!! deck **order**
- Full `MatchState`

Regression test: capture both seats’ `view` payloads after a known deal and assert absence of the other seat’s hand `defId`s.

---

## Technical approach

1. Add root `package.json` with `"workspaces": ["packages/*", "game-server"]` (keep `frontend/` out unless we deliberately want it — **exclude frontend** to avoid coupling Vite app to duel Node pin).
2. Scaffold `game-server` with Colyseus 0.16–0.18 app layout (`src/index.ts`, `src/app.config.ts`, `src/rooms/DuelRoom.ts`). Prefer official `create colyseus-app` patterns adapted into existing folder.
3. Depend on `@optcg/rules` via workspace (`"*"` or `file:`).
4. `DuelRoom` lifecycle:
   - `onCreate`: store options (seed, decks, autoSkipMulligan); do not start match until 2 players **or** start empty and wait.
   - `onAuth` / join gate: require `devUserId`; check `DEV_JOIN_SECRET` if set.
   - `onJoin`: assign free seat; when both seated → `createMatch` → optional `skipMulligans` → send `welcome`+`view` to each.
   - `onMessage("intent")`: parse → `applyIntent` with room RNG + seat → on success, send `events`+`view` to **each** seat (each gets its own `getPlayerView`); if `winner` set → `match_over`.
   - `onLeave`: for Step 2, allow room dispose when empty; no reconnect (Step 4).
5. Keep intent path **CPU-only** — no DB/HTTP inside `applyIntent`.
6. Tests with `@colyseus/testing` or two in-process SDK clients.

### Room CPU path (pseudocode)

```ts
const result = applyIntent(match, intent, { seat, rng });
if (!result.ok) {
  this.send(client, "error", { protocolVersion: 1, ...result.error });
  return;
}
match = result.state;
for (const [seat, client] of seatedClients) {
  const view = getPlayerView(match, seat);
  this.send(client, "events", { protocolVersion: 1, events: result.events });
  this.send(client, "view", { protocolVersion: 1, view });
}
if (match.winner != null) {
  // broadcast match_over
}
```

---

## Package / repo layout

```
package.json                 # workspaces: packages/*, game-server
game-server/
  package.json
  tsconfig.json
  vitest.config.ts           # or colyseus testing runner
  README.md
  Dockerfile                 # optional
  src/
    index.ts
    app.config.ts
    env.ts
    protocol.ts              # message types + narrow parsers
    rooms/
      DuelRoom.ts
    __tests__/
      duelRoom.scripted.test.ts
      privacy.test.ts
packages/rules/              # existing (unchanged API)
```

### Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `2567` | Bind port (`0.0.0.0`) |
| `DEV_JOIN_SECRET` | unset | If set, join must supply matching secret |
| `LOG_LEVEL` | `info` | Optional |

### npm scripts (`game-server`)

| Script | Purpose |
|--------|---------|
| `start` / `dev` | Run Colyseus with reload |
| `test` | Room + privacy tests |
| `typecheck` | `tsc --noEmit` |

---

## Implementation sequence

1. Root workspaces + empty Colyseus scaffold; prove `@optcg/rules` import from `game-server`.
2. `protocol.ts` parsers + TypeScript types aligned to rules `Intent`.
3. `DuelRoom` seat/auth/createMatch/`welcome`.
4. Intent handler + per-seat `view`/`events`/`error`/`match_over`.
5. Scripted two-client test to terminal state; privacy test.
6. README + optional Dockerfile; mark exit notes when green.

---

## Test plan

| Case | Expect |
|------|--------|
| Two clients join | Seats 0 and 1; both receive `welcome` with distinct `seat` |
| Third client | Rejected (`room_full` / join fail) |
| Legal scripted intents | State advances; both get `view`/`events` |
| Illegal intent | `error`; re-fetch/`view` unchanged for both |
| Privacy | Seat 0 view has no seat 1 hand `defId`s |
| Match end | `match_over` + winner/reason; further intents error |
| Auto mulligan | With default option, phase leaves mulligan without client mulligan messages |
| No Expo import | `game-server` package.json / lockfile free of RN/Expo |

Manual (optional): Colyseus playground or a tiny Node script joining twice on localhost.

---

## Acceptance criteria

- [ ] Two local clients can complete a duel to `match_over` using only server-validated intents
- [ ] Illegal intent does not mutate authoritative state
- [ ] Each client only receives its own private view (no opponent hand)
- [ ] `game-server` README: install, run, test, env
- [ ] Server process does not import Expo/React Native
- [ ] Root workspace resolves `@optcg/rules` without publishing to npm
- [ ] `protocolVersion: 1` documented and present on messages
- [ ] Exit notes filled; status → `implemented`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Leaking full state over WS / Schema | Message-only private views; privacy test |
| Colyseus 0.18 API churn / Node pin | Pin versions in package.json; document Node in README |
| Workspace + `frontend` Node conflict | Do **not** put `frontend` in the same workspace root |
| Tight coupling to Step 3 UI | Freeze protocol table; fixture golden messages optional |
| Long random games in CI | Prefer short scripted line; optional capped random policy |

---

## Explicitly deferred

- Redis presence / multi-process (Step 4)
- FastAPI-issued game JWT (Step 4)
- Reconnect / seat reclaim (Step 4)
- Matchmaking lobby room (Step 4)
- Spectators (Step 5)
- Expo board (Step 3)
- Real card catalog (Step 5 + legal)

---

## Open questions (none blocking)

| Topic | Disposition |
|-------|-------------|
| Exact Colyseus patch | Pin at implement time within ^0.18 |
| Playground enabled in prod image | Dev-only; fine either way for Step 2 |
| Whether to send `legalIntents` inside every `view` | **Yes** — already on `getPlayerView`; keeps Step 3 dumb |

---

## Exit notes (fill when step completes)

- Final protocol summary / link:
- Room name registered:
- Colyseus + Node versions pinned:
- Known limitations:
- Status:
