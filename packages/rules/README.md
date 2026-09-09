# packages/rules — Headless OPTCG rules engine

Shared **pure TypeScript** rules package for the digital duel client.

**Step 1 plan status:** [ready for development](../../docs/duel-client/steps/01-rules-engine.md) — implement from that plan.

## Rules fidelity

Follow **official ONE PIECE CARD GAME** rules (Rule Manual + Comprehensive Rules). Do not implement a simplified house ruleset. Step 1 still uses a **tiny placeholder card subset**; missing keywords are gaps, not replacements for core turn/battle/DON!!/Life/victory rules.

## Planned responsibilities

- Deterministic `createMatch` / `applyIntent` / `getViewForPlayer` / `listLegalIntents`
- Official turn + battle structure; data-driven card definitions
- Unit tests (Vitest) + batch match simulator (`npm run sim`)
- No React Native, Colyseus, or FastAPI imports

## See also

- [Step 1 implementation plan](../../docs/duel-client/steps/01-rules-engine.md)
- [Architecture](../../docs/duel-client/ARCHITECTURE.md)
- [ADR-010](../../docs/duel-client/DECISIONS.md)
