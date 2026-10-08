# `@optcg/rules` — Headless OPTCG rules engine

Deterministic TypeScript rules package for the digital duel client (Step 1 + Step 3.5 curated cards).

## Authority

1. Card text on a definition  
2. OPTCG Comprehensive Rules  
3. OPTCG Rule Manual / play guide  
4. Encoding clarifications below (never silent house rules)

## Public API

```ts
createMatch(config)
applyIntent(state, intent, { seat, rng })
listLegalIntents(state, seat)
getPlayerView(state, seat)
getSpectatorView(state, cameraSeat?)
assertInvariants(state)
skipMulligans(state, rng)
createSeededRng(seed)
buildTestDeck(size?)
buildCardAtlas()
DEFAULT_LEADER_ID
```

## Scripts

```bash
npm install
npm test
npm run typecheck
npm run sim          # ≥100 random games
npm run export-atlas # writes mobile/assets/cardAtlas.json
SIM_GAMES=200 npm run sim
npm run scenario-coverage             # supported cards no test mentions, by set (a to-do list, not a gate)
npm run scenario-coverage -- --summary OP01 EB01
npm run bench:views                   # µs per move: applyIntent, and both seats' views with and without the query cache
npm run bench:views -- --gate         # CI: exit 1 unless cached views are ≥1.8x faster than uncached
```

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
- Leader Activate:Main (`activate_ability` / legacy `activate_leader`): attach 1 **rested** cost-area DON!! once per turn (cleared at `beginTurn`)  
- Stage Activate:Main (`activate_ability` + `stage_trash_give_rested_don`): trash Stage, then attach 1 rested DON!! (OP16-021)  
- Battle: Attack → Block → Counter → Damage  
- Victory: win Leader battle at **0 Life**; or opponent **deck-out**  
- Privacy: `getPlayerView` hides opponent hand ids, deck order, Life faces, DON!! deck order  

## Curated card definitions

Card definitions cover the whole catalog: abilities are generated from official text
(`src/cards/generated/abilities.json`) with reviewed overrides in `src/cards/manualAbilities.ts`.
`EFFECT_CATALOG` records each printed clause as implemented, partial, keyword-only, or stub. Default
test duels use only cards whose full support status is `none`, `keywords`, or `ok`. The table below
lists the original hand-curated starter cards.

| ID | Name | Role / hooks |
|----|------|----------------|
| `ST01-001` | Monkey.D.Luffy | Leader 5000 / Life 5 / **Activate:Main** give 1 rested DON!! (`activate_ability`) |
| `OP16-021` | Moby Dick | Stage / partial: leader-gated On Play search works; Activate:Main still requires a target instead of allowing zero |
| `ST01-003` | Karoo | Character 1 / 3000 / Counter 1000 |
| `ST01-006` | TonyTony.Chopper | Character 1 / 1000 / **Blocker** |
| `ST01-008` | Nico Robin | Character 3 / 5000 / Counter 1000 |
| `ST01-009` | Nefeltari Vivi | Character 2 / 4000 / Counter 1000 |
| `ST01-014` | Guard Point | Partial: Counter +3000 works; Trigger and target choice do not |

Art URLs prefer TCGPlayer CDN and remain display-only. Clients consume
`buildCardAtlas()` / `export-atlas` JSON and never infer legality from cosmetics.

Decks in tests/sims use **20 cards** (≤4 copies each) from this set — not full 50-card constructed.

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
| `activate_ability` | Generic Activate:Main — `sourceId` + `abilityId` (+ optional `targetId`). Luffy: `leader_give_rested_don`; Moby Dick: `stage_trash_give_rested_don` |
| `activate_leader` | Legacy Luffy Activate:Main (still applied); prefer `activate_ability` |
| `give_don` | Still requires an **unrested** cost-area DON!! (standard attach) |
| Unsupported keywords | Omitted from subset (see Known gaps) |

## Known gaps (vs full Comprehensive Rules)

- Keywords not on the subset (Double Attack, Banish, DON!!×N When Attacking, Main KO events, etc.)  
- Unconditional Rush and ST01-004 Sanji's conditional DON!!×2 Rush are implemented.
- Thousand Sunny / Jet Pistol KO / other ST01 prints deferred until hooks exist  
- No full 50-card / color-identity / 4-of constructed validation yet  
- Trigger handling covers life-trigger draws, Leader bonuses, and selected Main/On Play activations for the verified subset; `hasTrigger` alone still marks eligibility without resolving unverified printed Trigger text.
- Private top-deck search, filtered selection, and remainder ordering are implemented for `OP09-095`, `OP09-099`, `OP16-021`, `OP09-096`, and `OP17-019`.
- OP17-112's continuous 4000-power Trigger aura and OP09-086's Blackbeard trash-scaling power modifier are implemented; OP09-086's effect-KO immunity remains partial until effect-based K.O. resolution is available.
- OP17-003 Rush: Character and its rested-target On Play debuff, plus OP17-005's conditional hand cost and OP17-005/OP17-008 Leader base-power replacements, are implemented.
- OP16-080's opponent-turn Character cost aura, OP09-118's zero-Life blocker win condition, OP16-104's attack power copy, OP14-108's conditional K.O., OP16-119's On Play Life search, and verified counter power penalties are implemented or explicitly marked partial where optional target restrictions remain.
- Battle and effect K.O. paths now fire the supported On K.O. draw hooks for the Blackbeard cards in the curated subset.
- OP16-118's +2000 hand Counter aura is enforced during Counter validation.
- Most curated OP09/OP16/OP17 character/event clauses are **documented stubs** in `EFFECT_CATALOG`; all other bundled catalog cards are explicitly `unverified`.
- Ranked rooms reject decks containing `partial`, `unsupported`, or `unverified` cards; unranked rooms retain prototype deck freedom.
- No timer / disconnect / multiplayer transport (owned by game-server / later steps).

## Manuals

- [Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)  
- [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)  
- [Effects catalog & resolution order](../../docs/duel-client/EFFECTS.md)  
