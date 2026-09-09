# Step 1 — Rules engine (`packages/rules`)

**Status:** `ready for development`  
**Depends on:** None  
**Unblocks:** Step 2  
**Branch for implementation:** prefer `cursor/duel-rules-engine-afeb` (or continue on current planning branch if preferred)

## Ready for development (gate)

| Gate item | Decision |
|-----------|----------|
| Goal / acceptance match product B | Yes — headless authoritative rules only |
| v1 card subset agreed | Yes — see § Card subset (6 definitions, placeholder IPs) |
| Owner / CI command | Implementer of this step; CI = `cd packages/rules && npm test` and `npm run sim` |
| Open questions resolved | Yes — see § Decisions locked |

- [x] Goal and acceptance criteria still match product intent
- [x] Card subset for v1 listed below is agreed (can be tiny)
- [x] Owner assigned; CI command for package tests agreed
- [x] No open questions blocking start (deferred items explicitly listed)

---

## Goal

Ship a **headless, deterministic** TypeScript package that can run a complete two-player duel using a **tiny OPTCG-inspired subset**, with unit tests and a batch simulator. No UI. No network.

Success looks like: Step 2 can `import { createMatch, applyIntent, getViewForPlayer } from '@optcg/rules'` (final package name TBD in § Package identity) and drive a room without re-implementing legality.

---

## Decisions locked

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Primary win | **Life → 0** | Clearest vertical slice; matches OPTCG core feel |
| Secondary win | **Deck-out on required draw** | Cheap invariant; include in win check |
| Monorepo tooling (Step 1) | **Standalone package** under `packages/rules` with its own `package.json` | Frontend already uses npm + vitest; no root workspace required yet |
| Test runner | **Vitest** | Matches `frontend/` |
| TypeScript module | `"type": "module"` + Vitest | Align with frontend |
| Workspaces | **Defer to Step 2** | `game-server` will introduce npm workspaces (or equivalent) to link this package |
| Rules fidelity | **Simplified OPTCG-inspired**, not paper-legal | Avoid rules rabbit hole; document divergences in README |
| Card naming | **Placeholder IDs / generic names** | ADR-008 — no official names/art in v1 data |
| RNG | **Injected `Rng` only**; forbid `Math.random` in `src/` | Deterministic sims / replay |
| Attack timing | **Attack actions during Main**, then explicit End turn | Fewer phases than full paper; enough for combat |

---

## In scope

- Package scaffold: `package.json`, `tsconfig.json`, vitest config, `src/`, scripts.
- Match state: two seats, leader, life, deck, hand, character area, DON pool (simplified), phase, turn player, winner.
- Intents + `applyIntent` → `{ state, events, error? }`.
- Data-driven card definitions for the subset + effect hook table.
- Seeded RNG interface used for shuffle (and any random effect if added later).
- `getViewForPlayer` stripping opponent hand / deck order / face-down life cards as opaque counts.
- `listLegalIntents` (or equivalent) for the simulator’s random legal play.
- Unit tests + `npm run sim` (≥ 100 games, exit non-zero on invariant failure).
- README: public API, how to add a card, how to test/sim, simplified-rules notes.

## Out of scope

- Colyseus, Expo, FastAPI, Redis.
- Full keyword suite (Rush, Double Attack, Trigger life effects, Counter windows, etc.).
- Perfect DON deck / life-card flip / multi-attack declaration parity with paper.
- Networking, timers, disconnects, UI.
- Root-level npm workspaces (Step 2).
- Publishing to npm registry.

---

## Simplified rules model (v1)

Explicitly **not** full OPTCG. Document these simplifications in the package README.

### Setup

- 2 players (`0` and `1`).
- Each deck: **40 cards** from the subset only (constructed by `createMatch` helpers / sim).
- Each player: **1 Leader** (from match config), **life = 5** (lower than paper 5–10 for faster sims; configurable in `createMatch`).
- Opening: shuffle with seeded RNG, draw **5**, active player = seat `0`.
- DON: simplified **numeric DON pool** (not a full DON deck). Start of turn: active player gains **2 DON** (refresh exhausted characters + reset DON available to current total — see phases).

### Zones (per player)

| Zone | Notes |
|------|--------|
| `leader` | Single leader instance (always present) |
| `life` | Integer count only in v1 (no life-card stack / triggers) |
| `deck` | Ordered list of card def ids (top = end of array or index 0 — pick one and stick to it in code) |
| `hand` | Card instances |
| `characters` | Up to **5** characters in play |
| `don` | `{ total, available }` integers |
| `trash` | Discard pile |

### Phases (active player)

1. **Refresh** — ready (un-rest) characters + leader; set `don.available = don.total` (then apply turn DON gain below).
2. **Draw** — draw 1; if deck empty → that player **loses** (deck-out).
3. **Don** — `don.total += 2`, `don.available = don.total` (simple v1 gain; no DON deck cards).
4. **Main** — play characters/events, attack, pass-to-end.
5. **End** — clear “this turn” buffs; switch active player; go to their Refresh.

Auto-advance Refresh → Draw → Don → Main at turn start inside `createMatch` / end-turn transition so clients mostly act in **Main**.

### Combat (Main)

- Intent `attack` declares attacker (leader or active character) and target (opponent leader, or omit for “face” only in v1).
- **No blocker window** as a separate phase: if opponent has a ready character with `blocker`, they may respond with intent `block` before damage; if they pass (`pass_block`) or have none, damage applies.
- Damage: if attacker power ≥ target power, target is KO’d (characters → trash; leader damage → defender `life -= 1`). Power ties: attacker wins KO for v1.
- Leader cannot be KO’d; only life reduction.
- When `life <= 0` → attacker’s seat wins.
- Attacker becomes rested after attack; **one attack per character/leader per turn**.

### Playing cards (Main)

- **Character:** pay `cost` from `don.available`; if characters length ≥ 5, illegal; enter rested or active per card flag (default **active** for v1).
- **Event:** pay cost; resolve effect; go to trash.
- Cannot play leader from hand (leader comes from config only).

---

## Card subset (6 definitions)

Placeholder IDs only — not official OPTCG cards.

| ID | Type | Cost | Power | Effect / keyword |
|----|------|------|-------|------------------|
| `leader_striker` | Leader | — | 5000 | Default leader |
| `char_recruit` | Character | 1 | 2000 | Vanilla |
| `char_soldier` | Character | 3 | 4000 | Vanilla |
| `char_guardian` | Character | 2 | 3000 | **Blocker** — may `block` while ready |
| `event_draw` | Event | 1 | — | Draw 1 |
| `event_pump` | Event | 2 | — | Target your character or leader: **+2000 power until End** |

**Deck building for sims/tests:** 40-card lists using multiples of the four non-leader cards (e.g. 12/12/10/6). Leader chosen via `createMatch({ players: [{ leaderId, deck }, ...] })`.

No more than these **6** definitions in Step 1 without updating this plan.

---

## Public API (freeze for Step 2)

Package name: `@optcg/rules` (private).

```ts
// Match lifecycle
createMatch(config: CreateMatchConfig): MatchState

// Authority
applyIntent(state: MatchState, intent: Intent, ctx: ApplyContext): ApplyResult
getViewForPlayer(state: MatchState, seat: Seat): PlayerView
listLegalIntents(state: MatchState, seat: Seat): Intent[]

// Optional helpers for tests/sims
assertInvariants(state: MatchState): void
```

### Core types (sketch)

```ts
type Seat = 0 | 1
type Phase = "refresh" | "draw" | "don" | "main" | "block" | "end"

type Intent =
  | { type: "play_card"; handIndex: number; targets?: Target[] }
  | { type: "attack"; attackerId: InstanceId; target: "leader" }
  | { type: "block"; blockerId: InstanceId }
  | { type: "pass_block" }
  | { type: "end_turn" }

type ApplyContext = { rng: Rng }
type ApplyResult = {
  ok: boolean
  state: MatchState
  events: Event[]
  error?: { code: string; message: string }
}
```

`PlayerView` includes own hand/deck counts/board and **opponent: handCount, deckCount, life, board without hidden info**. Never include opponent hand card ids or deck order.

Export surface lives in `src/index.ts` only.

---

## Package layout

```
packages/rules/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    index.ts                 # public exports
    rng.ts                   # SeededRng + Rng interface
    types.ts                 # MatchState, Intent, Event, views
    invariants.ts
    createMatch.ts
    applyIntent.ts
    legal.ts                 # listLegalIntents
    view.ts                  # getViewForPlayer
    phases.ts                # turn/phase transitions
    combat.ts
    cards/
      registry.ts
      definitions.ts         # the 6 cards
      effects.ts             # effect hooks by card id
    sim/
      randomPlay.ts
      runBatch.ts
    __tests__/
      createMatch.test.ts
      playCharacter.test.ts
      combat.test.ts
      blocker.test.ts
      events.test.ts
      viewHidesHand.test.ts
      invariants.test.ts
      sim.smoke.test.ts
```

### npm scripts

| Script | Command purpose |
|--------|-----------------|
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `sim` | `tsx src/sim/runBatch.ts` (or vitest-node entry) — default 100 games |
| `typecheck` | `tsc --noEmit` |

### Dependencies

- **dev:** `typescript`, `vitest`, `tsx` (for sim CLI)
- **runtime:** none (pure TS)

---

## Implementation sequence (within Step 1)

Do these in order; each ends with tests green before the next.

1. **Scaffold** — package.json, tsconfig, vitest, empty exports.
2. **Types + RNG + invariants** — state shapes; seeded shuffle; `assertInvariants`.
3. **createMatch** — setup, opening hands, active seat 0 in Main (after auto refresh/draw/don).
4. **Play character / event** — DON payment, zone moves, `event_draw` / `event_pump`.
5. **Combat + blocker** — attack, optional block, life/KO, win life→0.
6. **end_turn** — phase clear, switch player, auto refresh/draw/don.
7. **Views + legal intents** — privacy tests; legal list drives sim.
8. **Batch sim** — 100+ games; fail on throw / invariant / stuck (no legal intents while no winner).
9. **README polish** — API, adding cards, simplifications list.

---

## Test plan

| Case | Expect |
|------|--------|
| createMatch determinism | same seed → same opening hands/deck order |
| play character without DON | `ok: false`, state unchanged |
| play character with DON | board +1, don available reduced |
| board at 5 characters | further character play illegal |
| event_draw | hand +1, deck -1 |
| attack into empty board | leader life -1 when power wins |
| life → 0 | `winner` set; further intents illegal |
| blocker | `char_guardian` can intercept; blocker rests / KO rules as implemented |
| view privacy | seat 0 view has no seat 1 hand ids |
| sim 100 | exit 0; no invariant breaches |

---

## Acceptance criteria

- [ ] `cd packages/rules && npm test` passes
- [ ] `cd packages/rules && npm run sim` completes ≥ 100 games with exit code 0
- [ ] `getViewForPlayer` never exposes opponent hand contents or deck order
- [ ] README documents public API, card-add guide, simplified rules, scripts
- [ ] `package.json` has **no** dependencies on React, React Native, Colyseus, FastAPI clients
- [ ] No `Math.random` in `src/` (eslint grep or code review)
- [ ] This plan’s § Exit notes filled when done

---

## Risks

| Risk | Mitigation |
|------|------------|
| Sliding into full OPTCG rules | Hard cap 6 cards; keyword budget = Blocker + two events only |
| Ambiguous phase/combat edge cases | Codify in tests; prefer simple illegal over complex optional rules |
| API churn before Step 2 | Freeze exports in `src/index.ts`; changelog in exit notes |
| Sim soft-locks | `listLegalIntents` empty + no winner → sim failure |

---

## Explicitly deferred (not blocking)

- npm workspaces / package path mapping for `game-server` (Step 2)
- Counter step, Trigger gates, DON deck cards, life card flips
- Rush / Double Attack / Multi-attack patterns beyond one attack per unit
- Deck validation against real catalog IDs from FastAPI

---

## Exit notes (fill when step completes)

- Actual subset list:
- Public API summary (final export names):
- Divergences from this plan:
- Follow-ups deferred to later steps:
