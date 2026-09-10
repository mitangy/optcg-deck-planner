# Step 1 — Rules engine (`packages/rules`)

**Status:** `implemented` (see Exit notes)  
**Depends on:** None  
**Unblocks:** Step 2  
**Branch for implementation:** prefer `cursor/duel-rules-engine-afeb`

## Ready for development (gate)

| Gate item | Decision |
|-----------|----------|
| Goal / acceptance match product B | Yes — headless authoritative rules only |
| Rules fidelity | **Official OPTCG** (Rule Manual + Comprehensive Rules) — not a house ruleset |
| v1 card subset agreed | Yes — tiny **placeholder** cards that exercise official structure (see § Card subset) |
| Owner / CI command | Implementer of this step; CI = `cd packages/rules && npm test` and `npm run sim` |
| Open questions resolved | Yes — see § Decisions locked |

- [x] Goal and acceptance criteria still match product intent
- [x] Card subset for v1 listed below is agreed (can be tiny)
- [x] Owner assigned; CI command for package tests agreed
- [x] No open questions blocking start (deferred items explicitly listed)

---

## Goal

Ship a **headless, deterministic** TypeScript package that runs a complete two-player duel under **official ONE PIECE CARD GAME (OPTCG) rules**, using a tiny placeholder card subset for tests/sims. No UI. No network.

Success looks like: Step 2 can import `createMatch`, `applyIntent`, `getViewForPlayer`, `listLegalIntents` and drive a room without re-implementing legality — and a rules question can be answered by pointing at Bandai’s manuals plus this engine’s tests.

**Authority order (when implementing):**

1. Card text on a definition (once real cards exist)
2. [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf) (or current official comprehensive PDF)
3. [Official Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf) / play guide
4. This plan’s clarifications for engine encoding only (never silent house rules)

If the engine must approximate because a rule is underspecified in code yet, document it under **Rules clarifications** and add a test; do **not** invent shortcuts that contradict the manuals (e.g. “life hits 0 → instant loss” is **wrong** in OPTCG).

---

## Decisions locked

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Rules fidelity | **Official OPTCG turn, cost, life, DON!!, and battle flow** | Product requirement: digital duel client |
| Primary win | Win a **battle against the opponent’s Leader while they have 0 Life cards** | Rule Manual victory conditions |
| Secondary win | Opponent’s **deck reaches 0** (deck-out loss) | Rule Manual |
| Life | Face-down **Life cards** equal to Leader’s Life value (not a bare integer-only model) | Official setup |
| DON!! | Real **10-card DON!! deck** → cost area; rest to pay; **give** to Leader/Character for +1000 power on your turn | Official |
| Deck size (constructed) | **50** main-deck cards + **1** Leader + **10** DON!! | Official constructed |
| First-turn restrictions | First player: **no draw**, **1 DON!!**, **neither player may attack on their first turn** | Official |
| Mulligan | Supported once per player during setup (intent or setup flag) | Official |
| Monorepo tooling (Step 1) | **Standalone** `packages/rules` + **Vitest** | Match frontend; workspaces in Step 2 |
| Card naming / art | Placeholder IDs (ADR-008); mechanics must still be real OPTCG keywords | IP-safe prototype data |
| RNG | Injected `Rng` only; no `Math.random` in `src/` | Deterministic sims |
| Keyword budget (Step 1 cards) | Implement **framework for official battle/keywords used by the subset**; other keywords may be stubbed as “unsupported card text” until Step 5 | Avoid boiling the ocean while keeping structure correct |

---

## In scope

- Package scaffold: `package.json`, `tsconfig.json`, vitest, `src/`, scripts.
- Full **official turn pipeline**: Refresh → Draw → DON!! → Main → End.
- Zones per official areas: Leader, Characters (max 5), Stage (max 1), Deck, Trash, Cost (DON!!), DON!! deck, Life, Hand.
- Paying costs by **resting** active DON!! in the cost area.
- **Giving** DON!! from cost area to Leader/Character; power +1000 per given DON!! during the controller’s turn; return given DON!! to cost area (active) on Refresh; if a Character leaves, attached DON!! return to cost area **rested** (per manual).
- Playing Characters / Stages / Events per Main Phase rules (including trash-one-Character when playing a 6th; replace Stage).
- **Battle flowchart**: Attack Declaration → Block Step → Counter Step → Damage Step → End of Battle.
- Life damage: reveal/check top Life for **Trigger** (optional activate); else add to hand; **0 Life + successful Leader attack → attacker wins**.
- `getViewForPlayer`: hide opponent hand ids, deck order, Life card faces, DON!! deck order.
- Seeded shuffle; unit tests; `npm run sim` (≥ 100 games).
- README citing official manuals + listing any encoding clarifications.

## Out of scope

- Colyseus, Expo, FastAPI, Redis.
- Full card pool / every keyword in the game (Double Attack, Banish, complex Activate:Main chains, etc. beyond what the Step 1 subset needs).
- Perfect parity with every comprehensive-rules edge case on day one — but **no intentional contradictions**; track gaps in README “Known gaps”.
- Networking, timers, UI.
- Root npm workspaces (Step 2).
- Publishing to npm.

---

## Official rules model (engine must implement)

Encode the Rule Manual flow. Summary for implementers (verify against current PDFs when coding):

### Setup

1. Shuffle main deck (seeded).
2. Place Leader face-up.
3. Decide first player (config or RNG).
4. Draw 5.
5. Optional mulligan once (return hand, reshuffle, draw 5).
6. Move top **Life** cards from deck to Life area face-down (count = Leader’s Life). Bottom of Life stack = first taken from deck top per manual ordering — pick one encoding, test it, document in clarifications.
7. First player’s turn begins at Refresh.

### Victory

- Attacker wins a battle against the opponent’s **Leader** while that opponent has **0 Life cards**.
- A player whose **deck count reaches 0** loses (ongoing effects canceled per manual).

### Turn phases

1. **Refresh** — Set all your rested cards active; return all **given** DON!! to your cost area **active**.
2. **Draw** — Draw 1 (**skipped** on the first player’s first turn). If unable to draw from an empty deck → that player loses.
3. **DON!!** — Put **2** DON!! from DON!! deck into cost area active (**1** on the first player’s first turn). If fewer remain, put as many as remain.
4. **Main** — In any order, any number of times (when legal): play cards; activate applicable effects; give DON!!; declare battles. Declare end of Main to proceed.
5. **End** — End-of-turn effects; clear “until end of turn / during this turn” effects; pass turn.

### Costs & DON!!

- To pay cost \(N\): rest \(N\) **active** DON!! in your cost area.
- Give: move 1 active cost-area DON!! under your Leader or a Character (visible). During **your** turn, +1000 power per DON!! on that card.
- No attack on each player’s **first turn** of the game.

### Battle steps (Main)

1. **Attack Declaration** — Rest an active Leader or Character; choose target: opponent Leader **or** a **rested** opponent Character. Resolve When Attacking / when attacked effects as applicable.
2. **Block Step** — Defender may activate **[Blocker]** on one eligible Character (once per battle), redirecting the attack.
3. **Counter Step** — Defender may, any times in any order: trash hand cards with **[Counter]** to add power for the battle; and/or play **[Counter]** Events from hand (pay costs as required by card text).
4. **Damage Step** — Compare power; **attacker wins ties**. If attack fails, nothing. If success vs Character → K.O. to trash. If success vs Leader → 1 damage (process Life / Trigger); if Leader had 0 Life already → **attacker wins the game**.
5. **End of Battle** — End-of-battle effects; clear “during this battle” modifiers.

### Playing cards (Main)

- **Character** — Place active, pay cost. If 5 Characters already, trash one of yours first.
- **Stage** — Max 1; trash existing Stage to play another; pay cost.
- **Event (Main)** — Reveal, pay cost, resolve Main effect, trash. Counter Events are **not** playable as Main from hand.

---

## Rules clarifications (encoding only)

Use these only where the manual leaves implementation choices; update if Comprehensive Rules say otherwise:

| Topic | Encoding choice for Step 1 |
|-------|----------------------------|
| Life stack orientation | Life[0] = next damage card (top). Document in README. |
| Power from given DON!! | +1000 per attached DON!! **only on the card’s controller’s turn** (per manual). |
| Simultaneous effects | Turn player’s effects first, then opponent (manual). Within one player, controller chooses order. |
| Unsupported keywords on a card definition | Card cannot be included in Step 1 legal data; or effect no-ops **only if** tests say so and README “Known gaps” lists it — prefer omitting the card. |

---

## Card subset (placeholders exercising official structure)

Not official card names/art. Cap Step 1 at these definitions unless this plan is updated.

| ID | Type | Cost | Power | Counter | Keywords / effect |
|----|------|------|-------|---------|-------------------|
| `leader_red_5k` | Leader | — | 5000 | — | Life **5**, color Red |
| `char_vanilla_2k` | Character | 1 | 2000 | 1000 | Vanilla; usable as Counter from hand |
| `char_curve_4k` | Character | 3 | 4000 | 1000 | Vanilla |
| `char_blocker_3k` | Character | 2 | 3000 | — | **[Blocker]** |
| `event_main_draw` | Event | 1 | — | — | **[Main]** Draw 1 |
| `event_counter_1k` | Event | 0 | — | — | **[Counter]** +1000 to Leader or 1 Character this battle |
| `stage_small_buff` | Stage | 1 | — | — | Your Leader gets +1000 power (static while in Stage area) |

**Constructed decks for sims/tests:** 50-card lists from the non-leader cards (respect max 4 per card number), colors legal for `leader_red_5k`, plus 10 DON!! and that Leader.

Optional later in Step 1 (only if tests need it): one **[Trigger]** Life-relevant character — otherwise Trigger path can be tested with a dedicated fixture card in tests without expanding the playable subset.

---

## Public API (freeze for Step 2)

Package name: `@optcg/rules` (private).

```ts
createMatch(config: CreateMatchConfig): MatchState
applyIntent(state: MatchState, intent: Intent, ctx: ApplyContext): ApplyResult
getViewForPlayer(state: MatchState, seat: Seat): PlayerView
listLegalIntents(state: MatchState, seat: Seat): Intent[]
assertInvariants(state: MatchState): void
```

### Intent sketch (official structure)

```ts
type Seat = 0 | 1

type Phase =
  | "setup" | "mulligan"
  | "refresh" | "draw" | "don" | "main"
  | "battle_attack" | "battle_block" | "battle_counter" | "battle_damage" | "battle_end"
  | "end"

type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterInstanceId?: InstanceId } // 6th character
  | { type: "activate_main"; ... } // only if subset needs Activate:Main
  | { type: "give_don"; donInstanceId: InstanceId; targetId: InstanceId }
  | { type: "declare_attack"; attackerId: InstanceId; target: { kind: "leader" } | { kind: "character"; id: InstanceId } }
  | { type: "block"; blockerId: InstanceId }
  | { type: "pass_block" }
  | { type: "counter_character"; handIndex: number; boostTargetId: InstanceId }
  | { type: "counter_event"; handIndex: number; targets?: Target[] }
  | { type: "pass_counter" } // explicitly leave Counter Step
  | { type: "decide_trigger"; accept: boolean } // when Life card has Trigger
  | { type: "end_main" }
```

`PlayerView` never includes opponent hand card ids, deck order, Life faces, or DON!! deck order — only counts / public board.

Exports only from `src/index.ts`.

---

## Package layout

```
packages/rules/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  src/
    index.ts
    rng.ts
    types.ts
    invariants.ts
    createMatch.ts
    applyIntent.ts
    legal.ts
    view.ts
    phases/
      refresh.ts
      draw.ts
      don.ts
      main.ts
      end.ts
    battle/
      attack.ts
      block.ts
      counter.ts
      damage.ts
    donEconomy.ts          # pay cost, give, return on refresh / leave field
    cards/
      registry.ts
      definitions.ts
      effects.ts
    sim/
      randomPlay.ts
      runBatch.ts
    __tests__/
      setup.test.ts
      turnPhases.test.ts
      donEconomy.test.ts
      playCharacterStageEvent.test.ts
      battleBlockCounter.test.ts
      lifeAndVictory.test.ts
      firstTurnRestrictions.test.ts
      viewHidesPrivate.test.ts
      sim.smoke.test.ts
```

### npm scripts

| Script | Purpose |
|--------|---------|
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `sim` | batch ≥ 100 games |
| `typecheck` | `tsc --noEmit` |

Runtime dependencies: **none**.

---

## Implementation sequence

1. Scaffold + types + RNG + invariants (zones match official areas).
2. `createMatch` setup: 50/10/Leader, Life cards, mulligan hook, first/second flags.
3. Phase auto-pipeline Refresh → Draw → DON!! → Main with first-turn exceptions.
4. DON!! pay + give + refresh return; power calculation.
5. Play Character / Stage / Event (Main).
6. Full battle steps including Block, Counter, Damage, Leader 0-life win, deck-out.
7. Trigger decision path (even if only test fixture card).
8. Views + `listLegalIntents`.
9. Batch sim + README (manual links, clarifications, known gaps).

---

## Test plan

| Case | Expect |
|------|--------|
| Setup Life | Life count equals Leader Life; main deck decreased accordingly |
| First player turn 1 | No draw; 1 DON!!; `declare_attack` illegal |
| Second player turn 1 | Draw 1; 2 DON!!; still no attacks |
| Pay cost | Rests N DON!!; insufficient active DON!! → illegal |
| Give DON!! | +1000 power on controller’s turn only |
| 6th Character | Requires trash of an existing Character |
| Blocker | Redirects attack once; rested |
| Counter | Hand Counter / Counter Event can raise defender power; attacker wins ties |
| Leader damage at Life ≥ 1 | Life card → hand (or Trigger path) |
| Leader damage at Life 0 | Attacking player wins |
| Deck-out | Player who cannot draw / whose deck hits 0 loses per encoded manual rule |
| View privacy | No opponent hand ids / Life faces / deck order |
| Sim 100 | Exit 0; no invariant breaches |

---

## Acceptance criteria

- [ ] `cd packages/rules && npm test` passes
- [ ] `cd packages/rules && npm run sim` completes ≥ 100 games, exit 0
- [ ] Turn phases and battle steps match official flowchart names/order above
- [ ] Victory conditions match official (Leader battle at 0 Life; deck-out) — **not** “life counter hits 0 auto-loss without battle”
- [ ] DON!! modeled as deck + cost area + give/attach, not a single integer “mana pool” that ignores resting/giving
- [ ] `getViewForPlayer` hides private info
- [ ] README links official manuals, lists clarifications + known gaps
- [ ] No React / RN / Colyseus / FastAPI deps; no `Math.random` in `src/`
- [ ] Exit notes filled

---

## Risks

| Risk | Mitigation |
|------|------------|
| Comprehensive Rules complexity | Subset keywords only; structure still official; “Known gaps” list |
| Accidental house rules | Code review vs Rule Manual; victory/DON!!/battle tests as guardians |
| Sim length with 50-card decks | Cap turn count; legal-intent random policy; still require ≥100 finished games |
| API churn | Freeze `src/index.ts` exports |

---

## Explicitly deferred

- npm workspaces linking into `game-server` (Step 2)
- Keywords not on the Step 1 subset (Rush, Double Attack, Banish, many Activate effects, …)
- Real catalog IDs / Bandai card text import (Step 5 + legal review)
- Competitive ban lists / official deck registration

---

## Exit notes (fill when step completes)

- Manual versions consulted (PDF dates): Rule Manual + Comprehensive Rules (en.onepiece-cardgame.com current PDFs as of implementation); encoding follows Step 1 plan
- Actual subset list: `leader_red_5k`, `char_vanilla_2k`, `char_curve_4k`, `char_blocker_3k`, `event_main_draw`, `event_counter_1k`, `stage_small_buff`, `char_trigger_draw` (fixture)
- Public API summary: `createMatch`, `applyIntent`, `listLegalIntents`, `getPlayerView`, `assertInvariants`, `skipMulligans`, `createSeededRng`, `buildTestDeck`
- Clarifications / known gaps vs Comprehensive Rules: see `packages/rules/README.md` (20-card test decks; subset keywords only; minimal Trigger)
- Follow-ups for Step 5 content: expand card pool/keywords; 50-card constructed validation; richer Trigger/Activate effects
- Status: **implemented** — `cd packages/rules && npm test && npm run sim`
