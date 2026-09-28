# Duel engine and complete card abilities — implementation plan

**Status: approved direction, revised 2026-09-16. Restructuring existing code is authorized to build a robust engine that makes cards easy to add. The reusable runtime migration is planned, not implemented. Official full-catalog reconciliation remains in progress.**

Audit date: 2026-09-14. Repository baseline: `b1eefd89b0d761c561b5d3317dec453c615e68f3`.

Phase 1 foundation update (2026-09-15): confirmed ST01/Teach data defects were
corrected; unsupported Events now fail closed; the curated catalog uses explicit,
stable ability IDs; every bundled catalog ID has a card-level support state;
fallback cards are `unverified`; and ranked decks reject incomplete cards. The
remaining official-source reconciliation and all later effect phases are still open.

### Current assessment and priority (2026-09-16)

The working tree has a **hybrid data-and-hooks engine**, not a generic card-effect interpreter. `types.ts` separates match state from definitions; `applyIntent` clones state and returns events; `powerOf` derives power; pending choices and `effectOrder.ts` support resumable player input and ordering. These are useful foundations to preserve through behavior tests.

Curated cards are TypeScript data objects in `cards/definitions.ts`, with specialized fields such as `onPlaySearchTop`, `onKoReviveSelf`, and `leaderActivateGiveRestedDon`. Their behavior lives in explicit branches in `engine.ts`, with some ID-based mappings. `GameEvent` output is not a general ability subscription mechanism, and the pending-choice queue is not a universal effect execution queue. Moving these objects to JSON alone would not fix the coupling. Catalog presence and printed text do not establish executable support.

**Priority change:** finish the reusable execution foundation and migrate the curated cards before broad catalog expansion. Existing implementations of search, modifiers, On K.O., Triggers, and other hooks are migration fixtures, not proof that the generic runtime is complete. Retain verified behavior; correct defects against official sources rather than enshrining them in compatibility tests.

The user has explicitly authorized restructuring for this goal. Internal types, file boundaries, hooks, and protocol contracts may change when needed; stage compatible releases and regression checks. This document updates the implementation plan only and does not claim the restructuring has shipped.

The assessment includes local, unmerged implementation work observed on September 16. Historical implementation-status notes are not a claim that those changes are present on `main` or deployed. This planning PR carries documentation and its audit inventory only; reconcile the implementation branch before beginning migration.

**Reading the audit:** sections 1–3 and the counts/probes in section 6 are historical snapshots from September 14–15. Several listed defects have since been addressed. Reconcile them against the working tree before opening implementation tasks; do not treat those tables as current coverage. The assessment above and the sequence below govern new work.

## Scope and outcome

Implement every printed ability for the leaders, characters, events, and stages in duel-web's bundled catalog. The initial acceptance scope is the **2,834 distinct card IDs currently in the repository**, including promos and starter cards. Alternate art does not require a separate implementation. This snapshot is not a claim that the app contains every officially released card: some sets are visibly incomplete (for example, OP18 has three IDs). Reconcile the catalog against the official card list in phase 1 and record additions explicitly.

The work belongs primarily in `packages/rules`, executed authoritatively by `game-server`. Duel-web must render server-provided actions and choices, without deciding legality locally. Mobile shares the rules and wire contract and needs compatibility updates when those change.

Companion inventory: [all 2,834 card IDs](audits/ability_inventory_2026-09-14.json). Each row records the current definition source, printed text, wired hooks, missing engine families, audit status, and data warnings. It is an audit artifact, not an executable card registry. Printed-text classifications identify work candidates; they are not proof of official rules correctness.

## 1. Coverage found

| Card type | Catalog IDs | Curated definitions | Fallback definitions | Fallbacks with text beyond plain Blocker/Rush |
|---|---:|---:|---:|---:|
| Leader | 145 | 4 | 141 | 141 |
| Character | 2,233 | 31 | 2,202 | 1,880 |
| Event | 407 | 7 | 400 | 400 |
| Stage | 49 | 2 | 47 | 47 |
| **Total** | **2,834** | **44** | **2,790** | **2,468** |

Of the remaining fallback Characters, **43 appear to have only ordinary Blocker/Rush** and **279 have no stored effect text**. These are verification candidates, not 322 confirmed complete cards. Some fallback cards with additional text already receive a simple keyword flag, but their other clauses do not execute.

The existing curated `EFFECT_CATALOG` reports **68 rows: 16 implemented, 12 keyword, 40 stub, 0 partial**. These numbers are not a completion percentage:

- Six “implemented” rows describe cards considered vanilla by the current definitions, including the incorrectly encoded ST01-005.
- `hasTrigger` gets a “keyword” status even though it cannot resolve a Trigger.
- The parser finds referenced tags anywhere in a clause. Black Vortex's Main effect is misclassified as Trigger; OP17-112's continuous effect is also misclassified as Trigger. “Activate this card's On Play effect” is classified as On Play instead of Trigger.
- A combined On Play / On K.O. clause is counted once, so it does not track both activation windows.
- The catalog snapshot is built at module import; later `ensureCardDef` registrations do not enter that snapshot.
- The support classifier uses timing plus the presence of a hook, rather than checking every condition, target, cost, operation, and duration.

### Existing behavior to retain and extend

- Basic turn flow, battles, character counter values, ordinary Blocker and unconditional Rush.
- ST01-001 rested-DON attachment; OP17-001 opponent-attack power buff; OP16-080 opponent-attack redirect; OP17-039 attack/reveal/draw.
- OP16-021 Stage trash-to-attach activation, but not its On Play search.
- Guard Point's flat battle-counter bonus, but not full printed targeting or Trigger.
- Three specific Character On Play implementations: EB04-058 and the two Linlin cards EB03-034 / OP17-112.
- Pending-choice queue, controller ordering, and turn-player-first batching at selected entry points.
- Generic draw fields exist, but `mainDraw`, `triggerDraw`, and `onPlayOptionalDraw` have no assigned card in the fresh 44-card registry. Their presence is not evidence of catalog coverage.

## 2. Corrections required before broad implementation

### Confirmed card and rules defects

1. **ST01-004 Sanji:** unconditional Rush and an incorrect +1000 counter are encoded. The official card has a two-attached-DON condition for Rush and no counter. Rush must be evaluated from current conditions, not only when the Character is created.
2. **ST01-005:** encoded as a 1-cost Usopp with 2000 power and 2000 counter. It is Jinbe, 3 cost / 5000 power / no counter, with a one-DON-gated attack buff to another friendly card.
3. **ST01-014 Guard Point:** its Trigger is absent; its Counter always buffs the battle defender instead of offering the printed choice of friendly Leader/Character.
4. **ST01-001 Luffy:** display text invents a rest-this-Leader cost. The engine does not rest the Leader, which agrees with official text. Preserve that behavior while correcting text and reviewing zero-target “up to” handling.

These four findings were checked against [Bandai's ST01 card list](https://en.onepiece-cardgame.com/cardlist/?series=569001).

5. **OP16-080 Teach:** the current static hook taxes the opposing player's Character plays from hand. Official text raises the cost of Teach's own Characters during the opponent's turn. Replace that hook with the correct field-cost modifier, and update tests that currently enforce the incorrect tax. [Bandai OP16 card list](https://en.onepiece-cardgame.com/cardlist/?series=569116)
6. **Trigger framework:** only a positive `triggerDraw` creates a Life prompt; `hasTrigger` alone does nothing. The generic accepted Trigger also returns its card to hand. Accepted Triggers normally dispose of the card to trash unless their effect specifies otherwise; declined Triggers go to hand without being revealed. Also distinguish battle K.O., effect K.O., and other trash/removal, and preserve resolution windows during multi-damage. [Comprehensive Rules, sections 8.6 and 10.1–10.2](https://en.onepiece-cardgame.com/pdf/rule_comprehensive.pdf)

### Data and execution prerequisites

- **Counter data is missing from every one of the 2,834 `catalogMeta.json` rows.** Fallback Characters consequently default to 1000 counter, and fallback Counter Events usually resolve for zero power. Missing data must not be interpreted as a printed value.
- Trait metadata is missing on 24 curated definitions, including Newgate OP17-001. Fallback rules traits use a nine-ID hardcoded map rather than the full catalog. Some curated traits look copied from deck membership (for example Baby 5 / Rayleigh / Borsalino tagged Blackbeard Pirates); verify them before enabling trait-based effects.
- Curated stats conflict with the local catalog: EB03-034 color/power and OP17-112 power. Official-source validation must determine the corrections; do not blindly prefer the local catalog.
- Catalog keyword generation searches for the word Blocker/Rush anywhere. That can turn a reference to a keyword, a conditional keyword, or Rush: Character into an unconditional ability. For example, Roger's catalog metadata says Blocker because its text mentions an opponent activating Blocker.
- Catalog text has transcription problems and storefront disclaimers. OP12-018 and OP17-017 have suspicious unsigned power changes; EB03-034 has ambiguous `DON!! 1` text. Verify signs, costs, and current errata before encoding.
- Unsupported Main and Counter Events can currently spend resources and be discarded without executing their printed effects. Coverage labels do not prevent this.
- Stage play does not call `applyOnPlayEnterPlay`. Character K.O. does not dispatch On K.O. There are no general start/end-turn, On Block, or replacement-effect windows.
- Life is only an array of card IDs: no face-up state or private look/reorder state. Deck/trash use definition IDs rather than persistent instance IDs, requiring explicit duplicate-card selection and source tracking.
- `getPlayerView` exposes the pending queue directly, and `DuelRoom.broadcastViews` sends the same events to both players and spectators. Current Life-related events can include hidden card IDs. Private search results, hand selection, and unrevealed Life must be projected per viewer before adding these abilities.
- Existing documentation is stale: the README says When Attacking is unsupported despite Rocks' implementation, and duel-web's README says protocol 1 while the code uses protocol 3.

## 3. Curated card backlog

This table covers every curated card with known missing behavior or incorrect encoding. Descriptions summarize repository text unless an official correction is identified above; they are not substitutes for card-source validation.

### Leaders

| ID | Card | Remaining work |
|---|---|---|
| ST01-001 | Monkey.D.Luffy | Correct printed text; preserve rested-DON attachment; complete “up to” semantics. |
| OP16-080 | Marshall.D.Teach | Replace opponent hand-cost tax with own Character field-cost modifier; verify redirect eligibility and traits. |

OP17-001 Edward.Newgate and OP17-039 Rocks.D.Xebec have dedicated attack-window hooks. Preserve them, verify metadata and optional-cost/target edge cases, and migrate them into the shared effect system with regression coverage.

### Characters

| ID | Card | Missing / incorrect behavior |
|---|---|---|
| ST01-004 | Sanji | Conditional DON x2 Rush; correct counter and metadata. |
| ST01-005 | Jinbe (currently Usopp) | Correct identity/stats; DON x1 When Attacking buff to another friendly card through the turn. |
| OP09-118 | Gol.D.Roger | Rush flag missing; special victory when opponent activates Blocker at zero Life. |
| OP16-118 | Portgas.D.Ace | Hand-counter override; filtered top-five search on both On Play and On K.O.; order remainder. |
| OP17-002 | Atmos | Opponent-turn +3000 power. |
| OP17-003 | Izo | Rush: Character; conditional On Play power reduction on a rested enemy. |
| OP17-005 | Edward.Newgate | Conditional hand-cost reduction; temporary Leader base-power replacement through opponent's next End Phase. |
| OP17-008 | Jozu | Conditional Leader base-power replacement and expiration. |
| OP17-015 | Marco | Substitute itself for effect removal; paid On K.O. revival from trash. |
| ST23-001 | Uta | Conditional hand-cost reduction; Blocker already wired. |
| ST30-004 | Emporio.Ivankov | Reveal two eligible hand cards as cost; draw three, choose two to trash. |
| EB03-034 | Charlotte Linlin | On K.O. DON-return cost and Life addition; preserve On Play chain while allowing its optional DON addition; validate color/power. |
| OP17-112 | Charlotte Linlin | Your-turn base-power aura on eligible Trigger Characters; retain On Play branch and verify power. |
| OP09-086 | Jesus Burgess | Effect-K.O. immunity; conditional power scaling with trash count. |
| OP09-093 | Marshall.D.Teach | Blocker flag missing; paid/limited activation after being played this turn; negate Leader/Character effects and timed attack prohibition. |
| OP09-095 | Laffitte | Rest DON and Character as cost; filtered top-five search and remainder ordering. |
| OP12-112 | Baby 5 | Conditional draw-two Trigger. |
| OP14-108 | Silvers Rayleigh | Conditional base-power-limited K.O.; Trigger invokes On Play effect. |
| OP16-104 | Catarina Devon | Attack-time base-power copy; Trigger draw plus play eligible Character from trash. |
| OP16-106 | Sanjuan.Wolf | Conditional On K.O. draw and base-power replacement; Trigger invokes that effect. |
| OP16-108 | Shiryu | Hand-trash cost; eligible trash card to face-up Life; draw-two Trigger. |
| OP16-109 | Doc Q | Conditional On K.O. draw and up-to-two cost-limited K.O.; Trigger invokes that effect. |
| OP16-110 | Vasco Shot | On K.O. draw and cost-limited rest; Trigger invokes that effect. |
| OP16-119 | Marshall.D.Teach | Top-three selection into Life and reorder remainder; Trigger negation followed by cost-limited K.O. |

No new printed-ability hook is identified from stored text for ST01-003 Karoo, ST01-008 Nico Robin, ST01-009 Vivi, OP12-002 Newgate, or ST30-005 Jozu (vanillas); ST01-006 Chopper has Blocker. EB04-058 Borsalino has Blocker and its low-Life On Play hook. These seven still require metadata validation; Borsalino's traits are specifically suspect.

### Events — all seven curated Events need work

| ID | Card | Remaining work |
|---|---|---|
| ST01-014 | Guard Point | Counter target selection; turn-duration power-buff Trigger. |
| OP12-018 | Color of the Supreme King Haki | Restricted Counter target; optional DON-rest payment; subsequent enemy-wide power change; verify sign. |
| OP17-017 | Ga Ha Ha Ha!! | Trait-restricted Counter buff followed by enemy power change; verify sign. |
| OP17-019 | I Don't Have Time to Chat with Snot-Nosed Brats | Filtered top-five search/order; Leader power-buff Trigger. |
| OP09-096 | My Era...Begins!! | Top-three trait search with name exclusion, trash remainder; Trigger invokes Main. |
| OP16-115 | Black Vortex | Conditional Trigger-card retrieval from trash with self exclusion; negate Leader/Character effect Trigger. |
| OP16-116 | Zehahahahaha! | DON-count requirement; named Character play from hand followed by opponent Life-to-hand; Trigger draw two/trash one. |

### Stages — both curated Stages need work

| ID | Card | Remaining work |
|---|---|---|
| OP16-021 | Moby Dick | Leader-trait-gated top-three On Play search/order; preserve trash-to-attach activation and review zero-target handling. |
| OP09-099 | Fullalead | Hand-trash plus Stage-rest activation cost; top-three trait search/order. |

### Remaining catalog

The companion JSON enumerates **all 141 fallback Leaders, 2,202 fallback Characters, 400 fallback Events, and 47 fallback Stages** by ID and text. In addition to the families above, the catalog requires start/end-turn effects, On Block, Double Attack, Banish, Unblockable and attack restrictions, readying, returning cards to hand/deck, DON return/ramp/movement, Life look/reorder/reveal, effect suppression, special deck-building permissions, alternate victories, and card-specific exceptions. Use explicit verified mappings for execution; text scanning is only an audit aid.

## 4. Target engine architecture and implementation sequence

### Architecture contract

Keep `packages/rules` headless and server-authoritative, with three explicit boundaries:

| Boundary | Responsibility |
|---|---|
| Serializable state | Instances in every zone, visibility, turn/battle state, modifiers, use limits, deterministic ID/RNG state, pending resolutions, and choices. No functions, closures, or live event listeners in match state. |
| Generic rules runtime | Validate intents, evaluate conditions/selectors, pay costs, execute operations, calculate derived values, dispatch timing windows, process replacements, and project private views. |
| Versioned card registry | Verified printed metadata and declarative abilities composed from supported primitives. Art and display text remain separate from executable semantics. |

**Card format:** introduce a versioned, runtime-validated schema for `abilities[]`. Use typed TypeScript builders initially if they improve authoring, but require their output to be plain JSON-compatible data validated by the same schema as JSON imports. No executable callbacks embedded in card definitions, English-text interpretation, or arbitrary script evaluation. The registry compiler rejects unknown operations, invalid references, impossible schema combinations, and duplicate ability IDs with card/ability/path diagnostics. Validate once when building/loading the registry, not on every action.

Each ability declares a stable ID, kind (continuous, triggered, activated, replacement, or rule/deck-construction), applicable zones and timing windows, conditions, costs, limits, selectors, ordered operations, and durations as applicable. A shared body can be invoked by a Life Trigger without falsely dispatching On Play or On K.O. Costs and effects are distinct: a condition, an optional payment, and an optional target selection must not be interchangeable.

**Reusable primitives:** begin with predicates and selectors for controller/opponent, zones, type/trait/name/color, printed/current stats, DON, rested state, and counts; operations for draw, move, reveal/look, select/order, rest/ready, attach/return DON, modify stats/keywords/restrictions, and invoke an effect body. Compose them using sequence, explicit conditional/modal branches, and bound selection results. Define evaluation timing and binding scope so a later step can refer unambiguously to the chosen cards or paid costs. Introduce further operations from verified card requirements, not speculative general-purpose scripting.

**Resolution model:** `applyIntent` remains the public facade where practical. Internally, use a deterministic scheduler of serializable resolution frames (source/controller, ability, cause, window, program position, bound values, and continuation). Commands perform state changes and produce internal rules events. A rules-aware dispatcher discovers eligible abilities and schedules them at the correct timing boundary. Public animation/log events are a separate projection. Continuous abilities are evaluated as derived state; replacement effects intercept a proposed operation before it commits. An ordinary asynchronous observer bus or universal last-in-first-out stack is not the rules model.

Specify timing/priority, simultaneous-effect ordering, nested triggers, mandatory versus optional actions, target revalidation, last-known information, and rule checks against official rules. Freeze eligible trigger sets where required and re-evaluate conditions where required. Do not infer those semantics from callback order. Reject invalid intents without changing state or consuming RNG; valid multi-step resolutions may pause after paid costs and follow the printed resolution rules rather than rolling back the entire ability. Persist enough continuation state to resume without paying twice or replaying a completed step.

**Instances and privacy:** give cards stable instance IDs in deck, hand, Life, field, and trash, with explicit zone-entry identity semantics and last-known snapshots. Keep Life orientation and per-viewer knowledge explicit. Expose opaque, prompt-scoped selection handles; stable internal identity must not let another player track hidden cards after a shuffle. Reuse the same private projection for normal updates, reconnect, spectators, and logs.

**Modifier pipeline:** distinguish printed values, base-value replacement, additive changes, costs in each zone, counter values, keyword grants/removals, restrictions, and negation. Keep printed definitions immutable. Specify precedence/dependencies from verified rules, not a guessed universal ordering. Model turn/battle/next-turn expiration and source dependencies explicitly; recompute continuous conditions as state changes. The same derived queries drive legality, combat, and server-projected display values. Use limits bind to the correct ability/source lifetime and survive reconnect.

**Extension policy:** a card using existing primitives requires only a definition, source record, and meaningful fixtures. A genuinely new mechanic adds a reusable primitive/resolver and its tests, then card data. Permit a narrowly scoped, versioned resolver registry for irreducible exceptions; each exception needs a documented reason, serializable parameters, privacy/continuation support, and tests. No new per-card branches in the core loop or unbounded growth of `CardDef` booleans. Track resolver-backed exceptions explicitly in coverage and review them for shared patterns.

Suggested module boundaries (final filenames can follow implementation needs):

```text
packages/rules/src/
  state/          instances, zones, snapshots, versioning
  registry/       schema, validation/compiler, immutable registry
  cards/          verified definitions, source records, generated coverage
  runtime/        intents, scheduler, timing, costs, operations, replacements
  queries/        predicates, selectors, derived stats, legality
  projection/     player/spectator views, choices, public events
  engine.ts       compatibility facade during migration
```

**Reproducibility:** pin each match to registry content hash, rules version, state version, and protocol version. Save RNG progression, accepted inputs, and resumable frames for deterministic replay. Do not hot-swap card behavior in running matches. Reject incompatible snapshots or migrate them explicitly; retain the prior runtime for existing rooms or drain those rooms during rollout. A release rollback must not silently load a new snapshot into an incompatible engine.

### Delivery order and gates

1. Establish the verified regression baseline and finish the data/schema work needed for the migration slice (Phase 1).
2. Deliver Phase 2A–2C in order: registry/state contracts, generic runtime, then an integrated migration slice.
3. Generalize modifiers/combat (Phase 3) and movement/replacements/remaining timings (Phase 4), migrating all curated cards and removing their legacy execution paths.
4. Prove data-only card addition before starting broad catalog batches (Phase 5).
5. Complete integration and release checks (Phase 6); run relevant checks in every earlier slice as well.

Full-catalog source reconciliation may progress alongside engine work, but a card cannot be promoted before its own data and all required runtime semantics are verified. This permits incremental delivery without treating the audit as finished. Functional legacy hooks do not satisfy a generic-runtime gate.

### Phase 1 — Authoritative card data and truthful coverage

1. Freeze the inventory and reconcile its IDs, text, types, traits, stats, counter values, trigger text, and errata with official sources. Record source URL/revision for each card and an explicit unknown state for unverified fields.
2. Correct the confirmed ST01/Teach defects and remove false keyword inference. Repair missing counter/trait metadata and resolve the named catalog conflicts.
3. Introduce explicit per-ability records with stable IDs, activation windows, costs, conditions, legal targets, operations, duration, and implementation/test status. Represent combined timing clauses as multiple windows sharing one effect body.
4. Derive inspect/deck support labels from that registry. Distinguish complete, partial, unsupported, and data-unverified. Restrict fully automated/ranked eligibility to verified supported cards; keep unsupported deck editing possible with clear support information.
5. Update inaccurate documentation and establish a runnable local test baseline, including the missing Windows native dependency.
6. Refresh the historical inventory against the current working tree. Record verified behavior fixtures for existing curated effects, current test results, and unresolved defects separately. The native dependency failure in the earlier audit must be rechecked, not assumed to remain present.

**Exit:** every catalog ID is accounted for; no unsupported clause is marked implemented, and no unknown counter or keyword becomes a fabricated rule.

### Phase 2 — Shared effect execution and private choices

**Phase 2A — Registry and state contracts:** implement the versioned schema, registry validation, stable instance model, snapshot/RNG/version contract, and a temporary legacy adapter. Add schema rejection and snapshot round-trip tests. Pin one execution route per ability so the adapter and the new runtime cannot both fire it.

**Phase 2B — Generic runtime:** implement effect contexts, frames/continuations, predicates/selectors, payments, operations, timing dispatch, and private choice projections for the slice below. Separate internal rules events from client events. Make legacy paths call shared infrastructure during migration rather than maintaining two independent implementations of costs, movement, or visibility.

**Phase 2C — End-to-end migration:** migrate Laffitte, Fullalead, Moby Dick, and My Era to declarative abilities and the same generic search/movement operations. Include activated, On Play, Main, and Life Trigger entry points. Prove repeated copies, legal zero selections, ordered remainders, invalid/stale choices, timer resolution, and reconnect mid-effect through the server and both client contracts.

1. Extract reusable typed effect operations from `engine.ts`, preserving deterministic `applyIntent` behavior. Prefer composable operations and explicit special resolvers over adding hundreds of per-card boolean fields or interpreting English at runtime.
2. Add an effect context (controller, source instance, cause, targets, paid costs, trigger window) and resumable resolution steps. Separate optional activation, mandatory operations, and “up to zero” selections. Validate all submitted choices on the server and avoid partial state changes on invalid input.
3. Extend timing dispatch to Character/Stage On Play, all When Attacking, On K.O., On Block, start/end-turn, and printed reaction windows. Process newly generated effects after the appropriate current window; preserve controller order and deterministic nested resolution.
4. Add generic single/multiple selection, filtered zones, ordered deck remainders, reveal, modal branches, and payment choices. Use stable option handles instead of enumerating every combination in `legalIntents`.
5. Add viewer-specific projection for pending choices, events, and logs. Keep private searches/Life/hand choices out of opponent and spectator messages, including reconnect snapshots.
6. Update `game-server` validation, timer fallback, bots/sim choices, and mirrored wire types. Negotiate/bump protocol if needed and coordinate duel-web/mobile compatibility.

**First end-to-end slice:** Laffitte, Fullalead, and Moby Dick exercise Character activation, Stage activation, Stage On Play, costs, search, private choices, ordering, and reconnect using the same machinery.

**Implementation status (2026-09-15):** the shared private top-deck search and
ordered-remainder flow is implemented for this slice in rules, duel-web, and the
mobile wire/UI mirror. Server validation rejects stale, ineligible, duplicate, or
incomplete selections atomically. Rules tests cover owner/opponent/spectator
projection; reconnect uses the same projected `getPlayerView` snapshot path.

**Exit:** these searches work through duel-web, cannot leak cards, reject invalid selections, and resume safely after disconnect or timeout.

**Additional architecture exit gate:** the slice executes through schema-validated ability programs without slice-specific resolution branches. Serialize/restore a paused search and obtain the same final state/events and RNG progression as uninterrupted execution. Compare old/new results only for verified legacy behavior; separately test corrected rules. Existing search functionality alone does not meet this gate.

### Phase 3 — Modifiers, costs, and combat keywords

1. Separate printed/base/current power, field cost, hand play cost, and counter value. Add continuous and duration-limited modifiers with explicit expiration and source-departure semantics.
2. Add general per-source/per-ability use tracking, played-this-turn state, DON requirements and payments (rest, return, attach), hand/reveal/trash costs, trait/name/color conditions, and effect negation.
3. Support conditional Rush, Rush: Character, Double Attack, Banish, Unblockable, allowed attack targets, blocked/attack/ready restrictions, and granted/lost keywords.
4. Complete simple buffs, reductions, and counter events using shared targeting; then Atmos, Uta, Izo, Ace's counter override, Newgate/Jozu base power, Burgess scaling, and OP17-112's aura.
5. Complete the full ST01 set as a small acceptance milestone across all four card types (including Nami, Brook, Jet Pistol, Diable Jambe, and Thousand Sunny).
6. Migrate specialized power/cost/counter fields and keyword branches into the shared modifier/condition system. Add an ordinary continuous-aura card as a data-only acceptance case once its conditions and targets are supported; source removal, changing DON, turn changes, and negation must update its effects automatically.

**Exit:** modifiers expire exactly, change legal actions immediately, and agree between server resolution and displayed values; multi-damage and keyword interactions behave correctly.

### Phase 4 — Zone movement, Life Triggers, and replacement effects

1. Centralize zone movement with causes: play, effect/battle K.O., other trash, hand return, deck top/bottom, Life movement. Ensure replaying a card triggers the right entry effects and handles a full field.
2. Model Life visibility and ordering; implement all Trigger bodies, including “activate Main/On Play/On K.O.” without pretending that the referenced event actually occurred. Correct accepted/declined Trigger destinations and damage continuation.
3. Add K.O. restrictions, removal replacement, last-known source information, recursion handling, and effect immunity versus negation. Resolve simultaneous rule outcomes, deck exhaustion, and explicit special victories.
4. Complete the Blackbeard and Whitebeard curated suites: Rayleigh, Devon, Wolf, Shiryu, Doc Q, Vasco Shot, Teach, Marco, Roger, and remaining Events/Linlin clauses.

**Exit:** all 44 curated definitions have complete verified ability coverage, with no unresolved clause, conditional keyword, or incorrect identity. A card with multiple abilities is not complete when only its main effect works.

**Migration exit:** every curated ability has one registry-backed execution route. Remove migrated booleans, ID-specific dispatch, obsolete prompt branches, and the legacy adapter after their last consumer moves. Update support/atlas generation from the validated registry plus reviewed source/test evidence; parsing printed tags remains an audit aid only. No broad expansion while curated cards still require the legacy dispatcher.

### Phase 5 — Finish every catalog card in reviewable batches

**Entry gate — easy card addition:** add at least three previously unsupported, officially verified cards using existing primitives, covering different timing/operation combinations and at least two card types. Each change may touch definitions, source/coverage records, fixtures, and generated artifacts, but must require **zero core-engine, game-server, protocol, or client-prompt changes**. At least one must compose multiple operations. Record changed paths and authoring friction. If this fails, repair the abstraction before expanding the catalog. Cards introducing a genuinely new mechanic follow the extension policy and do not count toward this gate.

1. Group the 2,790 fallback IDs by shared effect patterns and required mechanics. Convert straightforward template matches first; implement explicit exceptions for unique text. Each batch records exact IDs and every remaining clause.
2. Include all four card types in the batch ledger. Prioritize existing playable decks for usability, then exhaust the snapshot by set and ID; deck priority is an ordering choice, not a scope reduction.
3. Verify plain-keyword and no-text candidates against official data. Promote verified vanilla cards without manufacturing ability tests; test their relevant metadata/keyword behavior instead.
4. Add missing mechanics discovered in verified text before marking the associated cards complete. Track deck-construction abilities at deck validation as well as in-game abilities.
5. Regenerate server data, duel-web atlases (bundled/public), mobile atlas, and support manifests together. Prevent new or changed catalog cards from silently receiving full-support status.

**Exit:** every card in the reconciled acceptance scope is complete or verified vanilla; zero unresolved data records, stub abilities, partial cards, and unsupported keywords remain.

### Phase 6 — Full integration and release readiness

- Run rules tests/typecheck and seeded simulations, game-server tests/typecheck, duel-web tests/build, and mobile compatibility checks for shared protocol changes. Add card-specific success/negative/optional branches and targeted cross-card interaction tests throughout the earlier phases.
- Verify multiplayer, hotseat ownership, server timers, effect ordering, reconnect mid-resolution, spectator privacy, and illegal/stale intent rejection.
- For each new prompt family, review desktop (~1200px) and mobile (~375px), real card art, stable overlays, and keyboard/touch interaction. Follow the repository screenshot/walkthrough playbook using tooling appropriate to the Windows host.
- Test cost failure, zero eligible targets, zero selection, empty decks/life, duplicate cards, full Character/Stage zones, source removal, immunity versus replacement, buff expiration, negation of granted keywords, and multi-trigger chains.
- Add property/invariant tests for instance uniqueness and zone conservation, DON conservation, stable source/use-limit tracking, invalid-intent state/RNG immutability, and equivalence of uninterrupted versus serialized/resumed execution. Add adversarial hidden-information tests for every viewer and choice family.
- Validate the registry and coverage in CI. Reject unknown operations, broken effect references, duplicate IDs, unsupported primitives marked complete, and changed definitions with stale review evidence. Keep registry compilation deterministic and generated artifacts reproducible.
- Measure representative complex resolution windows and legal-action generation before and after migration. Establish and record regression budgets from that baseline; avoid combinatorial target enumeration. Bound interpreter work and detect non-progressing loops with diagnostic traces, without silently skipping mandatory rules or awarding a fabricated win.
- Completion report: coverage totals by type/set, tested card IDs, data sources, unresolved count (must be zero), and deployment compatibility. Deployment is a separate action from this planning approval.

## 5. Acceptance rules

A card is complete only when its identity and current printed rules are verified, **all** clauses and conditions execute correctly, the server offers every necessary legal choice, the UI can submit those choices, hidden information stays private, and meaningful behavior/interaction tests pass. Displaying text, setting a support flag, or passing a random simulation does not meet that standard.

The engine foundation is complete only when the migration and data-only authoring gates above pass, resolution can be deterministically saved/resumed/replayed, and shared operations own legality and privacy. Catalog completeness and architecture completeness are separate deliverables; neither substitutes for the other.

This is a substantial rules-and-content project. Deliver it in independently verified batches rather than one oversized change. Estimate throughput after the first end-to-end slice; do not estimate remaining effort from the misleading 40-stub catalog count.

## 6. Audit verification and limitations

- Examined card definitions, full metadata/cosmetics catalog, effect classification, engine entry points, existing tests, server messages/timer paths, and duel-web prompt/atlas architecture.
- Enumerated all 2,834 IDs; both catalog files contain the same ID set and all 44 curated IDs.
- Ran five direct read-only engine probes confirming: Sanji can attack immediately without attached DON; My Era spends its cost but does not search; Moby Dick does not dispatch On Play; Teach taxes the opponent's hand play cost; Baby 5 never offers a Life Trigger prompt.
- `npm run test:rules` could not start: installed Rollup lacks `@rollup/rollup-win32-x64-msvc`. No dependency or lockfile changes were made. The audit probes ran successfully through the available `tsx` loader; they confirm existing gaps, not overall rules correctness.
- Official-source checks in this pass cover the specific ST01 and Teach corrections plus relevant Comprehensive Rules. The full-catalog inventory is exhaustive for repository IDs, but **not** a completed manual official-text/ruling verification of all 2,834 cards. Phase 1 makes that explicit remaining work.
- The audit inventory remains the exhaustive 2,834-ID baseline. Approved implementation batches subsequently added private search, Trigger privacy, several leader/character modifiers, OP17-112's aura, and OP09-096's Life Trigger Main search; generated atlases and tests were refreshed. No deployment was performed.
- At the September 15 update, the curated effect ledger had 70 rows: 36 implemented, 21 partial, 5 keyword, and 8 stub rows. These are historical counts, not a September 16 recount. The fallback catalog remains explicitly unverified until each shared mechanic and card-specific exception is reconciled.

## Approved direction and immediate next milestone

The plan direction is approved, including restructuring existing code for a robust, extensible game engine (2026-09-16). No additional architecture approval is required merely because a slice refactors working code. Complete the development-readiness checklist using source verification, concrete contracts, and acceptance fixtures for each slice.

The next implementation milestone is **Phase 2A plus the Phase 1 regression/source baseline needed for it**, followed by the generic search migration in Phase 2B–2C. Do not resume adding isolated card hooks as the default expansion strategy. Deliver independently verified slices through all acceptance gates; deployment remains separate from this documentation update.
