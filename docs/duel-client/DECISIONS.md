# Architecture decisions — Duel client

Record of durable choices. Change these only by updating this file and the affected step plans **before** implementing the change.

## ADR-001 — Product is a digital duel client (B)

**Decision:** Build a realtime duel client, not a mobile-only deck planner.

**Consequences:** Requires authoritative game server, rules engine, and WebSockets; deck planner remains a companion.

## ADR-002 — Mobile = Expo (React Native) + EAS

**Decision:** iOS-first client in Expo; Android later from the same app.

**Why:** No Mac required for cloud iOS builds/submit; team already uses React; one codebase for Android.

**Consequences:** Prefer Expo SDK modules; custom native modules slow no-Mac iteration. Apple Developer Program still required.

## ADR-003 — Game server = Colyseus (TypeScript) for v1

**Decision:** Authoritative matches run in Colyseus rooms.

**Why:** Fastest path next to a TypeScript rules package; room model maps cleanly to “one duel”; Redis horizontal scaling is documented.

**Alternatives considered:**

- **Nakama** — stronger batteries (matchmaking, leaderboards, scale). Re-evaluate if Colyseus ops or matchmaking complexity becomes the bottleneck (see Step 4 exit criteria).
- **FastAPI WebSockets only** — rejected as primary duel runtime; poorer room tooling and scaling story for many concurrent matches.
- **Unity / Photon** — rejected as default; heavier for 2D TCG and worse fit for no-Mac Expo workflow.

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
