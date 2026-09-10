# game-server/ — Authoritative duel runtime (Colyseus)

Placeholder for the **Colyseus** TypeScript match server.

**Do not implement until** [Step 2 plan](../docs/duel-client/steps/02-game-server.md) passes its **Ready for development** checklist.

Step 1 (`packages/rules`) is complete. The Step 2 plan is **plan ready** — implementation should use branch `cursor/duel-game-server-afeb` (or similar) and follow that doc.

## Planned stack

- Colyseus ^0.18 (TypeScript), single process on `0.0.0.0:2567`
- Depends on `@optcg/rules` via root npm workspaces
- Message protocol `protocolVersion: 1` (private views — no full `MatchState` Schema sync)
- Dev join auth only; Redis before multi-instance (Step 4)

## See also

- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [ADR-003 / ADR-011](../docs/duel-client/DECISIONS.md)
- [Step 2 plan](../docs/duel-client/steps/02-game-server.md)
