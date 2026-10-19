#!/usr/bin/env node
/**
 * Run only the mutations that are new or changed versus a base git ref, so a
 * PR proves the tests it adds or edits without paying for a full run.
 *
 *   node tools/mutation-check/changed.cjs <base-ref> [--list | --matrix]
 *
 * Every suite file under suites/ is loaded at <base-ref> (via `git show`) and at
 * HEAD's working tree; entries are matched by `id` and compared by a serialized
 * signature. A suite that does not exist at the base counts entirely as new.
 * Then each suite with changed ids runs `run.cjs <suite> --only '^(a|b)$'`.
 * Exit 1 when any of those runs fails.
 *
 * --list prints "<suite>: <id>, <id>" per suite on stdout and runs nothing
 * (messages go to stderr, so empty stdout means nothing changed).
 * --matrix prints one line of JSON on stdout and runs nothing: an array of
 * {suite, part, only, count} parts that CI fans out over parallel runners, each
 * running `run.cjs <suite> --only <only>`. `[]` when nothing changed.
 * Playwright suites (duel-e2e, frontend-e2e) are not run here: they start
 * servers and take too long for a PR job, so run them locally.
 * Writes a short summary to $GITHUB_STEP_SUMMARY when it is set.
 */
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "../..");
const SUITES_DIR = path.join(__dirname, "suites");

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const matrixOnly = args.includes("--matrix");
const baseArg = args.find((a) => !a.startsWith("--"));
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

/** A stable string for one mutation: sorted keys, functions as their source. */
function serialize(value) {
  return JSON.stringify(value, (key, v) => {
    if (typeof v === "function") return `fn:${v.toString()}`;
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    return v;
  });
}

/**
 * Signature of a mutation. A function's source misses closed-over values (the
 * `scn` helper in rules.cjs wraps its `patch`), so every json patch is also
 * applied to the same current data file and the result hashed: changing what a
 * patch does changes the signature even when its source text is identical.
 */
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

/** Map id -> [signature, ...] for a suite module (a list, in case an id repeats). */
function signatures(suite) {
  const map = new Map();
  for (const m of suite.mutations) map.set(m.id, [...(map.get(m.id) ?? []), signature(m)]);
  return map;
}

/**
 * Load a suite as it was at the base. The copy is written next to the real
 * suite file so any relative require in it resolves the same way, and removed
 * right after. Returns null when the suite did not exist at the base.
 */
function loadBase(file) {
  let text;
  try { text = git("show", `${base}:tools/mutation-check/suites/${file}`); } catch { return { missing: true }; }
  if (text === fs.readFileSync(path.join(SUITES_DIR, file), "utf8")) return { same: true };
  const copy = path.join(SUITES_DIR, `.base-${process.pid}-${file}`);
  fs.writeFileSync(copy, text);
  try { return { suite: require(copy) }; } finally { fs.unlinkSync(copy); }
}

const changed = []; // { name, runner, ids }
for (const file of fs.readdirSync(SUITES_DIR).filter((f) => f.endsWith(".cjs")).sort()) {
  const name = file.replace(/\.cjs$/, "");
  const head = require(path.join(SUITES_DIR, file));
  const old = loadBase(file);
  if (old.same) continue;
  const before = old.suite ? signatures(old.suite) : new Map();
  const ids = [];
  for (const [id, sigs] of signatures(head)) {
    const was = before.get(id);
    if (!was || was.length !== sigs.length || sigs.some((s, i) => s !== was[i])) ids.push(id);
  }
  if (ids.length) changed.push({ name, runner: head.runner, ids });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const onlyPattern = (ids) => `^(${ids.map(escapeRegex).join("|")})$`;

/** Estimated seconds per mutation, observed in CI (each mutation re-runs its suite). */
const SECONDS_PER_MUTATION = { rules: 22, "game-server": 25, "duel-web": 20, frontend: 10, analyst: 7, mobile: 5, backend: 15, "analyst-client": 3, "deck-analytics": 3, "patch-notes": 3 };
const DEFAULT_SECONDS = 5;
const MAX_PARTS = 8;
const TARGET_PART_SECONDS = 150;

/**
 * Split changed ids into parts for parallel runners. Every part also pays one
 * baseline suite run, so a part with n ids costs about (n + 1) * w seconds.
 * Greedily gives the costliest suite another part while the cap allows.
 */
function planMatrix(suites) {
  const plan = suites.map(({ name, ids }) => ({ name, ids, w: SECONDS_PER_MUTATION[name] ?? DEFAULT_SECONDS, parts: 1 }));
  const cost = (s) => (Math.ceil(s.ids.length / s.parts) + 1) * s.w;
  for (;;) {
    if (plan.reduce((n, s) => n + s.parts, 0) >= MAX_PARTS) break;
    const next = plan.filter((s) => s.parts < s.ids.length).sort((a, b) => cost(b) - cost(a))[0];
    if (!next || cost(next) <= TARGET_PART_SECONDS) break;
    next.parts += 1;
  }
  const out = [];
  for (const s of plan) {
    for (let i = 0; i < s.parts; i += 1) {
      const ids = s.ids.filter((_, k) => k % s.parts === i); // round-robin
      out.push({ suite: s.name, part: `${i + 1}/${s.parts}`, only: onlyPattern(ids), count: ids.length, ids });
    }
  }
  for (const s of plan) {
    const got = out.filter((p) => p.suite === s.name).flatMap((p) => p.ids).sort();
    const want = [...s.ids].sort();
    if (got.length !== want.length || got.some((id, i) => id !== want[i])) throw new Error(`matrix for ${s.name} does not cover each changed id exactly once`);
  }
  return out.map(({ ids, ...rest }) => rest);
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
  for (const { name, runner, ids } of changed) {
    if (runner === "playwright") {
      const line = `[${name}] skipped (Playwright suite; run locally): ${ids.join(", ")}`;
      console.error(line);
      rows.push(`| ${name} | ${ids.length} | skipped (Playwright suite; run locally) |`);
    } else runnable.push({ name, ids });
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
