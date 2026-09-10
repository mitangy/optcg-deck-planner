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
| Rules on device | **Do not** import `@optcg/rules` for legality. Render `view` + present buttons from `view.legalIntents`. Wire types live in `mobile/src/net/protocol.ts` (copied/adapted from game-server). Cosmetics (name/art) come from a **card atlas** keyed by `defId` — not from inventing rules. |
| Real cards (Step 3) | **Yes — curated real OPTCG ids** in `@optcg/rules` (official numbers + names + art URLs + mechanics limited to keywords the engine already supports). Not a full-set catalog import. See § Real cards slice. |
| Owner / CI | Implementer of this step; CI = `cd packages/rules && npm test` + `cd game-server && npm test` + `cd mobile && npm test` + `npx tsc --noEmit`. Device proof via README notes / screenshots when available. |

- [x] Goal and acceptance criteria match product intent (board + intents + real-card subset, no matchmaking yet)
- [x] Step 2 protocol reviewed and named correctly in this plan
- [x] EAS / board / auth / join / navigation / real-card slice decided for this step
- [x] Open questions resolved or explicitly deferred
- [x] Checklist complete — **implementation may start** on a separate branch

---

## Goal

Ship an **Expo iOS-first client** that connects to the Colyseus `duel` room, renders the player’s private view with **real OPTCG card identities** (official ids, names, and art for a curated starter set), and sends intents. A developer can finish a duel on a **physical iPhone** without a Mac (Expo Go or EAS development build), with a second player as another phone or the existing scripted/game-server test client.

Success looks like: the phone never decides legality; it displays `view` / `events` / `error` / `match_over` using a card atlas for cosmetics, and sends `intent` envelopes shaped like Step 2. Default matches use decks built from the curated real-id set — not `leader_red_5k` placeholders.

---

## Decisions locked

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Client stack | Expo (SDK current stable at implement time) + Expo Router + TypeScript | ADR-002 |
| Colyseus client | `@colyseus/sdk` ^0.18 matching game-server | ADR-003 / Step 2 pin |
| Authority | Board is a pure view of server payloads | ADR-007 |
| Auth (Step 3) | `devUserId` text field only; optional `DEV_JOIN_SECRET` | Matches Step 2; FastAPI later |
| Card content | **Curated real OPTCG card defs** in `@optcg/rules` (official `OP##-###` / `ST##-###` ids); placeholders retired from default duels | Product ask; still finite keyword budget |
| Cosmetics vs legality | Names + `imageUrl` are display data; power/cost/keywords in `CardDef` remain the rules source of truth | Catalog Postgres has no power/effects — do not drive legality from shopping catalog |
| Deck source | Server defaults built from curated real-id lists; client does not upload planner decks yet | Vertical slice; planner deck select → Step 4 |
| Art source | TCGPlayer CDN URLs (`product/{id}_400w.jpg` pattern) stored on `CardDef.imageUrl` / atlas; private-prototype only | Matches existing planner `cardImage.ts` pattern; ADR-008 |
| Mulligan UI | If `phase === "mulligan"`, show Keep / Mulligan from `legalIntents`; with server `autoSkipMulligan: true` (default), may skip straight to main | Server already defaults skip |
| Illegal intent UX | Banner/toast from `error` `{ code, message }`; clear selection; wait for next `view` | Acceptance |
| Optimistic UI | Selection highlights only; **no** local rules apply; reset selection on every `view` | Prevent desync |
| Shared package | Copy protocol types into mobile; do **not** add `mobile` to root workspaces | Avoid Expo vs Node workspace pain |
| Design | One game-table composition: opponent (top) → mid field → you (bottom); chrome for phase + actions; **card tiles show name + art** | Not a dashboard |

---

## Real cards slice

### Why this is in Step 3 (not only Step 5)

The board is useless as a product demo if every tile still says `char_vanilla_2k`. Step 5 still owns **breadth** (many sets, more keywords, spectate, Android). Step 3 owns a **playable curated real-id starter set** so the Expo board looks and feels like OPTCG while mechanics stay inside the engine’s current keyword budget.

### What “real” means here

| Included | Excluded (still Step 5+) |
|----------|---------------------------|
| Official card numbers as `CardDef.id` (e.g. `OP01-001`) | Full OP01–OPxx catalog dump into rules |
| Printed English names | Complex Activate:Main / On Play / multi-step chains beyond current hooks |
| Cost / color / type / power / life / counter / blocker / simple draw / stage buff / trigger draw — only what `@optcg/rules` already encodes | Rush, Double Attack, Banish, searchers, ramp, etc. |
| `imageUrl` pointing at TCGPlayer CDN product art | Postgres catalog sync as duel hot-path dependency |
| Default duel decks composed from these ids | Planner deck import / constructed 50-card validation UI |

### Content rules

1. **Author in `@optcg/rules`** — extend `CardDef` with optional `imageUrl?: string` (and keep `name`). Replace placeholder ids in `definitions.ts` (or add `definitions.real.ts` merged into the registry).
2. **Keyword budget** — only cards whose printed effects map 1:1 onto existing fields (`blocker`, `mainDraw`, `counterPowerBonus`, `stageLeaderPowerBonus`, `triggerDraw`, vanilla). If a real card needs unsupported text, **do not include it** (or stub as vanilla and list under Known gaps — prefer omit).
3. **Starter set size** — about **1 leader + 10–20 unique main-deck cards** covering the keyword budget; default lists may still be short (~20–50 cards) for CI speed. Document the exact id list in `packages/rules/README.md` when implemented.
4. **Do not** call FastAPI/`CatalogCard` from the intent path. Optional one-shot script to *suggest* `imageUrl` / name from a synced catalog is fine; committed defs are the source of truth at runtime.
5. **Legal / IP** — private prototype only (ADR-008). README must say art/names are for private testing; public store builds need rights / feature flags (Step 5).

### Client atlas

Views still send `defId` only (protocol unchanged). Mobile loads a **card atlas** (`defId → { name, imageUrl, cost, power, type, colors, … }`):

- Prefer generating `mobile/assets/cardAtlas.json` from `listCardDefs()` via a small script in `packages/rules` (e.g. `npm run export-atlas`), checked in or generated in CI before mobile tests.
- Optional alternate: `GET` static atlas from game-server — not required if bundled JSON is enough.

Board tiles: art image (fallback color chip if URL fails) + name + power/cost badges + rested state.

### Server / tests impact

- game-server default `createMatch` decks use curated real ids.
- Rules unit tests + `npm run sim` stay green on the new defs.
- game-server privacy/scripted duel tests still pass (may update seed fixtures).
- Keep old placeholder ids temporarily as aliases **or** delete them once tests migrate — prefer **delete** to avoid two vocabularies.

### Example mapping (illustrative — finalize at implement time)

| Role | Engine hook | Pick a real card that is effectively this |
|------|-------------|-------------------------------------------|
| Red leader 5k / life 5 | leader | A red 5-life leader with no extra text (or text we ignore only if README gaps say so — prefer no-extra-text) |
| Cost 1 vanilla 2k | character | Vanilla 2000 |
| Cost 2 blocker | `blocker: true` | A simple Blocker character |
| Cost 3 curve 4k | character | Vanilla / near-vanilla 4000 |
| Main draw event | `mainDraw` | Simple “draw 1” main event |
| Counter event +1k | `counterPowerBonus` | Simple counter event |
| Stage leader +1k | `stageLeaderPowerBonus` | Simple stage |
| Trigger draw | `triggerDraw` | Character whose Trigger is draw 1 |

Exact prints chosen at implementation; the table is the acceptance shape.

---

## In scope

- Expo app scaffold under `mobile/` (Expo Router file routes).
- Screens:
  1. **Home / connect** — `devUserId`, server URL, optional secret, Create duel / Join by room id.
  2. **Duel board** — zones below; intent actions; error banner; match-over overlay; **real name + art tiles**.
- Colyseus adapter matching Step 2 protocol (`mobile/src/net/duelClient.ts` + `protocol.ts`).
- Board UI for subset zones (see § Board layout).
- **Curated real `CardDef`s** in `@optcg/rules` + default decks; atlas export for mobile.
- game-server default matches switched to real-id decks.
- Env: `EXPO_PUBLIC_GAME_SERVER_URL` (default `http://<lan-ip>:2567`).
- README: local run, LAN tips, Expo Go vs EAS, card atlas regen, IP/private-prototype note.
- Lightweight automated tests for protocol adapter / message parsing (Jest or Vitest via Expo).
- `eas.json` stub (`development` / `preview` profiles) even if first proof uses Expo Go.

## Out of scope

- Full-set / every-keyword expansion (Step 5).
- Polished animation system / offline art mirroring beyond CDN URLs.
- Matchmaking queue / ranked UI (Step 4).
- FastAPI sign-in, planner deck picker, MMR display (Step 4).
- Driving duel legality from Postgres `CatalogCard` rows.
- Android Play listing (Step 5); Android Expo Go smoke optional.
- App Store production submit / public “official OPTCG” branding.
- Importing `@optcg/rules` into the app bundle for legality (atlas JSON only).
- Changing game-server wire protocol (bugfixes only if Step 3 is blocked).

---

## Deliverables

| Artifact | Location |
|----------|----------|
| Expo app | `mobile/**` |
| Routes | `mobile/app/` (e.g. `index.tsx`, `duel.tsx`) |
| Duel client adapter | `mobile/src/net/duelClient.ts` |
| Wire types | `mobile/src/net/protocol.ts` |
| Board UI | `mobile/src/board/**` |
| Card atlas | `mobile/assets/cardAtlas.json` (+ export script under `packages/rules`) |
| Real card defs + default decks | `packages/rules/src/cards/**` |
| README | `mobile/README.md` (+ rules README content list) |
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

Tiles show **atlas name + art** (`imageUrl`) for curated real ids, with rested opacity + attached DON count. If art fails to load, fall back to color chip + name (never a blank mystery tile).

---

## App structure

```
mobile/
  app.json | app.config.ts
  eas.json
  package.json
  tsconfig.json
  README.md
  assets/
    cardAtlas.json     # generated from @optcg/rules listCardDefs()
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
      CardTile.tsx      # name + art from atlas
      IntentBar.tsx
    cards/
      atlas.ts         # load/lookup cardAtlas.json
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

1. **Rules content first:** curated real `CardDef`s + `imageUrl`; retire placeholders from default decks; export atlas script; rules tests + sim green.
2. **game-server:** switch default match decks to real ids; update fixtures.
3. `create-expo-app` (Router template) into `mobile/`; TypeScript; add `@colyseus/sdk`.
4. Port wire types + `DuelClient` (connect, handlers, `sendIntent`, `sync`).
5. Connect screen → navigate to board with room handle / reconnect params.
6. Board rendering of `view` + atlas-backed `CardTile` + intent bar.
7. Error banner + match-over modal.
8. Adapter unit tests; README (incl. atlas regen + IP note); `eas.json` stub.
9. Manual: two Expo Go sessions or Expo Go + scripted second client to `match_over` with recognizable real art/names.

---

## Test plan

| Case | Expect |
|------|--------|
| Parse `welcome` / `view` | Seat assigned; `opponent.hand` absent |
| Send intent from `legalIntents` | Server accepts; next `view` applied |
| Inject `error` | Banner shows; prior view retained until new `view` |
| `match_over` | Overlay; intents disabled |
| Connect screen validation | Empty `devUserId` blocked |
| Atlas lookup | Known real `defId` resolves to name + `imageUrl` |
| Rules suite | Real-id defs + default decks; `npm test` / `npm run sim` green |
| Typecheck | `tsc --noEmit` clean |

Manual / device:

| Case | Expect |
|------|--------|
| Create on phone A, join room id on phone B | Both see boards; seats 0/1 |
| Board shows real cards | Leader/hand tiles show official names + art (not `char_vanilla_2k`) |
| Play to end (or vs scripted client) | `match_over` on both |
| Kill network mid-duel | Error or disconnect surfaced (reconnect Step 4) |

---

## Acceptance criteria

- [ ] Two clients (two devices **or** one device + scripted/game-server client) can finish a duel to `match_over`
- [ ] Board updates only from server `welcome` / `view` / `events` / `match_over` (no local rules engine)
- [ ] Opponent hand content never appears in UI state derived from server payloads
- [ ] Default duels use **curated real OPTCG ids**; board tiles show official names + art from the atlas (placeholders gone from the happy path)
- [ ] `@optcg/rules` tests + sim pass on the real-id set; keyword budget respected (no unsupported effect stubs silently “house-ruled”)
- [ ] App runs on a physical iPhone without a Mac for the build used in testing (Expo Go and/or EAS)
- [ ] `mobile/README.md` documents env vars, LAN URL, join flow, atlas regen, IP/private-prototype note, and how to run tests
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
| Encoding real cards incorrectly (silent house rules) | Only include cards that map to existing hooks; list Known gaps; never invent effects |
| IP / CDN hotlink fragility | Private prototype disclaimer; atlas fallback chip; Step 5 rights + mirroring |

---

## Explicitly deferred

- FastAPI auth + deck select from planner (Step 4)
- Reconnect / seat reclaim (Step 4)
- Matchmaking lobby (Step 4)
- Ranked / MMR UI (Step 4)
- Spectators (Step 5)
- Android store pass (Step 5)
- **Full-set / every-keyword** card pool expansion (Step 5)
- Public store build with licensed art/text (Step 5 + legal review)
- Animations beyond trivial press feedback

---

## Open questions (none blocking)

| Topic | Disposition |
|-------|-------------|
| Zustand vs React context | Prefer **React context** unless state grows; decide at implement time |
| Expo SDK exact major | Pin current stable at implement time; document in README |
| Web export for CI screenshots | Optional nicety; not required for acceptance |
| Exact starter-print list | Chosen at implement time against keyword budget; document in rules README |

---

## Exit notes (fill when step completes)

- Build profile used (Expo Go / EAS dev):
- Screens recorded / screenshots path:
- Protocol gaps found vs Step 2:
- Real card id list shipped:
- Known UI / content limitations:
- Status:
