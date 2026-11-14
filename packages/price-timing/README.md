# `@optcg/price-timing` — "when to buy" for a card

Pure logic (no React, no network), shared by the deck planner (`frontend/`, the price history panel) and Log Pose (`analyst/`, the `price_history` tool).

| Export | What |
|--------|------|
| `artKind(name, rarity?)` | `chase` / `alt` / `baseRare` / `other` from a TCGPlayer product name |
| `typicalCurve(kind)`, `expectedRatio(kind, day)` | Median price as % of release-day price, by days since release (924 singles, OP06-OP17, EB01-EB05, PRB-01/02, 2024-02 to 2026-11) |
| `SEASON_PCT`, `seasonFactor(iso)` | Older cards' price level against their yearly average by calendar month (Jan first, percent), and the factor on a date: 1 + that, interpolated linearly between mid-months. Only two winters of data (2024-25, 2025-26) |
| `expectedPrice(kind, released, date, reprint?)` | Relative expected price on a date: the release curve times the season (times 0.9 from a month after a reprint). Only ratios of two of these mean anything |
| `buyTiming({ kind, released, today, points, current, reprints? })` | `wait` / `soon` / `good` / `holds` / `unknown`, a headline and reasons. The drop is the fall of the expected price over the next 180 days, curve and season together. Cards under $0.50 are bulk (`good`); a later plain reprint within 120 days means `wait` |
| `ESTIMATE_BAND`, `estimateBand(kind, ageDays, horizonDays)` | Multipliers [low, high] for the middle half (25th to 75th percentile) of how far real prices landed from the estimate, by months ahead (interpolated, flat past 6 months); wider for chase and for cards under 60 days old. Monthly averages of cards worth $1 or more, 2024-02 to 2026-11 |
| `bestTimeToBuy(same input)` | `now` or a 60-day window: the earliest weekly start within 2% of the cheapest 30-day average expected price over the next 240 days, never before the card is buyable or a month after an upcoming reprint. The estimate (`estMid`) comes with that band as `estLow`-`estHigh` |

The curves are typical patterns of past sets, not forecasts. Tests: `npm run test:price-timing` from the repo root. Mutation proofs: `node tools/mutation-check/run.cjs price-timing`.
