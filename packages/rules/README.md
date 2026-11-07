# `@optcg/rules` — Headless OPTCG rules engine

Deterministic TypeScript rules package for the digital duel client. It holds the engine, the card definitions for the whole catalog, the bots and the simulation tools. `game-server`, `analyst` and `duel-web` (types and `src/replay/`) consume it from source.

## Authority

1. Card text on a definition  
2. OPTCG Comprehensive Rules  
3. OPTCG Rule Manual / play guide  
4. Encoding clarifications below (never silent house rules)

## Public API

Everything is exported from `src/index.ts`; the main entry points are:

```ts
createMatch(config)
applyIntent(state, intent, { seat })
listLegalIntents(state, seat)
getPlayerView(state, seat)
getSpectatorView(state, cameraSeat?)
assertInvariants(state)
skipMulligans(state)
createSeededRng(seed)
getCardDef(id) / listCardDefs() / hasCardDef(id)   // cards/definitions.ts
cardAbilities(id) / abilityById(id)                // the declarative ability registry
serializeMatch / deserializeMatch                  // snapshots
replayMatch / buildReplayTimeline / getReplayView  // replays
chooseBotIntent / rankOptions / winProbability     // bots and position analysis
buildTestDeck(size?) / buildCardAtlas() / DEFAULT_LEADER_ID
```

The `Intent` union (`src/types.ts`) is the full list of player actions: `mulligan`, `play_card`, `give_don`, `activate_ability` (Leader, Character and Stage Activate:Main), `declare_attack`, `declare_block`, `pass_block`, `counter_from_hand`, `counter_event`, `pass_counter`, `resolve_pending_choice`, `order_pending_effects` and `end_turn`.

## Scripts

Install once from the repo root (`npm ci`); all commands below run inside `packages/rules`.

```bash
npm test
npm run typecheck
npm run sim          # ≥100 random games
npm run export-atlas # writes cardAtlas.json for mobile/ and duel-web/ (see src/scripts/exportAtlas.ts)
SIM_GAMES=200 npm run sim
npm run scenario-coverage             # supported cards no test mentions, by set (a to-do list, not a gate)
npm run scenario-coverage -- --summary OP01 EB01
npm run bench:views                   # µs per move: applyIntent, and both seats' views with and without the query cache
npm run bench:views -- --gate         # CI: exit 1 unless cached views are ≥1.8x faster than uncached
npm run lint:programs                 # static lints over every compiled card program (also a vitest: programLint.test.ts)
npm run lint:programs -- --all        # also list the allowlisted findings and why
```

`lint:programs` reports a card that reads a variable no earlier step writes, and an "if you do / if they do not" payoff
gated on a `may` that is not a cost (accepting and paying partly still pays off). Accepted findings live in
`src/tools/cardText/programLintAllowlist.ts`, keyed by ability id, each with a reason.

## Golden replays

`replays/<name>.json` is a fixture (seed, first seat, both decks, and every intent played; no timestamps or runtime ids). `replays/<name>.golden.txt` is the engine's narration of it: one line per event from `describeEvents`, then a final-state summary (life, hand/deck/trash counts, field cards with power, DON!! per seat, winner). `src/__tests__/replays.test.ts` replays every fixture and fails with a line diff when the narration changes. Tests never write goldens, and `replay:bless` refuses to run when `CI` is set.

```bash
# New replay from a bug report seed (add --leaders A,B to pin leaders, --full to play to a winner)
npm run replay:record -- my-bug 4821 --first 1 --lines 90 --note "why this replay exists"
# After an intended rules/card-data/narration change: review the diff, then rewrite goldens
npm run replay:bless             # all fixtures, or: npm run replay:bless -- my-bug
git diff replays/
```

`record` plays the seed with the fuzzer's deck builder and a random legal-move policy and stops at a quiet Main Phase once about `--lines` event lines exist. Fixtures are inputs only: if a rules change makes a recorded intent illegal, the golden shows `!! REJECTED` at that step; re-record the replay rather than blessing it.

## Official structure implemented

- Zones: Leader, Characters (max 5), Stage (max 1), Deck, Trash, Life, Hand, DON!! deck, Cost area  
- Turn: Refresh → Draw → DON!! → Main → End  
- First-turn: no draw / 1 DON!! for first player; **no attacks on each player’s first turn**  
- Costs: rest active DON!! in cost area  
- Give DON!!: +1000 power on controller’s turn; returned active on Refresh; rested if character leaves  
- Activate:Main on a Leader, Character or Stage is the single `activate_ability` intent (`sourceId` + `abilityId`, optional `targetId`); abilities come from the card's registry entry  
- Battle: Attack → Block → Counter → Damage  
- Victory: win Leader battle at **0 Life**; or opponent **deck-out**  
- Privacy: `getPlayerView` hides opponent hand ids, deck order, Life faces, DON!! deck order  

## Card definitions and abilities

Card definitions cover the whole catalog (`src/cards/cardData.json`: Bandai rows plus TCGPlayer-only rows). Abilities are declarative data validated into a registry (`src/cards/abilities.ts`):

- `src/cards/generated/abilities.json` is generated from the printed text by the offline compiler in `src/tools/cardText/`.
- `src/cards/manualAbilities.ts` holds reviewed overrides for text the compiler cannot express: `{ abilities }` replaces a card's generated entry, `{ patch }` adds abilities for clauses the compiler marked unsupported (a patch that matches no unsupported clause fails registry validation).
- `EFFECT_CATALOG` (`src/cards/effectCatalog.ts`) records each printed clause as supported, partial or unsupported, and `abilitySupport` (`none`, `keywords`, `ok`, `partial`, `unsupported`, `unverified`) is derived from it. Ranked rooms reject decks with `partial`, `unsupported` or `unverified` cards (`game-server/src/rankedDeck.ts`); unranked rooms accept them.

Art URLs prefer the TCGPlayer CDN and remain display-only. Clients consume `buildCardAtlas()` / `export-atlas` JSON and never infer legality from cosmetics.

`buildTestDeck(size)` returns up to 20 cards (at most 4 copies each) for tests and sims. Real decks are validated against the Leader's printed deck-construction rules (`src/cards/deckRules.ts`).

## Adding or fixing a card

1. Regenerate the compiled abilities after a card-data or grammar change: `npx tsx src/tools/cardText/generate.ts` (`--check` fails when the checked-in file is stale).
2. For text the compiler cannot express, add a reviewed override in `src/cards/manualAbilities.ts`, then run `npx tsx src/tools/cardText/checkManual.ts`.
3. Add a scenario row for the card (next section), including an accept and a decline row for every optional "you may" / "if you do" effect.
4. Add a mutation for each row in `tools/mutation-check/suites/rules.cjs` and prove it with `node tools/mutation-check/run.cjs rules --only '^<id>$'` from the repo root.
5. Run `npm run lint:programs` and `npm test`; if golden replays change on purpose, review the diff and `npm run replay:bless`.

A new effect kind or condition is an engine change, not a card change: add the type in `src/effects/types.ts`, validate it in `src/effects/validate.ts`, compile it in `src/effects/compile.ts` if it needs steps, resolve it in `src/engine/`, and cover it with a scenario row and a mutation. See [EFFECTS.md](../../docs/duel-client/EFFECTS.md).

## Card scenario tests

`src/testing/scenario.ts` turns table rows into vitest cases on top of the `Harness`. A row names
one card, lays out both seats (`me` is seat 0 and active; `opp` is seat 1), replays steps, and
states the resulting board:

```ts
{
  card: "OP01-011", name: "accept: places a hand card at the bottom and draws",
  me: { hand: ["OP01-011", "ST01-003"], don: { active: 2 }, deckTop: ["OP01-010"] },
  steps: [{ play: "OP01-011" }, { accept: true }],
  expect: { me: { hand: ["OP01-010"], field: ["OP01-011"], deckDelta: 0 } },
}
```

Steps: `play`, `counter`, `attack`, `passBlock`, `passBattle`, `activate`, `accept`, `decline`,
`pick` (definition ids or option labels), `endTurn`; `play`, `activate` and `attack` take
`rejects: true` to assert the intent is refused. Expectations cover hand, field, stage, Life (count or
cards, plus `faceUp`), trash, deck size/top, DON!!, rested Characters, power, attached DON!!,
keywords, legal blockers, the pending choice type, and the winner. Hand, field and trash compare as
multisets, so write exact ids.

Rows live in `src/__tests__/scenarios/*.test.ts` and run as `"<card> <name>"`. Every optional
"you may" / "if you do" card gets an accept row and a decline row; give rows data that tells the right
answer from the wrong one (a target just outside the filter, a condition one short). Each row needs a
mutation in `tools/mutation-check/suites/rules.cjs` (the `scn-` entries patch the card's generated
abilities or `manualAbilities.ts`) that names it in `kills`.

## Encoding clarifications

| Topic | Choice |
|-------|--------|
| Life stack | `life[0]` = next damage card |
| Given DON!! power | +1000 only on controller’s turn |
| `activate_ability` | Generic Activate:Main for a Leader, Character or Stage: `sourceId` + `abilityId` (+ optional `targetId`) |
| `give_don` | Still requires an **unrested** cost-area DON!! (standard attach) |
| Unsupported clauses | Reported as `partial` / `unsupported` in `EFFECT_CATALOG`; the engine never invents behavior for them |

## Known gaps (vs full Comprehensive Rules)

The authoritative, current list is the code: run `npm run scenario-coverage` for supported cards no test mentions, and read `EFFECT_CATALOG` / `summarizeEffectCoverage()` for the clauses the engine does not resolve. Keywords such as Double Attack and Banish are supported (`src/effects/types.ts`).

- Clauses the compiler cannot express and no manual override covers stay `partial` or `unsupported`; cosmetics-only cards are `unverified`.
- Ranked rooms reject decks containing `partial`, `unsupported` or `unverified` cards; unranked rooms retain prototype deck freedom.
- No timer / disconnect / multiplayer transport (owned by game-server).

## Manuals

- [Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)  
- [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)  
- [Effects catalog & resolution order](../../docs/duel-client/EFFECTS.md)  
