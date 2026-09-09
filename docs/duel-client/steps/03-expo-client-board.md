# Step 3 — Expo client board (`mobile/`)

**Status:** `planned` (not started)  
**Depends on:** Step 2 acceptance criteria met  
**Unlocks:** Step 4 (UX polish of ranked/lobby can overlap lightly if gated)

## Ready for development (gate)

- [ ] Step 2 protocol frozen enough for a client (`protocolVersion` noted)
- [ ] EAS project stub decision: create Expo app now vs local-only first week
- [ ] Minimal board wireframe agreed (zones to show for subset)
- [ ] Dev login path for mobile ↔ FastAPI agreed (reuse cookie/token story)
- [ ] Checklist complete before coding

## Goal

Ship an **Expo iOS-first client** that connects to the Colyseus duel room, renders the player’s view, and sends intents for the Step 1 card subset. A developer can play a duel on a **physical iPhone** without a Mac (Expo Go or EAS development build).

## In scope

- Expo app scaffold in `mobile/` (Expo Router).
- Screens: splash/sign-in (dev), “join duel” (room id / create), duel board.
- Colyseus client integration matching Step 2 protocol.
- Board UI sufficient for subset: hand, field, life/DON, phase indicator, end/pass controls.
- Basic feedback for illegal intents (toast/banner from `error` messages).
- README: run against local game-server + API; EAS notes for device builds.
- Optional: load a deck summary from existing FastAPI if auth is easy; otherwise hardcode Step 1 test decks in-client for the vertical slice.

## Out of scope

- Polished animation system / full card art pipeline (placeholders OK).
- Matchmaking queue UX (Step 4).
- Ranked ratings display (Step 4).
- Android Play listing (Step 5); Android run smoke optional.
- App Store production submit.

## Deliverables

| Artifact | Location |
|----------|----------|
| Expo app | `mobile/**` |
| Duel board UI | `mobile/app/**` or `mobile/src/**` |
| Client protocol adapter | e.g. `mobile/src/net/duelClient.ts` |
| Updated README | `mobile/README.md` |
| Short manual test notes | section in README or `docs/duel-client/steps/` exit notes |

## Technical approach

1. `create-expo-app` in `mobile/`; TypeScript strict.
2. Config for `EXPO_PUBLIC_GAME_SERVER_URL` and API base URL.
3. Thin adapter: connect → handle `welcome` / `view` / `events` / `error` / `match_over`.
4. Board as pure rendering of `view` + local UI selection state; never apply rules locally except optimistic highlights that reset on server `view`.
5. Device test path: Expo Go if protocol/native deps allow; else EAS development build per AGENTS-style cloud playbook later.
6. Reuse existing design restraint: this is a game table, not a dashboard — one clear board composition.

### UI polish (when board exists)

Follow repo `CLAUDE.md` spirit where applicable: no layout jump on open panels, stable hit targets, check ~375px width. Prefer scripted device screenshots over flaky manual-only proof when available.

## Acceptance criteria

- [ ] Two devices or one device + one scripted client can finish a duel.
- [ ] Board updates only from server views/events.
- [ ] Opponent hand content never appears in UI state from server payloads.
- [ ] App runs on physical iPhone without requiring a Mac for the build used in testing.
- [ ] `mobile/README.md` documents env vars and local run.

## Risks

| Risk | Mitigation |
|------|------------|
| Expo Go limits | Budget EAS dev client early if native WS/certs need it |
| Token/cookie mismatch with FastAPI | Dev bypass join codes for Step 3; real auth Step 4 |
| Over-building UI | Stick to subset zones only |

## Open questions

- Join flow: auto-create room vs paste room id for v1?
- Navigation library defaults (Expo Router) confirmed?

## Exit notes (fill when step completes)

- Build profile used (Expo Go / EAS dev):
- Screens recorded / screenshots path:
- Protocol gaps found:
