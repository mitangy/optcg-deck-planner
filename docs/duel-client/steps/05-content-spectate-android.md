# Step 5 — Content breadth, spectate, Android, production web

**Status:** `planned` (not started)  
**Depends on:** Step 4 + Step 4.5 acceptance criteria met  
**Unblocks:** Public beta considerations (still subject to IP/legal)

## Ready for development (gate)

- [ ] Step 4 checkpoint (Colyseus vs Nakama) resolved in `DECISIONS.md` if changed
- [ ] Step 4.5 staging **`duel-web/`** URL live; CORS/WSS lessons captured in exit notes
- [ ] Content plan: which sets/keywords added; art source policy confirmed
- [ ] Spectate privacy rules agreed (delay? hide hands? friend-only?)
- [ ] Android package id + Play Console access confirmed if store pass is in scope
- [ ] Production web domain / legal feature-flag policy agreed for **`duel-web/`** (ADR-008 / ADR-014)
- [ ] Checklist complete before coding

## Goal

Expand from the **Step 3 / 3.5 curated real-id starter set** toward a **broader playable card pool**, add **spectating**, complete an **Android** build/store readiness pass on Expo `mobile/`, and harden the **production `duel-web/` frontend** (desktop UX + stable URL) that Step 4.5 first put on Vercel. Harden the content pipeline so new cards are data + tests, not one-off server forks.

## In scope

- Grow `packages/rules` card definitions and keywords **beyond the curated ST01 set**; regression sims.
- Content pipeline docs: add card → tests → appear in server/client (extends atlas export).
- Spectator mode: read-only room subscription; no hidden info; optional delay.
- Expo Android configuration; EAS Android build; basic Play internal testing track.
- Performance pass: board virtualization if needed, WS payload size, image caching.
- Client UX for set filters / deck validation against legal definitions.
- Security/privacy pass for wider testing (account deletion path, ToS placeholders).
- Legal gate / feature flags for public builds that show real names/art.
- **Production web (ADR-014):** desktop-responsive polish on **`duel-web/`**; production (or prod-like) Vercel domain; spectate share URLs if spectate ships; keep planner `frontend/`, `duel-web/`, and Expo `mobile/` as separate products.

## Out of scope

- Claiming official Bandai affiliation or shipping copyrighted text/art without rights.
- Esports tournament platform, replay marketplace, or economy/gems.
- iOS App Store **public** release if legal review is incomplete (TestFlight OK).
- Rewriting meta deck planner features unrelated to duel.
- Merging duel into deck-planner `frontend/`.
- Hosting Colyseus on Vercel serverless.
- First-time scaffold/deploy of `duel-web/` (that is Step 4.5).
- Making Expo RN-web the product web UI.

## Deliverables

| Artifact | Location |
|----------|----------|
| Expanded rules + tests | `packages/rules/**` |
| Spectate support | `game-server` + `mobile` |
| Android EAS profile | `mobile/eas.json` (or equiv) |
| Content contribution guide | `packages/rules/README.md` or `docs/duel-client/CONTENT.md` |
| Scale/load notes | short doc under `docs/duel-client/` |
| Production web polish | `duel-web/**` layout + Vercel prod project/domain notes |

## Technical approach

1. **Content:** prioritize keywords that unlock the most decks; keep effect hooks modular; golden-master sims for fixed seeds.
2. **Spectate:** join room with `role: spectator`; server sends public view only; cap spectator count per room.
3. **Android:** enable Android in Expo config; fix any iOS-only assumptions (safe areas, back gesture); EAS build + internal track.
4. **Web (`duel-web/`):** widen layout for ≥1024px; keyboard/pointer affordances; production env pointing at prod WSS; feature-flag real names/art if required; optional CDN for card images.
5. **Load:** run a k6/artillery-style WS soak against staging (hundreds of connections) and record results in exit notes.
6. **Legal:** keep feature flags to disable real-world card names/art for public builds if required.

## Acceptance criteria

- [ ] Agreed card/keyword expansion ships with tests; sim suite still green.
- [ ] Spectator can watch a live duel without seeing either hand.
- [ ] Android build installs via internal testing and completes a duel against an iOS or scripted opponent.
- [ ] Content guide exists so a new card can be added without changing room protocol.
- [ ] Load note published: connections / concurrent matches observed on staging.
- [ ] Production (or prod-like) **`duel-web/`** URL: desktop layout usable; duel completes; planner Vercel project still separate/unbroken.

## Risks

| Risk | Mitigation |
|------|------------|
| Rules complexity explosion | Milestone caps; keyword budget per release |
| Spectate cheating via delayed packets | Public view only; never send private zones |
| Store policy / IP takedown | Legal review gate; feature-flagged branding |
| Web desktop UX fights phone board | Shared components + responsive breakpoints; don’t fork protocol |

## Open questions

- Friend-spectate only vs open lobbies?
- Replay recording format in this step or later?
- Production duel hostname (`play.` / `duel.`) vs marketing site?

## Exit notes (fill when step completes)

- Sets/keywords added:
- Spectator rules shipped:
- Android package + track:
- Production web URL + flags:
- Load test summary:
