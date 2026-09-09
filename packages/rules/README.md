# packages/rules — Headless duel rules engine

Shared **pure TypeScript** rules package for the digital duel client.

**Step 1 plan status:** [ready for development](../../docs/duel-client/steps/01-rules-engine.md) — implement from that plan (do not invent scope beyond it).

## Planned responsibilities

- Deterministic `createMatch` / `applyIntent` / `getViewForPlayer` / `listLegalIntents`
- Data-driven card definitions (6 placeholder cards in Step 1)
- Unit tests (Vitest) + batch match simulator (`npm run sim`)
- No React Native, Colyseus, or FastAPI imports

## See also

- [Step 1 implementation plan](../../docs/duel-client/steps/01-rules-engine.md)
- [Architecture](../../docs/duel-client/ARCHITECTURE.md)
