# Mutation check

Proves that tests fail when the behavior they claim is broken. A test that
still passes under the opposite condition cannot prove what it says. Fix it,
or delete it.

Each **mutation** is a small edit to production code (or a data file) that
does the opposite of one claimed behavior. Examples: skip untapping during
refresh, accept an unpayable cost, leak hidden choice options. The runner
applies one mutation, runs the owning suite, and checks that the tests named
in `kills` fail. It then restores the file, including on Ctrl+C. Originals are
journaled to `.pending-restore.json` first, so if a run is hard-killed the
next run restores any file it left mutated.

```bash
npm run test:mutation                                         # all suites
node tools/mutation-check/run.cjs rules                       # one suite
node tools/mutation-check/run.cjs rules --only "snapshot|rng"  # mutation ids matching a regex
```

| Suite | Tests | Runner |
|---|---|---|
| `rules` | `packages/rules/src/__tests__` | vitest |
| `duel-web` | `duel-web/src` | vitest |
| `mobile` | `mobile/src` | vitest |
| `importer` | `scripts/test_bandai_metadata.py` | unittest (`PYTHON` overrides `py -3` / `python3`) |
| `backend` | `backend/tests` | pytest (`BACKEND_PYTHON`: a Python with `backend/requirements.txt` installed) |
| `frontend` | `frontend/src` | vitest |
| `game-server` | `game-server/test` | mocha |
| `cosmetics` | `scripts/test_cosmetics_product_ids.py` | unittest |
| `duel-e2e` | `duel-web/e2e` (starts a game server and Vite) | Playwright; a mutation's `args` narrows the spec and project |

Every test in these suites is covered by at least one mutation. Each mutation
re-runs its whole suite, so a full run of every suite takes a few hours; use
`--only` while iterating. The baseline must be green first. The exit code is 1 if a
mutation **survives** (none of its expected failures happened) or goes
**stale** (its anchor no longer matches the source exactly once).

Only one run at a time per checkout: all suites share the restore journal, so a
second run would "restore" files the first is mutating mid-test and make its
mutations falsely survive. `run.cjs` holds `.run.lock` and refuses to start
while another run is alive.

## Adding a test

When you add or change a test, add one mutation per behavior it claims, in
`suites/<suite>.cjs`:

```js
{ id: "refresh-no-untap",
  file: "packages/rules/src/engine/procedure.ts",
  from: "exact source text (must occur exactly once)",
  to: "the opposite behavior",
  kills: ["fragment of the test's full name"] }
```

- Target the code path the test exercises. If the mutation breaks a different
  path, the test survives and tells you nothing about the test.
- Use `edits: [{ file, from, to }, …]` when one behavior is enforced in
  several places (for example, duplicate-id checks in both the validator and
  the registry).
- A mutation can set `requiresEnv: "NAME"` when it only has an effect with
  that environment variable set (for example Postgres-only behavior under
  `TEST_DATABASE_URL`); without it the runner reports it as skipped.
- pytest mutations can set `args` (e.g. `"tests/test_config.py"`) when the
  opposite condition breaks app startup and would crash collection for the
  whole suite before the named test can report its own failure.
- For assertions about generated data, use `json` plus a `patch` function
  instead of a source edit.
- A mutation whose only kills are unrelated crashes proves nothing. Check that
  the named test fails on the assertion you meant.

Stale anchors are expected after refactors. Update `from` to the new source,
keeping the same opposite condition.
