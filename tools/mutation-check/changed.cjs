#!/usr/bin/env node
// Playwright suites (duel-e2e, frontend-e2e) are not run here: they start servers and take too long for a PR job.
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { parseArgs } = require("node:util");

const REPO = path.resolve(__dirname, "../..");
const SUITES_DIR = path.join(__dirname, "suites");

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { list: { type: "boolean" }, matrix: { type: "boolean" } },
  allowPositionals: true,
  strict: false,
});
const listOnly = flags.list === true;
const matrixOnly = flags.matrix === true;
const baseArg = positionals[0];
if (!baseArg) { console.error("usage: changed.cjs <base-ref> [--list | --matrix]"); process.exit(2); }

const git = (...a) => execFileSync("git", a, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
let base;
try {
  git("rev-parse", "--verify", `${baseArg}^{commit}`);
  // The merge base, so commits that landed on the base branch after this one
  // branched do not show up as changes (or removals) here.
  base = git("merge-base", baseArg, "HEAD").trim();
} catch (e) {
  console.error(`Cannot resolve base ref ${baseArg} (CI needs fetch-depth: 0): ${String(e.stderr ?? e.message).trim()}`);
  process.exit(2);
}

function serialize(value) {
  return JSON.stringify(value, (key, v) => {
    if (typeof v === "function") return `fn:${v.toString()}`;
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    return v;
  });
}

// A function's source misses closed-over values (the `scn` helper in rules.cjs wraps its `patch`), so every json patch is also applied to the current data file and the result hashed.
function signature(mutation) {
  const edits = mutation.edits ?? (mutation.json ? [mutation] : []);
  const applied = edits.filter((e) => e.json).map((e) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(REPO, e.json), "utf8"));
      e.patch(data);
      return crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex");
    } catch (err) {
      return `throws: ${err.message}`;
    }
  });
  return serialize(mutation) + JSON.stringify(applied);
}

function signatures(suite) {
  const map = new Map();
  for (const m of suite.mutations) map.set(m.id, [...(map.get(m.id) ?? []), signature(m)]);
  return map;
}

// Written next to the real suite file so any relative require in it resolves the same way, and removed right after.
function loadBase(file) {
  let text;
  try { text = git("show", `${base}:tools/mutation-check/suites/${file}`); } catch { return { missing: true }; }
  if (text === fs.readFileSync(path.join(SUITES_DIR, file), "utf8")) return { same: true };
  const copy = path.join(SUITES_DIR, `.base-${process.pid}-${file}`);
  fs.writeFileSync(copy, text);
  try { return { suite: require(copy) }; } finally { fs.unlinkSync(copy); }
}

const changed = [];
for (const file of fs.readdirSync(SUITES_DIR).filter((f) => f.endsWith(".cjs")).sort()) {
  const name = file.replace(/\.cjs$/, "");
  const head = require(path.join(SUITES_DIR, file));
  const old = loadBase(file);
  if (old.same) continue;
  const before = old.suite ? signatures(old.suite) : new Map();
  const ids = [];
  const narrow = new Set(head.mutations.filter((m) => m.args).map((m) => m.id));
  for (const [id, sigs] of signatures(head)) {
    const was = before.get(id);
    if (!was || was.length !== sigs.length || sigs.some((s, i) => s !== was[i])) ids.push(id);
  }
  if (ids.length) changed.push({ name, runner: head.runner, ids, narrow });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onlyPattern = (ids) => `^(${ids.map(escapeRegex).join("|")})$`;

// Observed CI seconds for one full run of a suite; a mutation without `args` re-runs the whole suite, and every part also pays one baseline full run.
const SECONDS_PER_MUTATION = { rules: 50, "game-server": 25, "duel-web": 45, frontend: 17, analyst: 74, mobile: 5, backend: 15, "analyst-client": 3, "card-core": 3, "api-client": 3, "analyst-contract": 3, "deck-analytics": 3, "price-timing": 3, "patch-notes": 3, ui: 3, "site-legal": 3, "duel-protocol": 3 };
const DEFAULT_SECONDS = 5;
const NARROW_SECONDS = 6;
/** Narrow runs that cost more than a single test file: analyst `src/` runs 15 test files. */
const NARROW_SECONDS_BY_SUITE = { analyst: 16 };
const MAX_PARTS = 8;
const TARGET_PART_SECONDS = 150;
// Past MAX_PARTS, a part that would still run longer than this is split again (up to HARD_MAX_PARTS), so a big file move stays inside the parts job's 45-minute timeout.
const MAX_PART_SECONDS = 25 * 60;
const HARD_MAX_PARTS = 48;

function planMatrix(suites) {
  const plan = suites.map(({ name, ids, narrow }) => {
    const w = SECONDS_PER_MUTATION[name] ?? DEFAULT_SECONDS;
    const weight = (id) => (narrow && narrow.has(id) ? NARROW_SECONDS_BY_SUITE[name] ?? NARROW_SECONDS : w);
    return { name, ids, w, weight, parts: 1 };
  });
  const split = (s, k) => {
    const bins = Array.from({ length: k }, () => ({ ids: [], load: 0 }));
    const order = [...s.ids].sort((a, b) => s.weight(b) - s.weight(a) || (a < b ? -1 : a > b ? 1 : 0));
    for (const id of order) {
      const bin = bins.reduce((m, b) => (b.load < m.load ? b : m));
      bin.ids.push(id);
      bin.load += s.weight(id);
    }
    return bins;
  };
  const cost = (s) => s.w + Math.max(...split(s, s.parts).map((b) => b.load));
  for (;;) {
    const total = plan.reduce((n, s) => n + s.parts, 0);
    const next = plan.filter((s) => s.parts < s.ids.length).sort((a, b) => cost(b) - cost(a))[0];
    if (!next || cost(next) <= TARGET_PART_SECONDS) break;
    if (total >= MAX_PARTS && (cost(next) <= MAX_PART_SECONDS || total >= HARD_MAX_PARTS)) break;
    next.parts += 1;
  }
  const out = [];
  for (const s of plan) {
    split(s, s.parts).forEach((bin, i) => {
      const ids = s.ids.filter((id) => bin.ids.includes(id));
      out.push({ suite: s.name, part: `${i + 1}/${s.parts}`, only: onlyPattern(ids), count: ids.length, seconds: s.w + bin.load, ids });
    });
  }
  for (const s of plan) {
    const got = out.filter((p) => p.suite === s.name).flatMap((p) => p.ids).sort();
    const want = [...s.ids].sort();
    if (got.length !== want.length || got.some((id, i) => id !== want[i])) throw new Error(`matrix for ${s.name} does not cover each changed id exactly once`);
  }
  return out.map(({ ids, seconds, ...rest }) => (process.env.MATRIX_DEBUG ? { ...rest, seconds } : rest));
}

if (!changed.length) {
  console.error(`No mutation entries changed versus ${baseArg} (${base.slice(0, 7)}).`);
  if (matrixOnly) console.log("[]");
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Mutation proofs\n\nNo mutation entries changed.\n");
  process.exit(0);
}
if (listOnly) {
  for (const { name, ids } of changed) console.log(`${name}: ${ids.join(", ")}`);
  process.exit(0);
}
if (matrixOnly) {
  const runnable = [];
  const rows = ["## Mutation proofs", "", "| Suite | Changed | Parts |", "|---|---|---|"];
  for (const { name, runner, ids, narrow } of changed) {
    if (runner === "playwright") {
      const line = `[${name}] skipped (Playwright suite; run locally): ${ids.join(", ")}`;
      console.error(line);
      rows.push(`| ${name} | ${ids.length} | skipped (Playwright suite; run locally) |`);
    } else runnable.push({ name, ids, narrow });
  }
  const matrix = planMatrix(runnable);
  for (const { name, ids } of runnable) rows.push(`| ${name} | ${ids.length} | ${matrix.filter((p) => p.suite === name).length} |`);
  console.error(`Planned ${matrix.length} part(s) for ${runnable.length} suite(s).`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${rows.join("\n")}\n`);
  console.log(JSON.stringify(matrix));
  process.exit(0);
}

const summary = ["## Mutation proofs", "", "| Suite | Changed | Result |", "|---|---|---|"];
let failed = 0;
for (const { name, runner, ids } of changed) {
  if (runner === "playwright") {
    console.log(`[${name}] skipped (Playwright suite; run locally): ${ids.join(", ")}`);
    summary.push(`| ${name} | ${ids.length} | skipped (Playwright suite; run locally) |`);
    continue;
  }
  console.log(`[${name}] running ${ids.length} changed mutation(s): ${ids.join(", ")}`);
  const only = onlyPattern(ids);
  const run = spawnSync(process.execPath, [path.join(__dirname, "run.cjs"), name, "--only", only], { cwd: REPO, stdio: "inherit" });
  const ok = run.status === 0;
  if (!ok) failed += 1;
  summary.push(`| ${name} | ${ids.length} | ${ok ? "all killed" : "FAILED (see log)"} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
if (failed) { console.error(`\n${failed} suite(s) failed.`); process.exit(1); }
