#!/usr/bin/env node
/**
 * Mutation check: prove each test fails when the behavior it claims is broken.
 *
 * Every mutation applies an "opposite condition" to production code (or a data
 * file), runs the owning test suite, and requires the listed tests to fail.
 * Files are always restored, including on Ctrl+C.
 *
 *   node tools/mutation-check/run.cjs [suite ...] [--only <regex>]
 *
 * Suites: see SUITES below (default: all). Exit code 1 when any
 * mutation survives or its anchor no longer matches the source exactly once.
 * See README.md for how to add mutations alongside new tests.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.resolve(__dirname, "../..");
const SUITES = {
  rules: require("./suites/rules.cjs"),
  "duel-web": require("./suites/duel-web.cjs"),
  mobile: require("./suites/mobile.cjs"),
  importer: require("./suites/importer.cjs"),
  backend: require("./suites/backend.cjs"),
  frontend: require("./suites/frontend.cjs"),
  "game-server": require("./suites/game-server.cjs"),
  cosmetics: require("./suites/cosmetics.cjs"),
  "duel-e2e": require("./suites/duel-e2e.cjs"),
  "frontend-e2e": require("./suites/frontend-e2e.cjs"),
};

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? new RegExp(args[onlyIndex + 1]) : null;
const suiteNames = args.filter((a, i) => !a.startsWith("--") && !(onlyIndex >= 0 && i === onlyIndex + 1));
const selected = suiteNames.length ? suiteNames : Object.keys(SUITES);

// Restore everything we touched, whatever happens. Originals are also journaled
// to disk so a hard kill (which skips exit handlers) is repaired on the next run.
const JOURNAL = path.join(__dirname, ".pending-restore.json");
const touched = new Map();
function restoreAll() {
  for (const [file, text] of touched) fs.writeFileSync(file, text);
  touched.clear();
  try { fs.unlinkSync(JOURNAL); } catch {}
}
function journal() {
  fs.writeFileSync(JOURNAL, JSON.stringify(Object.fromEntries(touched)));
}
// One run at a time: a second run would "restore" files the first is mutating
// mid-test (via the shared journal), making the first run's mutations falsely survive.
const LOCK = path.join(__dirname, ".run.lock");
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}
if (fs.existsSync(LOCK) && isAlive(Number(fs.readFileSync(LOCK, "utf8")))) {
  console.error("Another mutation-check run is in progress; run suites one at a time.");
  process.exit(2);
}
fs.writeFileSync(LOCK, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(LOCK); } catch {} });
if (fs.existsSync(JOURNAL)) {
  const pending = JSON.parse(fs.readFileSync(JOURNAL, "utf8"));
  for (const [file, text] of Object.entries(pending)) fs.writeFileSync(file, text);
  fs.unlinkSync(JOURNAL);
  console.log(`Restored ${Object.keys(pending).length} file(s) left mutated by an interrupted run.`);
}
for (const name of selected) if (!SUITES[name]) { console.error(`Unknown suite ${name}; expected ${Object.keys(SUITES).join(", ")}`); process.exit(2); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const crlf = (x) => x.split("\n").join("\r\n");

/** Failed test names for a runner. */
const runners = {
  vitest(cwd) {
    const report = path.join(os.tmpdir(), `mutation-check-${process.pid}.json`);
    try { fs.unlinkSync(report); } catch {}
    try { execSync(`npx vitest run --reporter=json --outputFile="${report}"`, { cwd, stdio: "ignore", timeout: 600000 }); } catch {}
    if (!fs.existsSync(report)) return { error: "no vitest report (suite crashed?)", failed: [] };
    const data = JSON.parse(fs.readFileSync(report, "utf8"));
    fs.unlinkSync(report);
    const failed = [];
    for (const file of data.testResults) {
      if (file.status === "failed" && file.assertionResults.length === 0) failed.push(`[failed to load] ${path.basename(file.name)}`);
      for (const t of file.assertionResults) if (t.status === "failed") failed.push(`${path.basename(file.name)} > ${t.fullName}`);
    }
    return { failed, total: data.numTotalTests };
  },
  mocha(cwd) {
    const report = path.join(os.tmpdir(), `mutation-check-${process.pid}.json`);
    try { fs.unlinkSync(report); } catch {}
    try { execSync(`npx mocha --import=tsx/esm "test/**/*.test.ts" --exit --timeout 60000 --reporter json --reporter-option output="${report}"`, { cwd, stdio: "ignore", timeout: 600000 }); } catch {}
    if (!fs.existsSync(report)) return { error: "no mocha report (suite crashed?)", failed: [] };
    const data = JSON.parse(fs.readFileSync(report, "utf8"));
    fs.unlinkSync(report);
    return { failed: data.failures.map((t) => `${path.basename(t.file ?? "")} > ${t.fullTitle}`), total: data.stats.tests };
  },
  playwright(cwd, suite, mutation) {
    const report = path.join(os.tmpdir(), `mutation-check-${process.pid}.json`);
    try { fs.unlinkSync(report); } catch {}
    // CI=1: start fresh servers so a mutated game server is never a stale reused one.
    const env = { ...process.env, CI: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: report };
    try { execSync(`npx playwright test --reporter=json ${mutation?.args ?? suite.args ?? ""}`, { cwd, env, stdio: "ignore", timeout: 3600000 }); } catch {}
    if (!fs.existsSync(report)) return { error: "no playwright report (suite crashed?)", failed: [] };
    const data = JSON.parse(fs.readFileSync(report, "utf8"));
    fs.unlinkSync(report);
    const failed = [];
    let total = 0;
    const walk = (s) => {
      for (const spec of s.specs ?? []) for (const t of spec.tests) {
        if (t.status === "skipped") continue;
        total += 1;
        if (t.status === "unexpected") failed.push(`${path.basename(spec.file)} > ${spec.title} [${t.projectName}]`);
      }
      for (const child of s.suites ?? []) walk(child);
    };
    for (const s of data.suites) walk(s);
    if (data.errors?.length && !total) return { error: data.errors.map((e) => e.message).join("\n").slice(-800), failed: [] };
    return { failed, total };
  },
  pytest(cwd, suite, mutation) {
    const python = process.env.BACKEND_PYTHON ?? process.env.PYTHON ?? (process.platform === "win32" ? "py -3" : "python3");
    let out = "";
    try { out = execSync(`${python} -m pytest -q -rf ${mutation?.args ?? suite.args ?? ""} 2>&1`, { cwd, encoding: "utf8", timeout: 600000 }); } catch (e) { out = String(e.stdout ?? ""); }
    const summary = /(\d+) passed/.exec(out);
    if (!summary && !/\d+ failed/.test(out)) return { error: `pytest did not run:\n${out.slice(-800)}`, failed: [] };
    const failed = [...out.matchAll(/^FAILED (\S+)/gm)].map((m) => m[1]);
    return { failed, total: Number(summary?.[1] ?? 0) + failed.length };
  },
  unittest(cwd, suite) {
    const python = process.env.PYTHON ?? (process.platform === "win32" ? "py -3" : "python3");
    let out = "";
    try { out = execSync(`${python} -m unittest -v ${suite.module} 2>&1`, { cwd, encoding: "utf8", timeout: 600000 }); } catch (e) { out = String(e.stdout ?? ""); }
    const ran = /Ran (\d+) tests?/.exec(out);
    if (!ran) return { error: `unittest did not run:\n${out.slice(-800)}`, failed: [] };
    return { failed: [...out.matchAll(/^(?:FAIL|ERROR): (\w+)/gm)].map((m) => m[1]), total: Number(ran[1]) };
  },
};

function applyEdits(mutation) {
  const edits = mutation.edits ?? (mutation.json ? [{ json: mutation.json, patch: mutation.patch }] : [{ file: mutation.file, from: mutation.from, to: mutation.to }]);
  const next = new Map();
  for (const edit of edits) {
    const file = path.join(REPO, edit.json ?? edit.file);
    const original = touched.get(file) ?? fs.readFileSync(file, "utf8");
    const current = next.get(file) ?? original;
    let updated;
    if (edit.json) {
      const data = JSON.parse(current);
      edit.patch(data);
      updated = `${JSON.stringify(data, null, 2)}\n`;
    } else {
      let { from, to } = edit;
      if (!current.includes(from) && current.includes(crlf(from))) { from = crlf(from); to = crlf(to); }
      const count = current.split(from).length - 1;
      if (count !== 1) return `anchor in ${edit.file} matched ${count} times: ${JSON.stringify(edit.from.slice(0, 80))}`;
      updated = current.replace(from, to);
    }
    if (!touched.has(file)) touched.set(file, original);
    next.set(file, updated);
  }
  journal();
  for (const [file, text] of next) fs.writeFileSync(file, text);
  return null;
}

let problems = 0;
for (const name of selected) {
  const suite = SUITES[name];
  const cwd = path.join(REPO, suite.cwd);
  const runner = runners[suite.runner];
  const baseline = runner(cwd, suite);
  if (baseline.error || baseline.failed.length) {
    console.error(`[${name}] baseline is not green; fix the suite first.\n${baseline.error ?? baseline.failed.join("\n")}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`[${name}] baseline: ${baseline.total} tests pass; ${suite.mutations.length} mutations`);
  for (const mutation of suite.mutations) {
    if (only && !only.test(mutation.id)) continue;
    if (mutation.requiresEnv && !process.env[mutation.requiresEnv]) { console.log(`  skipped  ${mutation.id}: set ${mutation.requiresEnv} to run it`); continue; }
    const anchorError = applyEdits(mutation);
    let result;
    try {
      result = anchorError ? null : runner(cwd, suite, mutation);
    } finally {
      restoreAll();
    }
    if (anchorError) { problems += 1; console.log(`  STALE    ${mutation.id}: ${anchorError}`); continue; }
    if (result.error) { problems += 1; console.log(`  ERROR    ${mutation.id}: ${result.error}`); continue; }
    const survived = mutation.kills.filter((k) => !result.failed.some((f) => f.includes(k)));
    if (survived.length) { problems += 1; console.log(`  SURVIVED ${mutation.id}: expected failures not seen for ${JSON.stringify(survived)}`); }
    else console.log(`  killed   ${mutation.id} (${result.failed.length} failing)`);
  }
}
if (problems) { console.log(`\n${problems} mutation(s) not killed.`); process.exitCode = 1; }
else if (!process.exitCode) console.log("\nAll mutations killed.");
