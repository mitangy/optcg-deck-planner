# Content contribution guide

How to add a playable OPTCG card to the digital duel without changing the Colyseus wire protocol.

## Pipeline

1. **Encode the print** in `packages/rules/src/cards/definitions.ts` as a `CardDef`.
   - Use the official English card number as `id` (e.g. `ST01-004`).
   - Only set engine hooks that match the printed text 1:1 (`blocker`, `rush`, `counterPowerBonus`, `leaderActivateGiveRestedDon`, `eventTiming`, `mainDraw`, `triggerDraw`, `stageLeaderPowerBonus`, …).
   - If the print needs an unsupported keyword, **omit the card** until the engine grows — do not invent silent house rules.
2. **Tests** — update `packages/rules/src/__tests__/definitions.test.ts` and add engine coverage when introducing a new keyword.
3. **Sims** — `cd packages/rules && npm test && npm run sim`.
4. **Atlas** — `cd packages/rules && npm run export-atlas` (writes mobile + `duel-web` atlas JSON).
5. **Web arts** — Prefer TCGPlayer CDN URLs (same as the deck planner). Map product ids in `packages/rules/src/cards/tcgProducts.ts`; `localArt()` / atlas export emit `https://tcgplayer-cdn.tcgplayer.com/product/{id}_400w.jpg`. Clients rewrite to `_in_1000x1000` for inspect via `duel-web/src/cards/cardImage.ts` (mirrors `frontend/src/cardImage.ts`). Bandai CDN blocks browser hotlink (CORP) — do not ship `onepiece-cardgame.com` in `imageUrl`. Fall back to local `/cards/{id}.png` only when no product id is mapped yet. **Stub defs must use the printed name/cost/type for that card number** so CDN art matches the caption (scrambled placeholder names look like “wrong artwork”).
6. **Ship** — no protocol / room changes required; clients already render by `defId`.

## Keyword budget (Step 5)

| Keyword / hook | Status | Example |
|----------------|--------|---------|
| Blocker | shipped | ST01-006 Chopper |
| Counter event bonus | shipped | ST01-014 Guard Point |
| Leader Activate:Main (rested DON!!) | shipped | ST01-001 Luffy |
| **Rush** (+ summoning sickness) | **Step 5** | **ST01-004 Sanji** |
| Main/Trigger draw | engine-ready, unused | — |
| Stage leader power | engine-ready, unused | — |
| Double Attack, Banish, DON!!×N, Main KO, On Play | not yet | deferred |

## Legal / IP

Private prototype only. Public builds must gate real names/art via client flags (`VITE_SHOW_OFFICIAL_IDENTITY` / `EXPO_PUBLIC_SHOW_OFFICIAL_IDENTITY`) until rights review (ADR-008).
