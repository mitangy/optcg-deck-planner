# mobile/ — OPTCG Duel Client (Expo)

Placeholder for the **Expo (React Native)** iPhone-first duel client.

**Step 3 plan is plan ready** — see [Step 3 plan](../docs/duel-client/steps/03-expo-client-board.md). Implement on branch `cursor/duel-expo-client-afeb` (or similar).

## Planned stack

- Expo + Expo Router (TypeScript)
- `@colyseus/sdk` ^0.18 → `game-server` room `"duel"` (`protocolVersion: 1`)
- Dev join via `devUserId` (FastAPI auth in Step 4)
- **Curated real OPTCG cards** (official ids / names / art) via card atlas from `@optcg/rules`
- EAS Build / Submit stubs (no Mac required)

## Outside root workspaces

Install with `cd mobile && npm install` — do **not** add `mobile/` to the root npm workspaces (keeps Expo’s toolchain separate from `game-server`).

## See also

- [Architecture](../docs/duel-client/ARCHITECTURE.md)
- [ADR-002 / ADR-012](../docs/duel-client/DECISIONS.md)
- [Step 3 plan](../docs/duel-client/steps/03-expo-client-board.md) (includes § Real cards slice)
- [Step 2 protocol](../docs/duel-client/steps/02-game-server.md)
