# Architecture decisions — Duel client

Record of durable choices. Change these only by updating this file and the affected step plans **before** implementing the change.

## ADR-001 — Product is a digital duel client (B)

**Decision:** Build a realtime duel client, not a mobile-only deck planner.

**Consequences:** Requires authoritative game server, rules engine, and WebSockets; deck planner remains a companion.

## ADR-002 — Native client = Expo (React Native) + EAS; web client = separate frontend

**Decision:** **iOS-first** (and later Android) ship from Expo in `mobile/` via EAS. The **browser** product is a **dedicated web frontend** (see ADR-014), not “Expo exported to the store of the web.”

**Why:** No Mac required for cloud iOS builds/submit; team already uses React Native for phones. Web users need a Vite/Vercel-native SPA, not a phone shell in the browser.

**Consequences:** Prefer Expo SDK modules on native; web features land in `duel-web/`. Apple Developer Program still required for store. Local `expo start --web` may remain a **dev smoke** only.

## ADR-003 — Game server = Colyseus (TypeScript) for v1

**Decision:** Authoritative matches run in Colyseus rooms.

**Why:** Fastest path next to a TypeScript rules package; room model maps cleanly to “one duel”; Redis horizontal scaling is documented.

**Alternatives considered:**

- **Nakama** — stronger batteries (matchmaking, leaderboards, scale). Re-evaluate if Colyseus ops or matchmaking complexity becomes the bottleneck (see Step 4 exit criteria).
- **FastAPI WebSockets only** — rejected as primary duel runtime; poorer room tooling and scaling story for many concurrent matches.
- **Unity / Photon** — rejected as default; heavier for 2D TCG and worse fit for no-Mac Expo workflow.

**Step 4 checkpoint (2026-09):** Stay on Colyseus. Ranked FIFO queue, reconnect grace, and FastAPI Elo/leaderboard ingest met the step without Nakama. Next revisit trigger: multi-instance matchmaking pain or lobby feature gaps before/during Step 5.

## ADR-004 — Rules live in `packages/rules` (pure TS)

**Decision:** All legality and resolution logic is a headless library with tests and sims.

**Why:** CI can run thousands of duels without UI; game server and future tools share one source of truth; determinism aids debugging.

## ADR-005 — FastAPI remains the meta API

**Decision:** Accounts, decks, catalog, and durable ratings stay on existing FastAPI + Postgres.

**Why:** Avoid rewriting working auth/deck domain; duel runtime stays focused on hot match state.

## ADR-006 — Redis is required before multi-instance game servers

**Decision:** Single-process Colyseus is OK for Step 2 local/dev; Redis is mandatory before horizontal scale / production multi-instance (Step 4).

## ADR-007 — Client sends intents only

**Decision:** Protocol is intent → server validate → event/diff. No client-trusted shuffle, damage, or hidden info.

## ADR-008 — IP / content strategy

**Decision:** Data-driven card definitions; prototype with subset / placeholder art; no public “official OPTCG” store listing without rights.

## ADR-009 — Stepwise delivery with plan gates

**Decision:** Each numbered step has its own plan under `docs/duel-client/steps/`. Implementation of a step starts only after that plan’s **Ready for development** checklist is complete.

## ADR-010 — Step 1 rules slice (locked at plan gate)

**Decision:** Step 1 ships a **headless engine that follows official OPTCG rules** (Rule Manual + Comprehensive Rules as authority). Victory, turn phases, DON!! economy, Life cards, and battle steps (Attack → Block → Counter → Damage → End) must match the manuals — **not** a simplified house ruleset. Content remains a **tiny placeholder card subset** so implementation stays finite; missing keywords are omitted or listed as known gaps, never replaced with contradictory shortcuts (e.g. auto-loss at 0 Life without a successful Leader battle).

**Tooling:** **Vitest** in a **standalone** `packages/rules` package; workspaces deferred to Step 2.

**Why:** Product is a digital duel client; incorrect core rules would poison every later step. Placeholder cards keep scope bounded without sacrificing rules fidelity.

**See:** `steps/01-rules-engine.md`.

## ADR-011 — Step 2 game server slice (locked at plan gate)

**Decision:** Step 2 ships a **single-process Colyseus** room (`"duel"`) that imports `@optcg/rules`, seats two players, and speaks **message-based** `protocolVersion: 1` (intent → per-seat `view` / `events`). Private zones are **never** placed in shared Colyseus Schema state. Auth is **dev-only** (`devUserId` + optional `DEV_JOIN_SECRET`). Decks default to Step 1 placeholders. Root **npm workspaces** link `packages/*` and `game-server` only (exclude `frontend/`). Redis, FastAPI game tokens, reconnect, and Expo remain later steps.

**Why:** Hidden-info TCG needs private views; Colyseus Schema sync of full match state would leak or fight privacy. Dev auth unblocks local/CI without meta-API coupling. Workspaces enable `import "@optcg/rules"` without publishing.

**See:** `steps/02-game-server.md`.

## ADR-012 — Step 3 Expo board + curated real cards (locked at plan gate)

**Decision:** Step 3 ships an **Expo Router** iOS-first app in `mobile/` that speaks Step 2 `protocolVersion: 1` via `@colyseus/sdk`. The board is a **pure renderer** of server `welcome` / `view` / `events` / `error` / `match_over`; intents are chosen from `view.legalIntents` (no `@optcg/rules` on device for legality). Auth is **devUserId-only**; join flow is **create or paste room id**. `mobile/` stays **outside** root npm workspaces.

**Card content:** Step 3 also lands a **curated real OPTCG id set** in `@optcg/rules` (official numbers, names, TCGPlayer art URLs, mechanics limited to keywords the engine already supports). Default duels use those ids. Full-set / every-keyword expansion and public licensed builds remain Step 5. Cosmetics are delivered to the client via a generated **card atlas** keyed by `defId` — not via Postgres catalog on the intent path.

**Why:** Proves the vertical slice on a real phone with recognizable cards, without Mac builds, without coupling Expo’s toolchain to the Node game-server workspace, without trusting the client with rules, and without boiling the ocean on the full card pool.

**See:** `steps/03-expo-client-board.md`.

## ADR-013 — Step 3.5 curated-card audit (locked at plan gate)

**Decision:** Step 3.5 is a **fidelity patch**, not a feature expansion. Every curated real id on the duel happy path must match its printed English identity (number, name, cost, power, counter, encoded keywords). Misencoded Step 3 cards are **corrected or removed** — never left as silent house rules. Unsupported prints (Rush, Main KO, Stage Activate:Main, fabricated OP ids) are omitted until Step 5.

**Engine:** Add one hook for ST01-001 `[Activate: Main] [Once Per Turn]` — give up to 1 **rested** DON!! from the cost area to the Leader or a Character. Intent type `activate_leader` over wire `protocolVersion: 1` (no protocol version bump).

**Client:** Intent labels resolve atlas names for hand/field targets; legality remains server-only.

**Why:** Step 3 exit notes and a print audit showed wrong names/effects (e.g. Jet Pistol encoded as draw). Shipping recognizable but incorrect cards poisons demos and violates Step 1 authority order.

**See:** `steps/03.5-curated-card-audit.md`.

## ADR-014 — Duel web frontend (`duel-web/`) on Vercel; split across Steps 4 / 4.5 / 5

**Decision:** The web-app version of the duel product gets its **own frontend**: a **Vite + React SPA** in **`duel-web/`**, deployed to a **separate Vercel project** from the deck planner (`frontend/` + root `vercel.json`). It speaks the same Colyseus **intent → view** protocol as Expo `mobile/`, consumes the same **card atlas**, and never imports `@optcg/rules` for legality. Colyseus stays on a **persistent Node host** (not Vercel serverless).

Work is **split across three plan slices**:

| Slice | Web responsibility |
|-------|-------------------|
| **Step 4** | Make lobby/matchmaking **browser-capable** (bearer game tokens, CORS-ready server hooks). Local browser smoke may use Vite `duel-web` once scaffolded, or temporary Expo web — product UI is still `duel-web/` |
| **Step 4.5** | **Scaffold + staging deploy** of `duel-web/` to Vercel; WSS to staging game server; shareable HTTPS URL |
| **Step 5** | **Production web polish** on `duel-web/` (desktop layout, production domain, legal/IP flags); alongside Android + spectate + content |

**Why:** Product asks for a real **web frontend**, not only an Expo static export. Keeping it out of `frontend/` preserves the deck planner’s release train. Vite matches existing Vercel ops. Two UIs (Expo + Vite) are acceptable if both stay dumb renderers of server views.

**Rejected alternatives:**

- Expo `export --platform web` as the shipped web product — rejected as the **primary** web UI (OK for local smoke only).
- Merge duel into `frontend/` deck planner — rejected (different product, cadence, and risk to shopping SPA).
- Host Colyseus on Vercel serverless — rejected (sticky long-lived rooms).
- Single mega-step for “all web” — rejected (poor gating).

**See:** `steps/04-matchmaking-reconnect-ranked.md`, `steps/04.5-web-deploy.md`, `steps/05-content-spectate-android.md`.
