import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Stryker runs the suite from a sandbox copy of packages/rules, so tests that
// read files elsewhere in the repo can't find them. The deckStats.json sync
// check is one; it guards a generated planner file, not the engine code
// Stryker mutates, so leave it out of the mutation run.
//
// The hard bot suites play whole searched games and take about 75% of the
// suite's time. Stryker reruns them for nearly every engine mutant, which
// pushed the runtime.ts and queries.ts shards past the job timeout on
// 2026-10-25. They test src/bot, which Stryker doesn't mutate, so leave them
// out too; the engine rules they touch have their own scenario tests.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: [
        ...configDefaults.exclude,
        "src/__tests__/plannerStats.test.ts",
        "src/__tests__/hardBot.test.ts",
        "src/__tests__/hardBotV2.test.ts",
      ],
    },
  }),
);
