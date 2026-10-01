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

`--check-anchors` runs no tests: it only checks that every mutation's `from`
(and each `edits[].from`) still matches exactly once and every `json` patch
applies, exiting 1 on any stale one. It takes about a second for all suites and
runs in PR CI and nightly.

```bash
node tools/mutation-check/run.cjs --check-anchors   # all suites, no tests
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
| `frontend-e2e` | `frontend/e2e` (starts Vite on :5180; the API is faked in the browser) | Playwright; a mutation's `args` narrows the spec and project |

Every test in these suites is covered by at least one mutation. Each mutation
re-runs its whole suite, so a full run of every suite takes a few hours; use
`--only` while iterating. The baseline must be green first. The exit code is 1 if a
mutation **survives** (none of its expected failures happened) or goes
**stale** (its anchor no longer matches the source exactly once).

Only one run at a time per checkout: all suites share the restore journal, so a
second run would "restore" files the first is mutating mid-test and make its
mutations falsely survive. `run.cjs` holds `.run.lock` and refuses to start
while another run is alive.

## Breadth tools (nightly, report-only)

The curated suites above prove that specific tests can fail. Two generic
mutation tools run nightly (`.github/workflows/nightly.yml`) to find code that
**no** test kills: StrykerJS for `packages/rules` (`src/engine`, `src/effects`;
`packages/rules/stryker.config.json`) and mutmut for the backend pricing and
aggregation modules (`backend/setup.cfg`).

- Survivors are a to-do list, not a score. Read the step summary, pick the ones
  that are real behavior, and add a test plus a curated entry here. Many are
  equivalent or cosmetic mutants (log strings, ids); ignore those and do not
  chase a percentage. Neither tool fails the job on survivors
  (`thresholds.break` is null; mutmut exits 0). Only tool errors fail the job
  and open the nightly issue.
- Smoke runs, from `packages/rules`: `npx stryker run --mutate src/engine/modifiers.ts`
  (about 3 minutes; `npm run mutation:stryker -w @optcg/rules` is the full run).
  Stryker works in a sandbox copy (`.stryker-tmp`), so it is safe next to
  `run.cjs`. Output goes to the git-ignored `packages/rules/reports/`.
- Known caveat: with the vitest runner Stryker's incremental IDs can churn
  (stryker-js #6004), so the cached `reports/stryker-incremental.json` may
  invalidate and re-run mutants it should have reused. The nightly cache is a
  best-effort speedup; a cold run just takes longer.
- mutmut install: `pip install -r backend/requirements-mutation.txt` after
  `requirements.txt` (a separate step because the lock is hash-pinned). Smoke
  run, from `backend`: `mutmut run "app.group_buy_merge*"`, then `mutmut results`.
  mutmut 3 writes a copy of `app/` and `tests/` to the git-ignored
  `backend/mutants/` and mutates there, but it runs pytest for every mutant and
  reuses `backend/tests`, so treat it as heavy and CI-first. Never run it, or
  Stryker's full run, at the same time as `run.cjs` in one checkout: both load
  the machine and the timeouts they rely on become flaky, which produces false
  survivors in the curated run.

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
