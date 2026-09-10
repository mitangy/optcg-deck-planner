# `@optcg/rules` — Headless OPTCG rules engine

Deterministic TypeScript rules package for the digital duel client (Step 1 + Step 3 card content).

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
- Battle: Attack → Block → Counter → Damage  
- Victory: win Leader battle at **0 Life**; or opponent **deck-out**  
- Privacy: `getPlayerView` hides opponent hand ids, deck order, Life faces, DON!! deck order  

## Step 3 curated real cards

Default duels use official card numbers (ST01 / OP01). Mechanics are limited to keywords the engine already encodes.

| ID | Name | Role / hooks |
|----|------|----------------|
| `ST01-001` | Monkey.D.Luffy | Leader 5000 / Life 5 (printed Activate: Main not modeled — Known gap) |
| `ST01-002` | Monkey.D.Luffy | Character 1 / 2000 / Counter 1000 |
| `ST01-003` | Roronoa Zoro | Character 3 / 4000 / Counter 1000 |
| `ST01-004` | Nami | Character 1 / 2000 / Counter 1000 |
| `ST01-005` | Usopp | Character 2 / 3000 / Counter 1000 |
| `ST01-006` | Sanji | Character 2 / 3000 / **Blocker** |
| `ST01-007` | TonyTony.Chopper | Character 1 / 1000 / **Blocker** |
| `OP01-013` | Trafalgar Law | Character 1 / 2000 / Counter 1000 / **Trigger draw 1** |
| `ST01-014` | Gum-Gum Jet Pistol | Main event / **draw 1** |
| `ST01-015` | Gum-Gum Balloon | Counter event / **+1000** |
| `OP01-031` | Radical Beam!! | Counter event / **+1000** |
| `ST01-017` | Thousand Sunny | Stage / Leader **+1000** |

Art URLs point at Bandai EN cardlist images for private prototypes. Clients should consume `buildCardAtlas()` / `export-atlas` JSON — not invent legality from cosmetics.

Decks in tests/sims use **20 cards** (≤4 copies each) from this set — not full 50-card constructed.

## Encoding clarifications

| Topic | Choice |
|-------|--------|
| Life stack | `life[0]` = next damage card |
| Given DON!! power | +1000 only on controller’s turn |
| Unsupported keywords | Omitted from subset (see Known gaps) |

## Known gaps (vs full Comprehensive Rules)

- Keywords not on the subset (Rush, Double Attack, Banish, complex Activate: Main, etc.)  
- `ST01-001` printed Activate: Main DON!! −1 power buff is **not** implemented  
- No full 50-card / color-identity / 4-of constructed validation yet  
- Trigger handling is minimal (draw fixture / `triggerDraw` only)  
- No timer / disconnect / multiplayer transport (owned by game-server / later steps)  

## Manuals

- [Rule Manual](https://en.onepiece-cardgame.com/pdf/rule_manual.pdf)  
- [Comprehensive Rules](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)  
