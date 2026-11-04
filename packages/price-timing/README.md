# `@optcg/price-timing` — "when to buy" for a card

Pure logic (no React, no network), shared by the deck planner (`frontend/`, the price history panel) and Log Pose (`analyst/`, the `price_history` tool).

| Export | What |
|--------|------|
| `artKind(name, rarity?)` | `chase` / `alt` / `baseRare` / `other` from a TCGPlayer product name |
| `typicalCurve(kind)`, `expectedRatio(kind, day)` | Median price as % of release-day price, by days since release (924 singles, OP06-OP17, EB01-EB05, PRB-01/02, 2024-02 to 2026-11) |
| `buyTiming({ kind, released, today, points, current })` | `wait` / `soon` / `good` / `holds` / `unknown`, a headline and reasons |

The curves are typical patterns of past sets, not forecasts. Tests: `npm run test:price-timing` from the repo root. Mutation proofs: `node tools/mutation-check/run.cjs price-timing`.
