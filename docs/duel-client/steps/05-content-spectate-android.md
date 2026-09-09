# Step 5 — Content breadth, spectate, Android

**Status:** `planned` (not started)  
**Depends on:** Step 4 acceptance criteria met  
**Unblocks:** Public beta considerations (still subject to IP/legal)

## Ready for development (gate)

- [ ] Step 4 checkpoint (Colyseus vs Nakama) resolved in `DECISIONS.md` if changed
- [ ] Content plan: which sets/keywords added; art source policy confirmed
- [ ] Spectate privacy rules agreed (delay? hide hands? friend-only?)
- [ ] Android package id + Play Console access confirmed if store pass is in scope
- [ ] Checklist complete before coding

## Goal

Expand from the tiny subset toward a **playable broader card pool**, add **spectating**, and complete an **Android** build/store readiness pass on the same Expo app. Harden content pipeline so new cards are data + tests, not one-off server forks.

## In scope

- Grow `packages/rules` card definitions and keywords needed for the agreed sets; regression sims.
- Content pipeline docs: add card → tests → appear in server/client.
- Spectator mode: read-only room subscription; no hidden info; optional delay.
- Expo Android configuration; EAS Android build; basic Play internal testing track.
- Performance pass: board virtualization if needed, WS payload size, image caching.
- Client UX for set filters / deck validation against legal definitions.
- Security/privacy pass for wider testing (account deletion path, ToS placeholders).

## Out of scope

- Claiming official Bandai affiliation or shipping copyrighted text/art without rights.
- Esports tournament platform, replay marketplace, or economy/gems.
- iOS App Store **public** release if legal review is incomplete (TestFlight OK).
- Rewriting meta deck planner features unrelated to duel.

## Deliverables

| Artifact | Location |
|----------|----------|
| Expanded rules + tests | `packages/rules/**` |
| Spectate support | `game-server` + `mobile` |
| Android EAS profile | `mobile/eas.json` (or equiv) |
| Content contribution guide | `packages/rules/README.md` or `docs/duel-client/CONTENT.md` |
| Scale/load notes | short doc under `docs/duel-client/` |

## Technical approach

1. **Content:** prioritize keywords that unlock the most decks; keep effect hooks modular; golden-master sims for fixed seeds.
2. **Spectate:** join room with `role: spectator`; server sends public view only; cap spectator count per room.
3. **Android:** enable Android in Expo config; fix any iOS-only assumptions (safe areas, back gesture); EAS build + internal track.
4. **Load:** run a k6/artillery-style WS soak against staging (hundreds of connections) and record results in exit notes.
5. **Legal:** keep feature flags to disable real-world card names/art for public builds if required.

## Acceptance criteria

- [ ] Agreed card/keyword expansion ships with tests; sim suite still green.
- [ ] Spectator can watch a live duel without seeing either hand.
- [ ] Android build installs via internal testing and completes a duel against an iOS or scripted opponent.
- [ ] Content guide exists so a new card can be added without changing room protocol.
- [ ] Load note published: connections / concurrent matches observed on staging.

## Risks

| Risk | Mitigation |
|------|------------|
| Rules complexity explosion | Milestone caps; keyword budget per release |
| Spectate cheating via delayed packets | Public view only; never send private zones |
| Store policy / IP takedown | Legal review gate; feature-flagged branding |

## Open questions

- Friend-spectate only vs open lobbies?
- Replay recording format in this step or later?

## Exit notes (fill when step completes)

- Sets/keywords added:
- Spectator rules shipped:
- Android package + track:
- Load test summary:
