# Step 3 — Expo client board (`mobile/`)

**Status:** `plan ready` (not implemented)  
**Depends on:** Step 2 acceptance criteria met (**done** — `game-server` on `main`, `protocolVersion: 1`)  
**Unblocks:** Step 4  
**Branch for implementation:** prefer `cursor/duel-expo-client-afeb`

## Ready for development (gate)

| Gate item | Decision |
|-----------|----------|
| Step 2 protocol frozen | **Yes** — `protocolVersion: 1` in `game-server/src/protocol.ts`. Room name `"duel"`. Messages: client `intent` / `ping` / `sync`; server `welcome` / `view` / `events` / `error` / `match_over` / `pong`. |
| EAS / Expo scaffold | **Create Expo app now** in `mobile/` (TypeScript + Expo Router). First week targets **Expo Go** on a physical iPhone when deps allow; add EAS project id + `eas.json` stubs so a dev client is one command away if WS/native needs it. |
| Minimal board wireframe | Locked below (§ Board layout). Zones for Step 1 subset only. |
| Dev login path | **No FastAPI required for Step 3.** Local screen collects `devUserId` (default `mobile-dev`) + optional join secret; joins Colyseus with Step 2 join options. Real OAuth / game tokens → Step 4. |
| Join flow | **Create or paste room id** on one screen: `joinOrCreate("duel", …)` with optional `roomId` field for `joinById`. Show `matchId` / room id after connect for the second device. |
| Navigation | **Expo Router** (`mobile/app/`). |
| Workspaces | `mobile/` stays **outside** root npm workspaces (same isolation as `frontend/`). Own `package.json` / lockfile. |
| Rules on device | **Do not** import `@optcg/rules` for legality. Render `view` + present buttons from `view.legalIntents`. Wire types live in `mobile/src/net/protocol.ts` (copied/adapted from game-server). |
| Owner / CI | Implementer of this step; CI = `cd mobile && npm test` (adapter/unit) + `npx tsc --noEmit`. Device proof via README notes / screenshots when available. |

- [x] Goal and acceptance criteria match product intent (board + intents, no matchmaking yet)
- [x] Step 2 protocol reviewed and named correctly in this plan
- [x] EAS / board / auth / join / navigation decided for this step
- [x] Open questions resolved or explicitly deferred
- [x] Checklist complete — **implementation may start** on a separate branch

---

## Goal

Ship an **Expo iOS-first client** that connects to the Colyseus `duel` room, renders the player’s private view, and sends intents for the Step 1 placeholder card subset. A developer can finish a duel on a **physical iPhone** without a Mac (Expo Go or EAS development build), with a second player as another phone or the existing scripted/game-server test client.

Success looks like: the phone never decides legality; it only displays `view` / `events` / `error` / `match_over` and sends `intent` envelopes shaped like Step 2.

---

## Decisions locked

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Client stack | Expo (SDK current stable at implement time) + Expo Router + TypeScript | ADR-002 |
| Colyseus client | `@colyseus/sdk` ^0.18 matching game-server | ADR-003 / Step 2 pin |
| Authority | Board is a pure view of server payloads | ADR-007 |
| Auth (Step 3) | `devUserId` text field only; optional `DEV_JOIN_SECRET` | Matches Step 2; FastAPI later |
| Deck source | Server defaults (Step 1 test decks); client does not upload decks yet | Vertical slice |
| Mulligan UI | If `phase === "mulligan"`, show Keep / Mulligan from `legalIntents`; with server `autoSkipMulligan: true` (default), may skip straight to main | Server already defaults skip |
| Illegal intent UX | Banner/toast from `error` `{ code, message }`; clear selection; wait for next `view` | Acceptance |
| Optimistic UI | Selection highlights only; **no** local rules apply; reset selection on every `view` | Prevent desync |
| Shared package | Copy protocol types into mobile; do **not** add `mobile` to root workspaces | Avoid Expo vs Node workspace pain |
| Design | One game-table composition: opponent (top) → mid field → you (bottom); chrome for phase + actions | Not a dashboard |

---

## In scope

- Expo app scaffold under `mobile/` (Expo Router file routes).
- Screens:
  1. **Home / connect** — `devUserId`, server URL, optional secret, Create duel / Join by room id.
  2. **Duel board** — zones below; intent actions; error banner; match-over overlay.
- Colyseus adapter matching Step 2 protocol (`mobile/src/net/duelClient.ts` + `protocol.ts`).
- Board UI for subset zones (see § Board layout).
- Env: `EXPO_PUBLIC_GAME_SERVER_URL` (default `http://<lan-ip>:2567`).
- README: local run, LAN tips, Expo Go vs EAS, how to play vs game-server / second device.
- Lightweight automated tests for protocol adapter / message parsing (Jest or Vitest via Expo).
- `eas.json` stub (`development` / `preview` profiles) even if first proof uses Expo Go.

## Out of scope

- Polished animations / full card art CDN pipeline (text + colored placeholders OK).
- Matchmaking queue / ranked UI (Step 4).
- FastAPI sign-in, deck picker from planner, MMR display (Step 4).
- Android Play listing (Step 5); Android Expo Go smoke optional.
- App Store production submit.
- Importing `@optcg/rules` into the app bundle.
- Changing game-server protocol (bugfix only if Step 3 is blocked).

---

## Deliverables

| Artifact | Location |
|----------|----------|
| Expo app | `mobile/**` |
| Routes | `mobile/app/` (e.g. `index.tsx`, `duel.tsx`) |
| Duel client adapter | `mobile/src/net/duelClient.ts` |
| Wire types | `mobile/src/net/protocol.ts` |
| Board UI | `mobile/src/board/**` |
| README | `mobile/README.md` |
| EAS stub | `mobile/eas.json`, `app.json` / `app.config.ts` |
| Adapter tests | `mobile/src/**/*.test.ts` |

---

## Protocol consumption (`protocolVersion: 1`)

Authoritative copy: `game-server/src/protocol.ts` + Step 2 exit notes. Client must interoperate without renaming message types.

### Join / create

```ts
// joinOrCreate("duel", {
protocolVersion: 1,
devUserId: string,
secret?: string,          // if server DEV_JOIN_SECRET set
preferredSeat?: 0 | 1,
// create-side options (first client / createRoom):
seed?: number,
autoSkipMulligan?: boolean, // prefer true for first vertical slice
```

### Client → server

| Type | Body |
|------|------|
| `intent` | `{ protocolVersion: 1, intent: Intent }` |
| `ping` | `{ t?: number }` |
| `sync` | `{}` or `{ protocolVersion: 1 }` — request fresh `welcome`/`view` |

`Intent` shapes match `@optcg/rules` (server validates). Client should prefer sending objects from `view.legalIntents` as-is.

### Server → client

| Type | Body |
|------|------|
| `welcome` | `{ protocolVersion, matchId, seat, view }` |
| `view` | `{ protocolVersion, view }` |
| `events` | `{ protocolVersion, events }` |
| `error` | `{ protocolVersion, code, message }` |
| `match_over` | `{ protocolVersion, result: { winner, reason } }` |
| `pong` | `{ t? }` |

### PlayerView shape (from `@optcg/rules` `getPlayerView`)

Treat as opaque JSON except for these fields the board needs:

- `seat`, `activeSeat`, `phase`, `turnNumber`, `battle`, `pendingTrigger`, `winner`, `winReason`
- `you`: `leader`, `characters`, `stage`, `hand[{id,defId}]`, `lifeCount`, `donDeckCount`, `costArea`, `activeDonCount`, …
- `opponent`: `leader`, `characters`, `stage`, **`handCount`** (no `hand`), `lifeCount`, `donDeckCount`, `costAreaCount`, …
- **`legalIntents`**: `Intent[]` — primary source for action buttons

### Privacy (hard)

UI state must never invent opponent hand/life faces. Assert in adapter tests that `view.opponent` has `handCount` and no `hand` array. Do not log full views in production builds.

### Public Schema

May read optional lobby fields (`matchId`, `seatsFilled`, `phase`, …) from `room.state` for chrome; **private data only from messages.**

---

## Board layout (minimal wireframe)

Single screen, portrait-first (~375px width):

```
┌─────────────────────────────┐
│ phase · turn · you seat #   │
│ matchId (copy) · Leave      │
├─────────────────────────────┤
│ OPPONENT                    │
│ life · handCount · DON      │
│ [stage] [chars…] [leader]   │
├─────────────────────────────┤
│ battle / trigger prompt     │
│ (only when phase needs it)  │
├─────────────────────────────┤
│ YOU                         │
│ [leader] [chars…] [stage]   │
│ life · DON cost pills       │
│ HAND: scrollable cards      │
├─────────────────────────────┤
│ Actions from legalIntents   │
│ (End turn, Pass block, …)   │
│ or tap card → filtered acts │
└─────────────────────────────┘
│ error banner (if any)       │
```

### Interaction model

1. On each `view`, replace board model; recompute disabled/enabled from `legalIntents`.
2. **Primary path:** show a short list of legal intent buttons (label by `type` + key args). Enough for subset play without a fancy targeting UX.
3. **Optional nicety:** tapping a hand card filters legal intents that reference that `handIndex`.
4. Targeting for attack/block/give DON: if multiple legal intents of same type, present one control per concrete intent object (do not free-type ids).
5. On `match_over`, modal: winner / reason / Return home.

### Card presentation

Placeholder tiles: `defId` text + rested opacity + attached DON count. No requirement for real art.

---

## App structure

```
mobile/
  app.json | app.config.ts
  eas.json
  package.json
  tsconfig.json
  README.md
  app/
    _layout.tsx
    index.tsx          # connect / join
    duel.tsx           # board
  src/
    net/
      protocol.ts
      duelClient.ts
    board/
      DuelBoard.tsx
      Zone.tsx
      CardTile.tsx
      IntentBar.tsx
    state/
      duelStore.ts     # last view, seat, errors, connection (simple React context or zustand)
    config.ts
  src/net/__tests__/
    protocol.test.ts
```

### Env

| Var | Example | Purpose |
|-----|---------|---------|
| `EXPO_PUBLIC_GAME_SERVER_URL` | `http://192.168.1.10:2567` | Colyseus HTTP endpoint for SDK |
| `EXPO_PUBLIC_DEV_JOIN_SECRET` | (optional) | Matches server `DEV_JOIN_SECRET` |

Document that Android emulator / device LAN must reach the host; iOS Simulator can use `http://localhost:2567` when server binds `0.0.0.0`.

---

## Implementation sequence

1. `create-expo-app` (Router template) into `mobile/`; TypeScript; add `@colyseus/sdk`.
2. Port wire types + `DuelClient` (connect, handlers, `sendIntent`, `sync`).
3. Connect screen → navigate to board with room handle / reconnect params.
4. Board rendering of `view` + intent bar.
5. Error banner + match-over modal.
6. Adapter unit tests; README; `eas.json` stub.
7. Manual: two Expo Go sessions or Expo Go + scripted second client to `match_over`.

---

## Test plan

| Case | Expect |
|------|--------|
| Parse `welcome` / `view` | Seat assigned; `opponent.hand` absent |
| Send intent from `legalIntents` | Server accepts; next `view` applied |
| Inject `error` | Banner shows; prior view retained until new `view` |
| `match_over` | Overlay; intents disabled |
| Connect screen validation | Empty `devUserId` blocked |
| Typecheck | `tsc --noEmit` clean |

Manual / device:

| Case | Expect |
|------|--------|
| Create on phone A, join room id on phone B | Both see boards; seats 0/1 |
| Play to end (or vs scripted client) | `match_over` on both |
| Kill network mid-duel | Error or disconnect surfaced (reconnect Step 4) |

---

## Acceptance criteria

- [ ] Two clients (two devices **or** one device + scripted/game-server client) can finish a duel to `match_over`
- [ ] Board updates only from server `welcome` / `view` / `events` / `match_over` (no local rules engine)
- [ ] Opponent hand content never appears in UI state derived from server payloads
- [ ] App runs on a physical iPhone without a Mac for the build used in testing (Expo Go and/or EAS)
- [ ] `mobile/README.md` documents env vars, LAN URL, join flow, and how to run tests
- [ ] Adapter/unit tests pass (`cd mobile && npm test`)
- [ ] Exit notes filled; status → `implemented`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Expo Go + WS / cleartext LAN | Use `http://` LAN IP; iOS ATS exceptions via `app.json` if needed; fall back to EAS dev client |
| Protocol drift vs game-server | Copy types from Step 2; add contract test or shared fixture JSON if drift hurts |
| Over-built targeting UX | Ship intent-button bar first; polish in Step 4 |
| Root workspace / Expo conflict | Keep `mobile/` out of workspaces |
| No second phone | Use scripted Colyseus client from game-server tests as seat 1 |

---

## Explicitly deferred

- FastAPI auth + deck select (Step 4)
- Reconnect / seat reclaim (Step 4)
- Matchmaking lobby (Step 4)
- Ranked / MMR UI (Step 4)
- Spectators (Step 5)
- Android store pass (Step 5)
- Real card art / catalog text (Step 5 + legal)
- Animations beyond trivial press feedback

---

## Open questions (none blocking)

| Topic | Disposition |
|-------|-------------|
| Zustand vs React context | Prefer **React context** unless state grows; decide at implement time |
| Expo SDK exact major | Pin current stable at implement time; document in README |
| Web export for CI screenshots | Optional nicety; not required for acceptance |

---

## Exit notes (fill when step completes)

- Build profile used (Expo Go / EAS dev):
- Screens recorded / screenshots path:
- Protocol gaps found vs Step 2:
- Known UI limitations:
- Status:
