# Step 5 — Content breadth, spectate, Android, production web

**Status:** `ready for review` (board UX shipped in **Step 5.5**; Play internal install still operator-owned)  
**Depends on:** Step 4 + Step 4.5 acceptance criteria met  
**Unblocks:** Public beta considerations (still subject to IP/legal)  
**Board UX slice:** [steps/05.5-board-ux-sim-tft.md](./05.5-board-ux-sim-tft.md) (OPTCG Sim layout + TFT-inspired chrome)

## Ready for development (gate)

- [x] Step 4 checkpoint (Colyseus vs Nakama) resolved in `DECISIONS.md` if changed — **stay Colyseus**
- [x] Step 4.5 staging **`duel-web/`** URL live; CORS/WSS lessons captured in exit notes
- [x] Content plan: which sets/keywords added; art source policy confirmed — **ST01 + Rush (Sanji); bundled arts; see CONTENT.md**
- [x] Spectate privacy rules agreed (delay? hide hands? friend-only?) — **default for Step 5:** public view only, hide both hands, no delay v1, open lobby spectate OK for private staging
- [x] Android package id + Play Console access confirmed if store pass is in scope — **`com.optcg.duel` + EAS internal track configured; Play Console upload still operator-owned**
- [x] Production web domain / legal feature-flag policy agreed for **`duel-web/`** (ADR-008 / ADR-014) — **prod-like staging domain first**; `VITE_SHOW_OFFICIAL_IDENTITY` gate
- [x] Checklist complete before coding — **implemented on `cursor/duel-step5-afeb`**

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
- **Board UX (Step 5.5):** OPTCG Sim zone layout (board / hand / DON!!) + TFT-inspired visual language on `duel-web/` — see `05.5-board-ux-sim-tft.md`.

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
| Spectate support | `game-server` + `duel-web` + `mobile` |
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

- [x] Agreed card/keyword expansion ships with tests; sim suite still green. *(Rush + ST01-004 Sanji; summoning sickness)*
- [x] Spectator can watch a live duel without seeing either hand.
- [ ] Android build installs via internal testing and completes a duel against an iOS or scripted opponent. *(EAS/`com.optcg.duel` ready; Play upload operator-owned)*
- [x] Content guide exists so a new card can be added without changing room protocol. (`docs/duel-client/CONTENT.md`)
- [x] Load note published: connections / concurrent matches observed on staging. (`docs/duel-client/LOAD.md` + `loadSpectators.mjs`)
- [x] Production (or prod-like) **`duel-web/`** URL: desktop layout usable; duel completes; planner Vercel project still separate/unbroken. *(board UX via 5.5; identity flag shipped)*

## Risks

| Risk | Mitigation |
|------|------------|
| Rules complexity explosion | Milestone caps; keyword budget per release |
| Spectate cheating via delayed packets | Public view only; never send private zones |
| Store policy / IP takedown | Legal review gate; feature-flagged branding |
| Web desktop UX fights phone board | Shared components + responsive breakpoints; don’t fork protocol |

## Open questions

- Friend-spectate only vs open lobbies? **Locked for v1:** open lobby spectate OK for private staging
- Replay recording format in this step or later? **Later**
- Production duel hostname (`play.` / `duel.`) vs marketing site? **Deferred** — staging Vercel URL for now

## Exit notes (fill when step completes)

- Sets/keywords added: ST01 curated set + **Rush** (`ST01-004` Sanji); summoning sickness for non-Rush Characters
- Spectator rules shipped: `role: spectator`; both hands hidden; no intents; max 8 spectators/room; no delay v1
- Android package + track: `com.optcg.duel`; EAS `preview`/`development` APK + submit `internal` track
- Production web URL + flags: staging `optcg-duel-web.vercel.app`; `VITE_SHOW_OFFICIAL_IDENTITY`
- Load test summary: see `docs/duel-client/LOAD.md`
