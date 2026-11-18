#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const trimSlashes = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

const under = (full, old) => full === old || full.startsWith(`${old}/`);

function rewriteSource(source, oldPath, newPath) {
  const old = trimSlashes(oldPath);
  const next = trimSlashes(newPath);
  const consts = new Map();
  for (const m of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([^"'`$\\\n]+)\2/g)) consts.set(m[1], trimSlashes(m[3]));
  const re = new RegExp(`\\$\\{([A-Za-z_$][\\w$]*)\\}(/[^\\s"'\`$\\\\]*)?|(?<![\\w./-])${escapeRe(old)}(?=/|(?![\\w.-]))`, "g");
  let count = 0;
  const text = source.replace(re, (match, name, rest) => {
    if (name === undefined) { count += 1; return next; }
    const value = consts.get(name);
    if (value === undefined || under(value, old) || !rest) return match;
    const full = `${value}${rest}`;
    if (!under(full, old)) return match;
    count += 1;
    const moved = next + full.slice(old.length);
    return moved.startsWith(`${value}/`) ? `\${${name}}/${moved.slice(value.length + 1)}` : moved;
  });
  return { text, count };
}

function moveInSuites(suitesDir, oldPath, newPath, { dryRun = false } = {}) {
  const changed = [];
  for (const f of fs.readdirSync(suitesDir).filter((n) => n.endsWith(".cjs")).sort()) {
    const abs = path.join(suitesDir, f);
    const source = fs.readFileSync(abs, "utf8");
    const { text, count } = rewriteSource(source, oldPath, newPath);
    if (!count) continue;
    if (!dryRun) fs.writeFileSync(abs, text);
    changed.push({ file: f, count });
  }
  return changed;
}

function main(argv) {
  const dirIndex = argv.indexOf("--suites-dir");
  const suitesDir = dirIndex >= 0 ? path.resolve(argv[dirIndex + 1]) : path.join(__dirname, "suites");
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(dirIndex >= 0 && i === dirIndex + 1));
  if (positional.length !== 2) {
    console.error("usage: move.cjs <old-path> <new-path> [--suites-dir <dir>] [--dry-run]");
    return 2;
  }
  const dryRun = argv.includes("--dry-run");
  const changed = moveInSuites(suitesDir, positional[0], positional[1], { dryRun });
  const total = changed.reduce((n, c) => n + c.count, 0);
  for (const c of changed) console.log(`${dryRun ? "would rewrite" : "rewrote"} ${c.count} reference(s) in suites/${c.file}`);
  console.log(total ? `${dryRun ? "Would rewrite" : "Rewrote"} ${total} reference(s) in ${changed.length} suite file(s).` : "No references found in the suites.");
  console.log("Next: node tools/mutation-check/run.cjs --check-anchors, then --locate-stale for anchors whose code moved.");
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { rewriteSource, moveInSuites };
