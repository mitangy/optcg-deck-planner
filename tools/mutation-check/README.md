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

A full run of every suite takes roughly 15–20 minutes, because each mutation
re-runs its suite. The baseline must be green first. The exit code is 1 if a
mutation **survives** (none of its expected failures happened) or goes
**stale** (its anchor no longer matches the source exactly once).

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
- For assertions about generated data, use `json` plus a `patch` function
  instead of a source edit.
- A mutation whose only kills are unrelated crashes proves nothing. Check that
  the named test fails on the assertion you meant.

Stale anchors are expected after refactors. Update `from` to the new source,
keeping the same opposite condition.
