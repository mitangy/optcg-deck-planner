# Duel engine and complete card abilities — implementation plan

## Revision 2026-09-27b — execution strategy (supersedes conflicting guidance below)

The review of the plan below found five problems. The first two block completion; the other three slow it down. These decisions replace the conflicting parts of the older sections. Those sections remain as the audit history.

1. **Authoring throughput.** The plan authors every card by hand, one at a time. 2,460 official cards carry ability text, and 44 took weeks. **Decision:** a deterministic, offline *authoring compiler* (`packages/rules/tools/cardText/`) translates the official Bandai text into DSL. Its output (`src/cards/generated/abilities.json`) is checked in and diffable, and a test verifies it matches regeneration. The compiler must consume an entire clause. Otherwise the clause is recorded as unsupported, with its text, and the card cannot be ranked-eligible. The runtime never reads English. Hand-written DSL overrides (`src/cards/manualAbilities.ts`) take precedence card by card for text the grammar cannot express or gets wrong.
2. **Coupled engine.** Incremental migration keeps two execution paths alive and makes every card slice pay for the legacy adapter. **Decision:** replace the legacy per-card engine with one generic runtime in a single cut-over. Curated cards become ordinary data. Legacy `CardDef` hook fields, per-ability prompt kinds and ID-specific dispatch are deleted. Old tests that enforced legacy prompt shapes are rewritten against the generic contract, and their behavior assertions are kept.
3. **Card data.** Stats, counters and traits come from a generated `src/cards/cardData.json`, built from the official Bandai candidate snapshot by `tools/buildCardData.ts`, with source provenance. The 49 IDs that official English lists lack keep their bundled values and are flagged `unverified`. `catalogMeta.json` stays only for those rows.
4. **Prompt protocol.** A per-ability `abilityId` prompt does not scale to thousands of cards. **Decision:** protocol **5** has one generic choice request with five shapes: `confirm`, `select` (min/max over opaque option handles), `mode`, `order`, and `look` (select from privately revealed cards, then order the remainder). Each client gets one generic prompt component. The timer and bot fallback always has a legal default: the minimum selection, or decline when optional.
5. **Script isolation.** Scripts are first-party modules checked into the repo. Clients never supply them. A sandbox therefore guards against no real threat, and its cost is a runner outside the synchronous engine. **Decision:** `CustomScript` modules receive a frozen capability context (queries, commands that validate their inputs, seeded RNG, choice requests). A test fails if a script module imports anything except the capability types. Continuations remain JSON (`scriptId`, `version`, `step`, bindings). Bespoke effects prefer manual DSL; a script is the last resort.

**Completion definition (unchanged in spirit):** a card counts as supported only when every clause maps to executable DSL, a manual override, or a script. The generated support manifest reports supported, partial and unsupported cards per set. Ranked play rejects anything not fully supported. Casual play allows partial cards and marks their unsupported clauses in the inspect UI.

**Progress for this revision is recorded in the "Implementation log (2026-09-27b)" section at the end of this document.**

**Status: implementation in progress, revised 2026-09-27. Restructuring existing code is authorized to build a robust engine that makes cards easy to add. The first schema-validated search slice and serializable runtime contracts are implemented locally. The target architecture now explicitly combines a JSON DSL baseline with isolated `CustomScript` hooks; that script runner remains to be implemented. Official full-catalog reconciliation remains in progress.**

### Checkpoint validation (2026-09-27)

Passing: 159 rules tests, 18 game-server tests, 137 duel-web tests, 6 mobile protocol tests, and 7 offline Bandai-import tests. Rules/server/mobile typechecks and duel-web production build pass. The build reports its existing large-bundle warning. Backend duel tests could not start with `py -3` because that Python environment lacks `pytest`; backend writeback changes are included in the checkpoint but are not verified by that test run. Prior responsive prompt screenshots are retained as review evidence; native/live-match walkthrough and full-catalog acceptance remain open. The 2,790 fallback IDs remain unverified, and 44 curated definitions do not yet establish complete ability coverage.

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
| Versioned card registry | Verified printed metadata, declarative abilities, and explicit references to reviewed isolated scripts for exceptional effects. Art and display text remain separate from executable semantics. |

**Card format:** introduce a versioned, runtime-validated schema for `abilities[]`. Use typed TypeScript builders initially if they improve authoring, but require their output to be plain JSON-compatible data validated by the same schema as JSON imports. Definitions may reference isolated script files through the explicit `CustomScript` operation below; they must not contain inline executable callbacks, interpreted English, or arbitrary source to evaluate. The registry compiler rejects unknown operations, invalid script references/parameters, impossible schema combinations, and duplicate ability IDs with card/ability/path diagnostics. Validate once when building/loading the registry, not on every action.

#### Hybrid architecture decision (2026-09-27)

**Approved direction:** use a data-driven baseline with scripted hooks for edge cases across Characters, Leaders, Events, and Stages. Target roughly 90% of behavior in the JSON DSL: printed costs/power, standard payments, keywords such as Rush and Blocker, timing windows, conditions, and common operations. This is an authoring target, not measured current coverage or a quota that forces unusual effects into the DSL.

Exceptional abilities reference a checked-in, reviewed JavaScript module using plain data, for example:

```json
{"type":"CustomScript","scriptId":"card_specific_effect","version":1,"params":{}}
```

The compiler resolves this reference through a versioned script manifest to a specific isolated file. Colyseus invokes the shared authoritative rules runtime; the runtime dispatches `CustomScript` through one generic runner, without per-card server or engine switches. Script authoring remains separate from transport, matchmaking, and core timing logic. Never load script paths or executable source supplied by a client.

Scripts receive a restricted effect context and capabilities for existing queries, validated commands, seeded randomness, and private choices. They cannot directly mutate match state or access filesystem, network, wall-clock time, unseeded randomness, or mutable host globals. Select and document an isolation mechanism that actually enforces these restrictions and bounded execution; an ordinary imported function or Node `vm` alone is not sufficient isolation. Keep synchronous `applyIntent` where practical, documenting any runner-host change needed before integration.

Paused scripts return a JSON-compatible continuation (script/version, step, bound values); never persist a JavaScript closure or call stack. Resume through the same scheduler and choice validation as DSL programs. Bound execution and define deterministic failure handling without committing partial script-step mutations, replaying paid costs, silently skipping effects, or inventing a match winner. Pin script code hashes and capability API versions with each match's registry/rules versions.

**Status:** the registry and generic search/draw execution have begun; `CustomScript`, its manifest, isolated runner, and script acceptance fixtures are required future work. This plan update does not claim they already exist.

Each ability declares a stable ID, kind (continuous, triggered, activated, replacement, or rule/deck-construction), applicable zones and timing windows, conditions, costs, limits, selectors, ordered operations, and durations as applicable. A shared body can be invoked by a Life Trigger without falsely dispatching On Play or On K.O. Costs and effects are distinct: a condition, an optional payment, and an optional target selection must not be interchangeable.

**Reusable primitives:** begin with predicates and selectors for controller/opponent, zones, type/trait/name/color, printed/current stats, DON, rested state, and counts; operations for draw, move, reveal/look, select/order, rest/ready, attach/return DON, modify stats/keywords/restrictions, and invoke an effect body. Compose them using sequence, explicit conditional/modal branches, and bound selection results. Define evaluation timing and binding scope so a later step can refer unambiguously to the chosen cards or paid costs. Introduce further operations from verified card requirements, not speculative general-purpose scripting.

**Resolution model:** `applyIntent` remains the public facade where practical. Internally, use a deterministic scheduler of serializable resolution frames (source/controller, ability, cause, window, program position, bound values, and continuation). Commands perform state changes and produce internal rules events. A rules-aware dispatcher discovers eligible abilities and schedules them at the correct timing boundary. Public animation/log events are a separate projection. Continuous abilities are evaluated as derived state; replacement effects intercept a proposed operation before it commits. An ordinary asynchronous observer bus or universal last-in-first-out stack is not the rules model.

Specify timing/priority, simultaneous-effect ordering, nested triggers, mandatory versus optional actions, target revalidation, last-known information, and rule checks against official rules. Freeze eligible trigger sets where required and re-evaluate conditions where required. Do not infer those semantics from callback order. Reject invalid intents without changing state or consuming RNG; valid multi-step resolutions may pause after paid costs and follow the printed resolution rules rather than rolling back the entire ability. Persist enough continuation state to resume without paying twice or replaying a completed step.

**Instances and privacy:** give cards stable instance IDs in deck, hand, Life, field, and trash, with explicit zone-entry identity semantics and last-known snapshots. Keep Life orientation and per-viewer knowledge explicit. Expose opaque, prompt-scoped selection handles; stable internal identity must not let another player track hidden cards after a shuffle. Reuse the same private projection for normal updates, reconnect, spectators, and logs.

**Modifier pipeline:** distinguish printed values, base-value replacement, additive changes, costs in each zone, counter values, keyword grants/removals, restrictions, and negation. Keep printed definitions immutable. Specify precedence/dependencies from verified rules, not a guessed universal ordering. Model turn/battle/next-turn expiration and source dependencies explicitly; recompute continuous conditions as state changes. The same derived queries drive legality, combat, and server-projected display values. Use limits bind to the correct ability/source lifetime and survive reconnect.

**Extension policy:** a card using existing primitives requires only a definition, source record, and meaningful fixtures. A broadly shared new mechanic adds a reusable primitive and its tests, then card data. A bespoke interaction may instead add an isolated script module, manifest entry, and `CustomScript` reference; do not require every exception to become a core-engine primitive. Each script needs a documented reason, validated serializable parameters, privacy/continuation support, and behavior tests. No new per-card branches in the core loop or Colyseus server, or unbounded growth of `CardDef` booleans. Track DSL-only, script-backed, legacy, and unsupported abilities separately in coverage; review recurring script patterns for promotion into shared primitives.

Suggested module boundaries (final filenames can follow implementation needs):

```text
packages/rules/src/
  state/          instances, zones, snapshots, versioning
  registry/       schema, validation/compiler, immutable registry
  cards/          verified definitions, source records, generated coverage
  runtime/        intents, scheduler, timing, costs, operations, replacements
  scripts/        versioned manifest and isolated bespoke card modules
  scripting/      runner boundary, capability API, budgets, continuations
  queries/        predicates, selectors, derived stats, legality
  projection/     player/spectator views, choices, public events
  engine.ts       compatibility facade during migration
```

**Reproducibility:** pin each match to registry content hash (including gameplay metadata, script manifest/code hashes, and capability API versions), rules version, state version, and protocol version. Save RNG progression, accepted inputs, and resumable frames for deterministic replay. Do not hot-swap card behavior in running matches. Reject incompatible snapshots or migrate them explicitly; retain the prior runtime for existing rooms or drain those rooms during rollout. A release rollback must not silently load a new snapshot into an incompatible engine.

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

#### Card data source decision — arjunkai/optcg-api review (2026-09-16)

**Decision:** retain TCGCSV for prices, TCGPlayer product IDs, and existing printing/art mappings. Add an official Bandai gameplay-metadata import pipeline, adapting the useful parts of `arjunkai/optcg-api`'s scraper where appropriate. Do not replace our database with its hosted API or introduce live card-data requests during matches. This is planned work, not an implemented migration.

Findings from the repository review and local catalog inspection:

| Area | Evidence and implication |
|---|---|
| Current metadata | Our generated `catalogMeta.json` contains 2,834 IDs and 2,550 nonempty effect-text values, but no structured traits or separate Trigger text field. These counts describe stored data, not verified abilities. The generator infers keywords from text; replace that inference with reviewed executable definitions. |
| Upstream metadata | Their Bandai scraper extracts traits, attributes, counter, effect text, and separate Trigger text. This is useful input for reconciliation, but printed text does not implement abilities. [Scraper source](https://github.com/arjunkai/optcg-api/blob/main/scraper.py) |
| Field compatibility | Their scraper stores Leader Life in `cost`; normalize it into our separate Life field. Their schema separates base-card and parallel IDs; preserve that distinction when mapping to our gameplay IDs and existing cosmetic selections. [Schema](https://github.com/arjunkai/optcg-api/blob/main/schema.sql) |
| Coverage | Their README advertises OP01–OP15 and ST01–ST29 and counts alternate printings. Our snapshot includes IDs through OP18/ST36, with incomplete sets. Neither count establishes complete coverage; compare canonical IDs by set and locale. Live upstream completeness was not verified. [README](https://github.com/arjunkai/optcg-api#readme) |
| Hosted access | A direct unauthenticated card request returned `401` with `api key required`. The project documents approved access and origin restrictions. Do not make this service a required dependency. [Access policy](https://github.com/arjunkai/optcg-api#code-data-and-access) |
| Reuse | The code is MIT-licensed; its policy distinguishes code licensing from data rights and recommends running the scrape pipeline against upstream sources. Preserve license attribution for reused code; do not assume the code license grants reuse rights to the hosted database or art. [License](https://github.com/arjunkai/optcg-api/blob/main/LICENSE), [data policy](https://github.com/arjunkai/optcg-api#code-data-and-access) |

Required Phase 1 implementation work:

1. Add an importer for Bandai's official card list, with a pinned scraper revision and raw source snapshots. Keep ingestion separate from rules execution and the pricing sync; do not require deploying the upstream project's Workers/D1/R2 stack.
2. Normalize canonical card IDs, printing IDs, locale, card type, colors, traits, attributes, printed power/counter, Character/Event/Stage cost, Leader Life, effect text, and separate Trigger text. Preserve unknown values explicitly; distinguish a verified absent counter/ability from a missing field. Do not infer unconditional keywords from mentions in text.
3. Record source URL, retrieval time, source/content revision or hash, and field-level verification status. Track reviewed corrections and official errata separately so refreshes cannot silently overwrite them. Import success alone does not mark a card verified or implemented.
4. Produce a reconciliation report against the bundled inventory and curated definitions: missing/additional IDs, incomplete sets, duplicate printings, missing fields, and conflicting stats/text/traits. Use official evidence to resolve conflicts; retain unresolved entries as unverified. Preserve TCGPlayer product IDs and existing cosmetic mappings when joining metadata.
5. Generate deterministic, versioned local metadata snapshots consumed by `packages/rules` and client atlas generation. Publish only validated snapshots, retain the last valid snapshot on fetch/parse failure, and pin gameplay data together with the rules/registry version for a match. External updates must not change an ongoing match.
6. Add fixture-based import/normalization checks for all four gameplay card types, Leader Life mapping, null versus absent values, separate Triggers, conditional keyword text, duplicate/alternate printings, conflict detection, and failed/partial refreshes. Verify regeneration is deterministic and report catalog additions explicitly without shrinking the original ability scope.

**Data pipeline acceptance:** demonstrate the import → reconciliation → reviewed snapshot → rules/atlas path, with source provenance and unchanged pricing/printing associations. No runtime API dependency, silent loss of catalog IDs, or automatic support promotion. Continue the ability-runtime phases below; this pipeline strengthens source verification and does not replace executable ability authoring or tests.

**Implementation progress (2026-09-16):** `scripts/import_bandai_metadata.py` now collects explicitly requested Bandai series into content-addressed raw HTML and normalized candidate JSON, with source hashes/timestamps, unknown/unverified field states, separate Trigger text, Leader Life normalization, and a scoped reconciliation report. Candidate generation is deterministic for the same input; a failed refresh preserves the previous candidate manifest. It does not publish reviewed gameplay metadata or modify prices/cosmetics. A live ST01 import returned 17 printings and 11 text differences against the bundled metadata (including whitespace, storefront disclaimers, and combined Trigger text); these are review findings, not 11 confirmed rule defects. Five offline tests pass via `py -3 -m unittest discover -s scripts -p test_bandai_metadata.py`. Run the collector with `py -3 scripts/import_bandai_metadata.py --series 569001 --output artifacts/bandai`; repeat `--series` for additional sets. Full-set discovery/completeness checks, curated-definition reconciliation, reviewed corrections/errata, and publication into rules/atlas remain open, so the data pipeline exit gate is not met.

**Full discovery update (2026-09-16):** the collector now supports `--all-series`, discovers the official English series list, preserves the discovery-page source, and publishes a candidate only after all listed series succeed. The live run covered 60 series, 4,843 printings, and 2,785 base IDs, all already present in our bundled inventory. There are 49 bundled IDs absent from those fetched base rows; retain them as unresolved rather than deleting them or inferring that they are invalid. The report found 2,466 field differences and 7,325 populated candidate fields absent from stored metadata; these counts do not establish rule defects or verified values. See [reconciliation summary and exact missing IDs](audits/bandai_reconciliation_2026-09-16.json). Raw sources and the detailed candidate/report are under `artifacts/bandai-full/`. Seven offline collector tests and two source-ledger tests pass. The ledger no longer promotes traits/errata based solely on earlier card corrections. Reviewed publication, errata reconciliation, and rules/atlas integration remain open.

**Exit:** every catalog ID is accounted for; the data pipeline acceptance criteria above pass; no unsupported clause is marked implemented, and no unknown counter or keyword becomes a fabricated rule.

### Phase 2 — Shared effect execution and private choices

**Registry validation update (2026-09-16):** runtime validation now checks nested conditions, costs, selectors, operation targets/durations/numeric fields, unknown operation fields, timing/kind mismatches, and JSON compatibility before cross-reference traversal. Malformed definitions report paths including the card ID instead of crashing later on missing arrays. Compilation clones and deeply freezes programs and exposes read-only map views, preventing authoring-object or nested mutations from invalidating the registry hash. Validation: rules/server typechecks, the 128-test rules suite before the final timing checks, all 16 targeted registry tests after those checks, and 18 server tests. This does not establish generic scheduler completion or full-catalog support.

**Phase 2A — Registry and state contracts:** implement the versioned schema, registry validation, stable instance model, snapshot/RNG/version contract, and a temporary legacy adapter. Add schema rejection and snapshot round-trip tests. Pin one execution route per ability so the adapter and the new runtime cannot both fire it.

**Phase 2B — Generic runtime:** implement effect contexts, frames/continuations, predicates/selectors, payments, operations, timing dispatch, and private choice projections for the slice below. Separate internal rules events from client events. Make legacy paths call shared infrastructure during migration rather than maintaining two independent implementations of costs, movement, or visibility.

**Required hybrid additions to Phase 2A–2B:** extend the schema/compiler with `CustomScript`, a versioned manifest, parameter validation, and missing-module/version rejection. Implement the isolated runner, capability API, execution budgets, deterministic failure policy, and serializable script continuation in Phase 2B. Test capability restrictions, unknown references, budget exhaustion, invalid commands, no partial step commits, private choices, and identical replay/resume results. These are open requirements alongside the existing DSL migration.

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

**Architecture migration status (2026-09-16):** a versioned runtime-validated
ability schema, deterministic registry hash, match/rules/RNG version contract,
snapshot validation, serializable resolution frames, and stable hidden-zone
instance ledger now back the Laffitte, Fullalead, Moby Dick, and My Era search
slice. Their specialized definition fields and activated dispatch branches were
removed. Tests reject invalid registry programs, round-trip a paused private
search, compare resumed and uninterrupted results, and verify that the selected
card keeps its instance identity. The legacy adapter remains for abilities that
have not yet migrated; this update does not satisfy the all-curated migration or
full-catalog exit gates.

**Additional architecture exit gate:** the slice executes through schema-validated ability programs without slice-specific resolution branches. Serialize/restore a paused search and obtain the same final state/events and RNG progression as uninterrupted execution. Compare old/new results only for verified legacy behavior; separately test corrected rules. Existing search functionality alone does not meet this gate.

**Continuation update (2026-09-16):** the shared sequential runner now pauses at a search, resumes at the next operation, and stores parent/child frames for invoked abilities. Repeated searches use the current operation index rather than always selecting the first search in a program. My Era's Main and Life Trigger enter through registry windows, and its Trigger executes the declared invocation. A nested-program regression covers three successive searches, intervening operations, parent return, and equal results after JSON restoration; existing search snapshot tests remain green. Rules typecheck and 130 tests pass; server typecheck and 18 tests passed for the runner integration before the final Main/Trigger dispatch cleanup. Sequential operation coverage, general timing dispatch, and full migration remain incomplete.

**Snapshot/RNG update (2026-09-16):** RNG restoration now derives Mulberry32 state directly from its validated seed/cursor instead of replaying every previous draw on each action. Tests compare 10,000 outputs for five seeds against the previous algorithm, resume shuffled output, and exercise cursors beyond 2^32 and invalid/exhausted states. Rules version is now `0.2.1`; incompatible older snapshots are rejected. Snapshot checks additionally validate continuation positions, ability/source references, parent invocation links, duplicate/orphaned frames, and paused-search binding lengths. Tests cover corrupted continuations and round-trip My Era's actual nested Trigger frames. Rules typecheck and all 151 rules tests pass. Full match-state validation, stable identity across every legacy zone movement, and match-server persistence remain separate open requirements.

### Phase 3 — Modifiers, costs, and combat keywords

**Keyword migration update (2026-09-16):** curated Blocker and Rush now execute through registry grants, including Uta's Blocker alongside its hand-cost ability. Static `CardDef.blocker`/`rush` fields are removed; unconditional atlas keywords and coverage hooks derive from the registry. Newly played Characters retain their turn-entry restriction internally, so current Rush grants and negation determine immediate attacks dynamically. Ordinary Rush permits Leader attacks; Rush: Character alone does not. All 135 rules tests pass, including negation for Roger and all four curated Blocker cards, and the desktop/mobile atlases were regenerated. This migrates existing keyword cards without claiming support for the remaining keyword families or fallback catalog.

**Runtime correction update (2026-09-16):** continuous abilities now check their source zone before evaluating conditions, preventing hand-cost conditions from recursively evaluating field power. Ace uses an explicit counter replacement operation, so multiple copies do not stack. Teach uses a separate field-cost operation for board targeting and projected field cost; desktop/mobile cost-limited prompts consume that value. Devon's copied base power now participates in power calculation and expires at the end of the turn, as do turn-scoped Character/Leader replacements. Regression checks: rules typecheck and 116 tests, duel-web build and 137 tests, server typecheck, and syntax checks for the two changed mobile files. Full mobile typecheck and interactive prompt review remain outstanding; these checks do not complete the modifier or UI acceptance gates.

1. Separate printed/base/current power, field cost, hand play cost, and counter value. Add continuous and duration-limited modifiers with explicit expiration and source-departure semantics.
2. Add general per-source/per-ability use tracking, played-this-turn state, DON requirements and payments (rest, return, attach), hand/reveal/trash costs, trait/name/color conditions, and effect negation.
3. Support conditional Rush, Rush: Character, Double Attack, Banish, Unblockable, allowed attack targets, blocked/attack/ready restrictions, and granted/lost keywords.
4. Complete simple buffs, reductions, and counter events using shared targeting; then Atmos, Uta, Izo, Ace's counter override, Newgate/Jozu base power, Burgess scaling, and OP17-112's aura.
5. Complete the full ST01 set as a small acceptance milestone across all four card types (including Nami, Brook, Jet Pistol, Diable Jambe, and Thousand Sunny).
6. Migrate specialized power/cost/counter fields and keyword branches into the shared modifier/condition system. Add an ordinary continuous-aura card as a data-only acceptance case once its conditions and targets are supported; source removal, changing DON, turn changes, and negation must update its effects automatically.

**Exit:** modifiers expire exactly, change legal actions immediately, and agree between server resolution and displayed values; multi-damage and keyword interactions behave correctly.

### Phase 4 — Zone movement, Life Triggers, and replacement effects

**Draw-program migration (2026-09-17):** added a schema-validated `draw_cards` sequential operation. Baby 5 OP12-112 and Shiryu OP16-108 now use registry Life Trigger programs; Baby 5's multicolored-Leader predicate is declarative, and their specialized draw fields/conditional hook were removed. Their Trigger text was checked against the captured official Bandai snapshot. Sequential execution stops and clears pending continuations when drawing ends the game. The 154 existing rules tests and five new draw-program tests pass, covering draw count, original instance identity, condition failure, declining to hand, and deck-out; rules typecheck passes. Devon's combined draw/play Trigger and other legacy draw paths still require migration.

**Responsive prompt review (2026-09-16):** `node scripts/review_trash_prompt.cjs` exercises the actual desktop `OnPlayPrompt` component served by Vite at port 5174 in headless Edge (or Chrome via `CHROME_PATH`). At 375px and 1200px it verifies one selected duplicate, exact option-ID submission, selection reset on a new prompt, and no horizontal overflow. Screenshots `artifacts/trash_prompt_375.png` and `artifacts/trash_prompt_1200.png` were inspected. This is a component-level responsive-web review; native mobile and an end-to-end live-match walkthrough remain open.

**Mobile validation update (2026-09-17):** installed the existing locked mobile dependencies with `npm ci`. Full `npm run typecheck` now passes after adding the generated atlas metadata fields used by the prompt (including traits). All six mobile tests pass; the stale Sanji unconditional-Rush expectation now checks conditional behavior is left to the server, alongside Roger's unconditional flag and trait/Trigger metadata. The dependency install reported that Metro/React Native require a newer Node release than this shell's v22.8.0; use a supported runtime before native launch/build validation. Native-device interaction and full live-match walkthrough remain open, but mobile validation is no longer limited to syntax checks.

**Trash-choice migration update (2026-09-16):** trash-to-Life, trash-to-hand, and trash-to-field prompts now submit `selectedTrashOptionId`, an opaque per-prompt handle bound to the selected instance. Internal instance bindings are stripped from projected options; stale/moved copies are rejected without mutation. Both clients select duplicate cards independently; desktop On Play prompts remount by choice ID to clear stale selections. Protocol is now **4** across rules/server/desktop/mobile, requiring coordinated deployment. The definition-ID submission field is removed. Validation: 154 rules tests, 18 server tests, 137 desktop tests, rules/server typechecks, and desktop build (before the final prompt-key change); changed mobile files pass syntax checks. Interactive desktop/mobile prompt review and full mobile typecheck remain open.

**Identity migration update (2026-09-16):** shared `putInZone`/`takeFromZone` helpers now preserve definition/instance pairing for discard costs, Counter/Main Event disposal, Character K.O., field-space trashing, Stage replacement, trash retrieval/play/revival, trash-to-Life, hand-to-deck, and effect Life-to-hand moves. Marco's self-revival records and retrieves the actual K.O.'d instance instead of the first matching card number in trash. The 151 existing rules tests pass with the duplicate-Marco regression; two additional integration tests verify middle-trash retrieval and Stage replacement identity. Rules/server typechecks pass. Remaining work includes replacing definition-ID selection in legacy trash prompts, auditing all paired-array mutations, and removing silent identity-ledger repair after fixtures and state construction use explicit identities consistently. This update does not satisfy the complete zone/identity gate.

1. Centralize zone movement with causes: play, effect/battle K.O., other trash, hand return, deck top/bottom, Life movement. Ensure replaying a card triggers the right entry effects and handles a full field.
2. Model Life visibility and ordering; implement all Trigger bodies, including “activate Main/On Play/On K.O.” without pretending that the referenced event actually occurred. Correct accepted/declined Trigger destinations and damage continuation.
3. Add K.O. restrictions, removal replacement, last-known source information, recursion handling, and effect immunity versus negation. Resolve simultaneous rule outcomes, deck exhaustion, and explicit special victories.
4. Complete the Blackbeard and Whitebeard curated suites: Rayleigh, Devon, Wolf, Shiryu, Doc Q, Vasco Shot, Teach, Marco, Roger, and remaining Events/Linlin clauses.

**Exit:** all 44 curated definitions have complete verified ability coverage, with no unresolved clause, conditional keyword, or incorrect identity. A card with multiple abilities is not complete when only its main effect works.

**Migration exit:** every curated ability has one registry-backed execution route. Remove migrated booleans, ID-specific dispatch, obsolete prompt branches, and the legacy adapter after their last consumer moves. Update support/atlas generation from the validated registry plus reviewed source/test evidence; parsing printed tags remains an audit aid only. No broad expansion while curated cards still require the legacy dispatcher.

### Phase 5 — Finish every catalog card in reviewable batches

**Additional entry gate — script-backed card addition:** implement an officially verified complex card through a separate script file and `CustomScript` definition, using the established capability API with zero card-specific engine/server/protocol branches. Include meaningful edge-case, privacy, and replay fixtures; prove serialize/resume for a script that requests a choice. This supplements the data-only gate below. Report both authoring routes in each batch ledger.

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
- Validate script manifests, code hashes, capability versions, isolation/budget enforcement, and deterministic script failure/replay in CI. Exercise script-backed effects through server timers, reconnect, and both clients using shared choice contracts. A script reference alone never establishes implemented support.
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

The registry/search migration is underway, with shared draw programs and curated behavior corrections also implemented. The next milestone is to finish the remaining Phase 2 contracts and curated migration, including the approved hybrid script boundary, while completing Phase 1 source verification. Use declarative data for the baseline and isolated script modules for bespoke effects; do not resume per-card core/server branches. Deliver independently verified slices through all acceptance gates; deployment remains separate from this documentation update.
