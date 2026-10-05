import { configDefaults, defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Stryker runs the suite from a sandbox copy of packages/rules, so tests that
// read files elsewhere in the repo can't find them. The deckStats.json sync
// check is one; it guards a generated planner file, not the engine code
// Stryker mutates, so leave it out of the mutation run.
export default mergeConfig(
  base,
  defineConfig({
    test: { exclude: [...configDefaults.exclude, "src/__tests__/plannerStats.test.ts"] },
  }),
);
