# OPTCG Digital Duel Client — Planning Index

This directory is the **source of truth** for the digital duel client (product B): a real-time, authoritative One Piece TCG–style duel experience on iPhone first, Android + **web** later, developable without a Mac.

## How to use these plans

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for the system shape and stack.
2. Read [DECISIONS.md](./DECISIONS.md) for why each major choice was made.
3. Implement **one step at a time**. Before writing code for a step, that step’s plan must be reviewed and marked ready (see checklist inside each step file).
4. Do not start step *N+1* until step *N* meets its acceptance criteria (unless the step plan explicitly allows parallel work).

## Repository layout (scaffold)

```
mobile/                 Expo React Native duel client (iOS-first; web via RN-web export)
game-server/            Colyseus authoritative match runtime
packages/rules/         Shared, headless rules engine + tests
backend/                Existing FastAPI — accounts, decks, catalog, ratings API
frontend/               Existing Vite deck planner (companion web; not the duel UI)
docs/duel-client/       Architecture + per-step plans (this tree)
```

## Steps

| Step | Plan | Goal |
|------|------|------|
| 1 | [steps/01-rules-engine.md](./steps/01-rules-engine.md) | Headless **official OPTCG** rules engine + CI simulations (**implemented**) |
| 2 | [steps/02-game-server.md](./steps/02-game-server.md) | Authoritative Colyseus duel room (tiny card subset) (**implemented**) |
| 3 | [steps/03-expo-client-board.md](./steps/03-expo-client-board.md) | Expo board + curated real OPTCG cards (**implemented**) |
| 3.5 | [steps/03.5-curated-card-audit.md](./steps/03.5-curated-card-audit.md) | Fix Step 3 misencoded prints + ST01-001 Activate:Main + intent labels (**implemented**) |
| 4 | [steps/04-matchmaking-reconnect-ranked.md](./steps/04-matchmaking-reconnect-ranked.md) | Matchmaking, reconnect, ranked + **browser-capable** lobby auth |
| 4.5 | [steps/04.5-web-deploy.md](./steps/04.5-web-deploy.md) | **Expo web → Vercel staging** deploy + CORS/WSS (**plan ready**) |
| 5 | [steps/05-content-spectate-android.md](./steps/05-content-spectate-android.md) | Broader cards, spectate, Android, **production web polish** |

### Web deploy placement (ADR-014)

Not a single step — **three slices**:

1. **Step 4** — bearer tokens + local web smoke (no Vercel required).  
2. **Step 4.5** — staging HTTPS URL on a **separate** Vercel project from the deck planner.  
3. **Step 5** — desktop UX + production domain + legal flags.

Colyseus stays on a persistent Node host; only the static Expo export lands on Vercel.

## Non-goals (program-wide)

- Replacing the existing deck planner SPA in this repo’s first release.
- Merging the duel board into the Vite `frontend/` app.
- Client-authoritative rules or REST-polled turns.
- Requiring a Mac for day-to-day development or App Store submission (use EAS).
- Running Colyseus on Vercel serverless.

## Legal / IP

Bandai Namco owns One Piece TCG IP, official card text, and art. Treat early builds as **private prototypes** with data-driven card definitions so assets and wording can be swapped or licensed. Do not ship a public App Store or public web build that presents itself as an official OPTCG client without appropriate rights.
