#!/usr/bin/env node
/**
 * Fails when two tracked paths differ only by letter case (refactor 0.6).
 *
 *   node tools/ci/case-collisions.cjs            (checks the tracked files)
 *   <paths> | node tools/ci/case-collisions.cjs -  (checks paths from stdin)
 *
 * `CardPage.tsx` next to `cardPage.ts` works on Linux but is ambiguous for
 * extensionless imports (`./cardPage`) and for editors and checkouts on
 * case-insensitive file systems (macOS, Windows). Paths are compared with their
 * last extension removed, so a component and a module that share a stem in
 * different case are caught as well as identical names in different case.
 */
"use strict";

const MODULE_EXT = /\.(?:[cm]?[jt]sx?)$/;

/** @param {string[]} paths tracked repo-relative paths @returns {string[][]} groups of colliding paths */
function findCollisions(paths) {
  const groups = new Map();
  for (const raw of paths) {
    const p = raw.trim();
    if (!p) continue;
    // Modules resolve without their extension, so .ts/.tsx/.mjs share one stem; any other file only
    // collides with a path that differs from it by case alone.
    const key = (MODULE_EXT.test(p) ? p.replace(MODULE_EXT, "") : p).toLowerCase();
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(p);
  }
  const out = [];
  for (const g of groups.values()) {
    const stems = new Set([...g].map((p) => p.replace(MODULE_EXT, "")));
    if (stems.size > 1) out.push([...g].sort());
  }
  return out;
}

module.exports = { findCollisions };

if (require.main === module) {
  const input = process.argv.includes("-")
    ? require("fs").readFileSync(0, "utf8")
    : require("child_process").execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const found = findCollisions(input.split("\n"));
  for (const g of found) console.error(`paths differ only by case: ${g.join("  <>  ")}`);
  if (found.length) {
    console.error("Rename one of each pair (e.g. a pure module to <name>Model.ts).");
    process.exit(1);
  }
}
