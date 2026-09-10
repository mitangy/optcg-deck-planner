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
```

## Official structure implemented

- Zones: Leader, Characters (max 5), Stage (max 1), Deck, Trash, Life, Hand, DON!! deck, Cost area  
- Turn: Refresh → Draw → DON!! → Main → End  
- First-turn: no draw / 1 DON!! for first player; **no attacks on each player’s first turn**  
- Costs: rest active DON!! in cost area  
- Give DON!!: +1000 power on controller’s turn; returned active on Refresh; rested if character leaves  
- Leader Activate:Main (`activate_leader`): attach 1 **rested** cost-area DON!! once per turn (cleared at `beginTurn`)  
- Battle: Attack → Block → Counter → Damage  
- Victory: win Leader battle at **0 Life**; or opponent **deck-out**  
- Privacy: `getPlayerView` hides opponent hand ids, deck order, Life faces, DON!! deck order  

## Step 3.5 curated real cards

Default duels use official ST01 numbers that map 1:1 onto engine hooks. Unsupported prints are omitted (not silent house rules).

| ID | Name | Role / hooks |
|----|------|----------------|
| `ST01-001` | Monkey.D.Luffy | Leader 5000 / Life 5 / **Activate:Main** give 1 rested DON!! (`activate_leader`) |
| `ST01-003` | Karoo | Character 1 / 3000 / Counter 1000 |
| `ST01-006` | TonyTony.Chopper | Character 1 / 1000 / **Blocker** |
| `ST01-008` | Nico Robin | Character 3 / 5000 / Counter 1000 |
| `ST01-009` | Nefeltari Vivi | Character 2 / 4000 / Counter 1000 |
| `ST01-014` | Guard Point | Counter event / **+3000** |

Art URLs point at Bandai EN cardlist images for private prototypes. Clients should consume `buildCardAtlas()` / `export-atlas` JSON — not invent legality from cosmetics.

Decks in tests/sims use **20 cards** (≤4 copies each) from this set — not full 50-card constructed.

## Encoding clarifications

| Topic | Choice |
|-------|--------|
| Life stack | `life[0]` = next damage card |
| Given DON!! power | +1000 only on controller’s turn |
| `activate_leader` | Attaches one **rested** cost-area DON!! to Leader or own Character; once per turn; flag clears at turn start (`beginTurn`) before Refresh |
| `give_don` | Still requires an **unrested** cost-area DON!! (standard attach) |
| Unsupported keywords | Omitted from subset (see Known gaps) |

## Known gaps (vs full Comprehensive Rules)

- Keywords not on the subset (Rush, Double Attack, Banish, DON!!×N When Attacking, Stage Activate:Main, Main KO events, etc.)  
- Thousand Sunny / Jet Pistol KO / other ST01 prints deferred until hooks exist  
- No full 50-card / color-identity / 4-of constructed validation yet  
- Trigger handling is minimal (`triggerDraw` only; no curated Trigger print in the default set)  
- No timer / disconnect / multiplayer transport (owned by game-server / later steps)  

## Manuals

- [Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)  
- [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)  
