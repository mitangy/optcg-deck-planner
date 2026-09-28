# Card effects catalog & resolution order

Authority for how curated OPTCG prints are documented and ordered in
`@optcg/rules`. Card text still wins when it conflicts with this doc; update
both together.

## Where things live

| Artifact | Path | Role |
|----------|------|------|
| Full effect catalog | `packages/rules/src/cards/effectCatalog.ts` | One row per printed timing/clause for every curated def; `status` = implemented / partial / keyword / stub |
| Leader ability catalog | `packages/rules/src/cards/leaderAbilities.ts` | Leader-only hooks (Luffy / Newgate / Teach) already shipped |
| Ordering helpers | `packages/rules/src/effectOrder.ts` | APNAP sort + controller `order_effects` pending choice |
| Engine queue | `MatchState.pendingChoices` | FIFO prompts; `order_effects` must be answered before ability prompts |

Inspect UI continues to show `CardDef.effectText`. **Display text alone is not
rules authority** — a row must be `implemented` (or `keyword`) before the engine
is allowed to change game state for that clause.

Auto-stubbed ids (`ensureCardDef`) may carry printed `effectText` copied from
cosmetics meta (`catalogMeta.json` ← `cardCatalog.json` / TCGCSV). That text is
for inspect/reference only; stubs still get **no** invented engine hooks.
`export-atlas` writes an `abilitySupport` field (`none` / `keywords` / `ok` /
`partial` / `unsupported`) from explicit reviewed EFFECT_CATALOG statuses.
Cosmetics-only cards are `unverified`; text and keyword scans never grant rules
support. duel-web CardInspect shows a short note for `unverified`, `unsupported`,
and `partial` cards.

## Timing glossary

| Timing tag | Typical window | Engine status today |
|------------|----------------|---------------------|
| `[Activate: Main]` | Main phase, controller's turn | Leaders: Luffy implemented; Characters/Stages mostly stub |
| `[On Play]` | After a Character/Stage enters play | Optional-draw hook exists; most curated On Play texts are stub |
| `[When Attacking]` | After attack declaration | Stub (framework kind `when_attacking` reserved) |
| `[On K.O.]` | When the Character is KO'd | Stub |
| `[Opponent's Turn]` | Static while it is the opponent's turn | Teach field-cost modifier remains stubbed |
| `[On Your Opponent's Attack]` | After opponent declares attack, before Block | Newgate / Teach leaders implemented |
| `[Trigger]` | Optional when taken as Life damage | Draw and OP09-096 Main-effect activation are implemented; other printed Trigger text remains stubbed |
| `[Counter]` | Counter step | Flat `counterPowerBonus` implemented; extra "Then…" clauses partial/stub |
| `[Main]` (Event) | Main event resolution | Encoded draw and top-deck search effects resolve; KO and other unique event clauses remain stubbed |
| `[Blocker]` / `[Rush]` | Keyword | Keyword flags implemented |

Top-deck searches use opaque option handles and server-side validation. Candidate
identities and eligibility are projected only to the choosing seat; opponents and
spectators receive the option count. The shared slice covers Laffitte, Fullalead,
Moby Dick, My Era...Begins!!, and I Don't Have Time to Chat with Snot-Nosed Brats,
including ordered bottom-deck remainders and the My Era Life Trigger.

Static modifiers currently include OP17-112's Trigger-character base-power aura
and OP09-086's four-card trash scaling while its leader condition is satisfied.

## Simultaneous effects — resolution order

Encoding (matches Step 1 plan + Comprehensive Rules intent):

1. **Turn player first, then opponent** (APNAP-style).
2. **Within one player's simultaneous effects, that player chooses the order.**

### Engine API

```ts
enqueuePendingChoices(state, choices, turnPlayer, events)
// If one seat has ≥2 choices in the window → pending kind "order_effects"

applyIntent(state, {
  type: "order_pending_effects",
  orderedIds: ["choice_b", "choice_a"], // permutation of unorderedChoices ids
}, ctx)
```

After a legal order is submitted, the wrapper is removed and the ability prompts
are inserted at the front of `pendingChoices` in the chosen sequence. Each is
then resolved with the existing `resolve_pending_choice` flow.

Illegal permutations (duplicates, missing ids, wrong length) fail closed.

### Live wiring (engine)

`enqueuePendingChoices` is called from live trigger sites — not only unit tests:

- **Attack declaration** — `enqueueAttackDeclarationTriggers` collects defender
  leader On-Opponent's-Attack (and is the batch point for future When Attacking /
  Stage triggers) then enqueues with the attacker as turn player.
- **Life damage triggers** — optional Trigger prompts enqueue through the helper.
- **On Play** — optional On Play prompts enqueue through the helper (so multiple
  On Play clauses in one window can wrap in `order_effects`).

### Client protocol & UI

- Wire protocol **v3** adds `order_effects` + `unorderedChoices` on pending
  choice views and recognizes `order_pending_effects`.
- `listLegalIntents` still emits a **default** order (original sequence) for
  sims/bots. Live clients must show a reorder UI (`EffectOrderPrompt`) so the
  player can send any permutation — do not treat the default legal intent as
  the only choice.
- Remount the prompt with `key={choice.id}` so local reorder state resets when
  a later order window opens (do not reuse a stale list from a previous choice).
- **duel-web** and **mobile** both ship `EffectOrderPrompt`. Today most windows
  still enqueue a single choice, so the prompt is uncommon until When Attacking
  / multi-On-Play batches land.

### Deploy coupling (protocol v3)

Ship **game-server + duel-web + mobile** on protocol 3 together. A v2 client
cannot join a v3 room (and vice versa). Prefer releasing the server bump in the
same window as both clients; avoid mixed-version production traffic.


## Coverage policy

- Every curated `listCardDefs()` id must appear in `EFFECT_CATALOG` (enforced by tests).
- New curated prints: add hooks **or** leave `status: "stub"` — never silently invent behavior.
- Prefer omitting unsupported prints from legal constructed lists over fake resolution.
- When implementing a stub, update the catalog hook mapping and add an engine test.

## Coverage snapshot

Regenerate anytime with:

```bash
cd packages/rules && npx tsx -e "import { summarizeEffectCoverage } from './src/cards/effectCatalog.ts'; console.log(summarizeEffectCoverage())"
```

Expect many `stub` rows for OP09 / OP16 / OP17 characters and events until
per-timing resolvers land. A card with one implemented row and any stub row is
reported as `partial`. `buildCardSupportManifest()` accounts for every bundled
catalog ID and reports all non-curated cards as `unverified`.

## Related docs

- `packages/rules/README.md` — public API + known gaps
- `docs/duel-client/CONTENT.md` — how to add a card / keyword budget
- `docs/duel-client/steps/01-rules-engine.md` — turn/battle model + simultaneous-effect rule
- `packages/rules/src/cards/leaderAbilities.ts` — leader ability catalog
