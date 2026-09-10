# `@optcg/rules` — Headless OPTCG rules engine

Deterministic TypeScript rules package for the digital duel client (Step 1).

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
assertInvariants(state)
skipMulligans(state, rng)
createSeededRng(seed)
buildTestDeck(size?)
```

## Scripts

```bash
npm install
npm test
npm run typecheck
npm run sim          # ≥100 random games
SIM_GAMES=200 npm run sim
```

## Official structure implemented

- Zones: Leader, Characters (max 5), Stage (max 1), Deck, Trash, Life, Hand, DON!! deck, Cost area  
- Turn: Refresh → Draw → DON!! → Main → End  
- First-turn: no draw / 1 DON!! for first player; **no attacks on each player’s first turn**  
- Costs: rest active DON!! in cost area  
- Give DON!!: +1000 power on controller’s turn; returned active on Refresh; rested if character leaves  
- Battle: Attack → Block → Counter → Damage  
- Victory: win Leader battle at **0 Life**; or opponent **deck-out**  
- Privacy: `getPlayerView` hides opponent hand ids, deck order, Life faces, DON!! deck order  

## Step 1 card subset (placeholders)

| ID | Role |
|----|------|
| `leader_red_5k` | Leader 5000 / Life 5 |
| `char_vanilla_2k` | Character 1 / 2000 / Counter 1000 |
| `char_curve_4k` | Character 3 / 4000 / Counter 1000 |
| `char_blocker_3k` | Character 2 / 3000 / Blocker |
| `event_main_draw` | Main event: draw 1 |
| `event_counter_1k` | Counter event: +1000 |
| `stage_small_buff` | Stage: Leader +1000 |
| `char_trigger_draw` | Fixture Trigger (tests) |

Decks in tests/sims use **20 cards** (≤4 copies each) from this subset — not full 50-card constructed. The engine still models official Life/DON!!/battle flow.

## Encoding clarifications

| Topic | Choice |
|-------|--------|
| Life stack | `life[0]` = next damage card |
| Given DON!! power | +1000 only on controller’s turn |
| Unsupported keywords | Omitted from subset (see Known gaps) |

## Known gaps (vs full Comprehensive Rules)

- Keywords not on the subset (Rush, Double Attack, Banish, complex Activate: Main, etc.)  
- No full 50-card / color-identity / 4-of constructed validation yet  
- Trigger handling is minimal (draw fixture only)  
- No timer / disconnect / multiplayer transport (Step 2+)  

## Manuals

- [Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)  
- [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)  
