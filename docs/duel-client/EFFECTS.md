# Card effects catalog & resolution order

Authority for how card abilities are documented and ordered in `@optcg/rules`.
Card text still wins when it conflicts with this doc; update both together.
For the engine's design see [ARCHITECTURE.md](./ARCHITECTURE.md) §3.3 and for
authoring steps see [packages/rules/README.md](../../packages/rules/README.md)
("Adding or fixing a card").

## Where things live

| Artifact | Path | Role |
|----------|------|------|
| Ability types | `packages/rules/src/effects/types.ts` | The declarative vocabulary: conditions, costs, selectors, effects, triggers, statics, durations, keywords |
| Validation / compile | `packages/rules/src/effects/validate.ts`, `compile.ts` | Reject malformed abilities; flatten effect trees into serializable instruction lists |
| Ability registry | `packages/rules/src/cards/abilities.ts` | Generated + manual abilities merged and validated; `REGISTRY_HASH` pins the version |
| Generated abilities | `packages/rules/src/cards/generated/abilities.json` | Output of `npx tsx src/tools/cardText/generate.ts` from the printed text |
| Manual overrides | `packages/rules/src/cards/manualAbilities.ts` | Reviewed `abilities` / `patch` entries for text the compiler cannot express |
| Effect catalog | `packages/rules/src/cards/effectCatalog.ts` | `EFFECT_CATALOG`: one row per printed clause with its support status; also `abilitySupport` per card |
| Engine | `packages/rules/src/engine/` | `intents.ts` (apply and list intents), `procedure.ts` (triggers, ordering), `runtime.ts` (instruction interpreter barrel), `ops.ts` + `ops/` (leaf op handler table), `queries.ts`, `views.ts` |
| Engine queue | `MatchState.pendingChoices` | FIFO prompts for the player who must answer |

Inspect UI shows `CardDef.effectText`. **Display text alone is not rules
authority**: the engine changes game state only for clauses that compiled into
a validated ability. `export-atlas` writes an `abilitySupport` field (`none` /
`keywords` / `ok` / `partial` / `unsupported` / `unverified`) from `EFFECT_CATALOG`;
cosmetics-only cards are `unverified`, and text or keyword scans never grant
rules support. duel-web CardInspect shows a short note for `unverified`,
`unsupported` and `partial` cards.

## Simultaneous effects: resolution order

Encoding (matches Step 1 plan + Comprehensive Rules intent):

1. **Turn player first, then opponent** (APNAP-style).
2. **Within one player's simultaneous effects, that player chooses the order.**

When one seat has two or more triggered effects in the same window,
`engine/procedure.ts` adds a pending choice of kind `order_effects` carrying
`unorderedChoices`. The seat answers with

```ts
applyIntent(state, {
  type: "order_pending_effects",
  orderedIds: ["choice_b", "choice_a"], // permutation of unorderedChoices ids
}, ctx)
```

`applyTriggerOrder` checks the permutation (duplicates, missing ids or a wrong
length fail closed), replaces the wrapper with the individual prompts in the
chosen order, and each is then answered with `resolve_pending_choice`.
`resolve_pending_choice` on an `order_effects` choice is rejected, and the other
way round.

### Client protocol and UI

- The wire protocol version is `RULES_PROTOCOL_VERSION` in
  `packages/rules/src/state/snapshot.ts`; the game server reports it on `/health`.
  A client on a different version cannot join a room, so ship game-server and
  duel-web together when it changes.
- `listLegalIntents` emits a **default** order (the original sequence) for sims
  and bots. Live clients must show a reorder UI (`EffectOrderPrompt` in
  `duel-web/src/board/`) so the player can send any permutation; do not treat
  the default legal intent as the only choice.
- Remount the prompt with `key={choice.id}` so local reorder state resets when
  a later order window opens.

## Adding a new effect op

A card that only combines existing pieces needs data, not engine code (see the
README checklist). A new `Effect["do"]` variant is an engine change. The compiler
tells you what is missing: each step below has a compile-time check, so `npm run
typecheck -w @optcg/rules` lists the files you have not touched yet.

1. `effects/types.ts`: add the variant to `Effect` (new conditions, costs and
   statics go in `Cond`, `Cost`, `Static` the same way).
2. `effects/validate.ts`: add its entry to the matching `tagged(...)` map. The maps
   are `satisfies Record<Effect["do"], V>` (and `Cond["c"]`, `Cost["k"]`,
   `Static["s"]`), so a missing or extra variant fails `tsc`.
3. `effects/compile.ts`: only if the op needs several steps or a player choice,
   lower it to instructions (the frame stores only an instruction index and JSON
   bindings, so it can be serialized and resumed). Plain leaf ops fall through to
   `{ op: "act" }`. `compileCost` ends in `assertNever`, so a new `Cost` kind must be
   handled there.
4. `engine/ops/`: add the handler to the group that fits (`zones`, `modifiers`,
   `don`, `life`, `info`, `flow`) and list its tag in that file's `OpTable<...>`
   type. `engine/ops/index.ts` assembles `OPS: { [K in Effect["do"]]: OpHandler<K> }`,
   so an op with no handler fails `tsc`. Ops the compiler lowers instead go in
   `engine/ops/lowered.ts` and keep throwing "has no leaf executor".
5. If players see it, project it in `engine/views.ts` (and `describeEvents.ts` for new
   events) without leaking hidden information.
6. Teach the compiler grammar (`src/tools/cardText/`) the printed phrasing, then
   regenerate `abilities.json`.
7. Add scenario rows (`src/__tests__/scenarios/`) and a mutation for each in
   `tools/mutation-check/suites/rules.cjs`.

## Coverage policy

- `EFFECT_CATALOG` is built from every card with catalog data; `buildCardSupportManifest()` lists each id.
- New prints: encode the abilities **or** leave the clause unsupported; never silently invent behavior.
- Prefer omitting unsupported prints from legal constructed lists over fake resolution (ranked rooms already reject them).

## Coverage snapshot

Regenerate anytime with:

```bash
cd packages/rules && npx tsx -e "import { summarizeEffectCoverage } from './src/cards/effectCatalog.ts'; console.log(summarizeEffectCoverage())"
npm run scenario-coverage -- --summary OP01 EB01   # supported cards no test mentions, by set
```

A card with one implemented row and any unsupported row is reported as `partial`.
`buildCardSupportManifest()` accounts for every bundled catalog id and reports
cosmetics-only cards as `unverified`.

## Related docs

- `packages/rules/README.md`: public API, adding a card, known gaps
- `docs/duel-client/CONTENT.md`: card art and cosmetics pipeline (its hook-based sections are historical)
- `docs/duel-client/steps/01-rules-engine.md`: turn/battle model + simultaneous-effect rule
