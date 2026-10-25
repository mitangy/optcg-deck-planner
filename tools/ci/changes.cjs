#!/usr/bin/env node
/**
 * Which CI jobs a pull request needs, from the paths it changes.
 *
 *   git diff --no-renames --name-only <base> HEAD | node tools/ci/changes.cjs
 *
 * Prints `<flag>=true|false` lines (the `$GITHUB_OUTPUT` format) for: rules,
 * duel_web, duel_e2e, frontend, backend, mobile. Pushes to main skip this and
 * run every job.
 *
 * Be conservative: a path no rule below names turns every flag on, so a missed
 * dependency costs CI minutes, never a broken merge. A rule may only turn flags
 * off for a path after checking that no test, build or script in the other
 * jobs reads it. Cross-directory dependencies behind the table (checked with
 * grep, #739):
 *   - packages/*: duel-web and frontend alias `@optcg/*` to packages/*\/src
 *     (vite.config.ts, vitest.config.ts, tsconfig.json); game-server and analyst
 *     depend on @optcg/rules; every package's tests run in the rules job; the
 *     duel-web e2e specs import packages/patch-notes.
 *   - packages/rules/protocol-fixtures: also read by the mobile tests.
 *   - game-server: duel-web e2e starts it (duel-web/playwright.config.ts).
 *   - backend/tests/fixtures: game-server's briefTicket test reads the shared vector.
 *   - analyst: imported by nothing else; it reads packages/rules and
 *     packages/deck-analytics data (covered by the packages rule).
 *   - scripts: the Python script tests mock the data files they touch.
 */
"use strict";

const FLAGS = ["rules", "duel_web", "duel_e2e", "frontend", "backend", "mobile"];

/** Ordered: the first matching rule wins. `flags: []` means no job needs to run. */
const RULES = [
  { test: (p) => p === ".github/workflows/ci.yml", flags: FLAGS },
  { test: (p) => p === "package.json" || p === "package-lock.json", flags: FLAGS },
  { test: (p) => p.startsWith("tools/ci/"), flags: FLAGS },
  { test: (p) => p.startsWith("docs/"), flags: [] },
  // Only files directly in the repo root: README.md, CLAUDE.md, AGENTS.md.
  { test: (p) => /^[^/]+\.md$/.test(p), flags: [] },
  // Screenshots for PR descriptions and agent tooling; no code reads them.
  { test: (p) => p.startsWith("artifacts/") || p.startsWith(".claude/"), flags: [] },
  // The other workflows run on their own schedules; nothing in CI reads them.
  { test: (p) => p.startsWith(".github/"), flags: [] },
  // The suites' anchors are checked by mutation-plan; the anchors check in the rules job also runs.
  { test: (p) => p.startsWith("tools/mutation-check/"), flags: ["rules"] },
  { test: (p) => p.startsWith("packages/rules/protocol-fixtures/"), flags: ["rules", "duel_web", "duel_e2e", "frontend", "mobile"] },
  { test: (p) => p.startsWith("packages/"), flags: ["rules", "duel_web", "duel_e2e", "frontend"] },
  { test: (p) => p.startsWith("game-server/"), flags: ["rules", "duel_e2e"] },
  { test: (p) => p.startsWith("analyst/"), flags: ["rules"] },
  { test: (p) => p.startsWith("backend/tests/fixtures/"), flags: ["backend", "rules"] },
  { test: (p) => p.startsWith("backend/") || p.startsWith("scripts/"), flags: ["backend"] },
  { test: (p) => p.startsWith("duel-web/"), flags: ["duel_web", "duel_e2e"] },
  { test: (p) => p.startsWith("frontend/"), flags: ["frontend"] },
  { test: (p) => p.startsWith("mobile/"), flags: ["mobile"] },
];

/** @param {string[]} paths repo-relative changed paths (renames listed as both old and new) */
function classify(paths) {
  const on = new Set();
  const list = paths.map((p) => p.trim().replace(/^\.\//, "")).filter(Boolean);
  // Nothing to judge usually means the diff failed to find the base: run everything.
  if (!list.length) return Object.fromEntries(FLAGS.map((f) => [f, true]));
  for (const p of list) {
    // A path that climbs out of its folder could dodge a prefix rule.
    const rule = p.split("/").includes("..") ? null : RULES.find((r) => r.test(p));
    for (const f of rule ? rule.flags : FLAGS) on.add(f);
  }
  return Object.fromEntries(FLAGS.map((f) => [f, on.has(f)]));
}

module.exports = { classify, FLAGS };

if (require.main === module) {
  const input = require("fs").readFileSync(0, "utf8");
  const flags = classify(input.split("\n"));
  for (const f of FLAGS) console.log(`${f}=${flags[f]}`);
}
