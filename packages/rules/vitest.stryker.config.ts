import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Stryker runs the suite from a sandbox copy of packages/rules, so tests that read files elsewhere in the repo (the
// deckStats.json sync check) can't find them.
// The hard bot suites take about 75% of the suite's time and pushed the engine shards past the job timeout. They test
// src/bot, which Stryker doesn't mutate, so leave them out.
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
