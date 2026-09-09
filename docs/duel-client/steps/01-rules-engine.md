# Step 1 — Rules engine (`packages/rules`)

**Status:** `planned` (not started)  
**Depends on:** None  
**Unblocks:** Step 2

## Ready for development (gate)

Complete before writing production code for this step:

- [ ] Goal and acceptance criteria still match product intent
- [ ] Card subset for v1 listed below is agreed (can be tiny)
- [ ] Owner assigned; CI command for package tests agreed
- [ ] No open questions in “Open questions” (or explicitly deferred with owners)

## Goal

Ship a **headless, deterministic** TypeScript rules package that can run a complete duel between two decks drawn from a **tiny legal card subset**, with unit tests and a batch simulator. No UI. No network.

## In scope

- Package layout under `packages/rules` (package.json, tsconfig, test runner).
- Core duel state: players, decks, hands, life/DON zones as needed for the subset, turn/phase model appropriate to the subset.
- Intent types + pure `reduce(state, intent, ctx) → { state, events }` (or equivalent).
- Data-driven card definitions for the subset (JSON/TS modules).
- RNG injected via seeded interface (server will pass seeds later).
- Unit tests for legality failures and successful lines of play.
- CLI or script: simulate N random/legal games; exit non-zero on invariant breaks.

## Out of scope

- Colyseus, Expo, FastAPI changes.
- Full OPTCG card pool, ban lists, or perfect rules parity with paper.
- Networking, timers, disconnects.
- Rendering, animations, sound.

## Deliverables

| Artifact | Location |
|----------|----------|
| Package source | `packages/rules/src/**` |
| Card subset definitions | `packages/rules/src/cards/**` or `data/**` |
| Tests | `packages/rules/src/**/*.test.ts` (or `/tests`) |
| Sim script | `packages/rules` npm script e.g. `sim` |
| Package README updated | `packages/rules/README.md` |

## Technical approach

1. Define a minimal **phase graph** sufficient for the subset (e.g. refresh → draw → don → main → attack → end — trim if subset needs less).
2. Represent cards as definitions (`id`, costs, types, effect hooks registered by id).
3. Keep effects as small functions registered in a table; avoid a giant switch that cannot be tested.
4. Enforce invariants after every intent (hand size bounds for subset, non-negative counters, zone membership).
5. Export only stable public API types for Step 2 (`createMatch`, `applyIntent`, `getViewForPlayer`).

### Suggested v1 card subset (edit at gate time)

Start with **≤ 8 card definitions** that exercise:

- Paying cost / deploying a character
- Attacking and taking life
- One blocker or one simple on-play effect
- Win condition (life = 0 or deck-out — pick one primary for v1)

Exact IDs/names are placeholders until content policy is set (see ADR-008).

## Acceptance criteria

- [ ] `npm test` (or repo-standard) passes in `packages/rules` on CI/local.
- [ ] Simulator runs ≥ 100 games without invariant violations.
- [ ] Opponent hidden info is not present in `getViewForPlayer` output for the other seat.
- [ ] README documents how to add a card definition and how to run tests/sims.
- [ ] No dependency on React Native, Colyseus, or FastAPI.

## Risks

| Risk | Mitigation |
|------|------------|
| Rules rabbit hole (full OPTCG complexity) | Hard cap subset; defer keywords not in subset |
| Non-determinism | Seeded RNG only; ban `Math.random` in package |
| Unstable API for Step 2 | Freeze export surface in README before Step 2 starts |

## Open questions

- Prefer life-to-zero vs alternate win for the first vertical slice?
- Monorepo tool: npm workspaces vs pnpm vs leave packages standalone until Step 2?

## Exit notes (fill when step completes)

- Actual subset list:
- Public API summary:
- Follow-ups deferred to later steps:
