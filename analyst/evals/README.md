# Log Pose evals

Four suites, each with its own `run.ts` and npm script (see [`../README.md`](../README.md#evals) for what each measures and the commands).

| folder | npm script | output |
|---|---|---|
| `qa/` | `eval`, `eval:compare`, `eval:grade`, `eval:validate`, `eval:check-live` | `out/<variant>/` |
| `puzzles/` | `eval:puzzles` | `out/puzzles/<variant>/` |
| `review-facts/` | `eval:review-facts` | `out/review-facts/<variant>/` |
| `deck-advice/` | `eval:deck-advice` | `out/deck-advice/<variant>/` |

- `qa/`: the original 50-case suite (#403) with its cases, gold, runner, report, `baseline.json` and `human-grades.jsonl`. The other suites reuse its `scripted.ts` (scripted model) and `stats.ts` (intervals).
- `grade/`: the graders (exact, citations, grounding, rubric judge, edits). `qa/` and `deck-advice/` use them.
- `shared/`: what more than one suite needs. `planner.ts` is the fake in-memory planner API, `post.ts` sends a run to the admin page, `retry.ts` and `trace.ts` wrap model calls, and `cli.ts` holds the runners' common scaffolding: the shared flags (`commonOptions`), the `--model-api` and `ANTHROPIC_API_KEY` check (`modelApi`), the default variant name, the output folders, the meta decks file, the planner fixtures and the client.
- `fixtures/`: synthetic matchup stats and tournament answers for the fake planner. Each suite keeps its own fixtures beside it.
- `out/`: run output, git-ignored.

A new suite is a folder with a `run.ts` that calls `modelApi`, `defaultVariant` and `suiteOutDir` from `shared/cli.ts` and declares only its own flags, plus an npm script and a `postEvalRun` suite name if it posts to the admin page.

Tests live beside the code (`vitest` includes `evals/**/*.test.ts`).
