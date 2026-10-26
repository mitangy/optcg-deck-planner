#!/usr/bin/env node
/**
 * Duration-balanced Playwright shards (#737).
 *
 *   node scripts/e2e-shards.mjs <index> <total>        # files for shard <index> (1-based), space-separated
 *   node scripts/e2e-shards.mjs --update <report.json>... # refresh e2e/timings.json from Playwright JSON reports
 *
 * Run from duel-web/. Specs are assigned longest first to the lightest shard,
 * using the seconds in e2e/timings.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timingsPath = path.join(root, "e2e", "timings.json");

function median(xs) {
  if (!xs.length) return 1;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Spec paths (e.g. "e2e/a.spec.ts") -> n arrays. Weight comes from `timings` by file name. */
export function planShards(specs, timings, n) {
  const name = (p) => p.split("/").pop();
  const known = specs.map((p) => timings[name(p)]).filter((v) => typeof v === "number");
  const fallback = median(known);
  const weight = (p) => (typeof timings[name(p)] === "number" ? timings[name(p)] : fallback);
  const order = [...specs].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: n }, () => []);
  const load = new Array(n).fill(0);
  for (const spec of order) {
    let best = 0;
    for (let i = 1; i < n; i++) if (load[i] < load[best]) best = i;
    shards[best].push(spec);
    load[best] += weight(spec);
  }
  return shards;
}

/** Sum test durations (ms) per spec file name across all projects in Playwright JSON reports. */
export function sumReports(reports) {
  const ms = {};
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = path.basename(spec.file ?? suite.file ?? "");
      for (const t of spec.tests ?? []) for (const r of t.results ?? []) ms[file] = (ms[file] ?? 0) + (r.duration ?? 0);
    }
    for (const s of suite.suites ?? []) walk({ file: suite.file, ...s });
  };
  for (const rep of reports) for (const s of rep.suites ?? []) walk(s);
  return Object.fromEntries(Object.entries(ms).map(([k, v]) => [k, Math.round(v / 1000)]));
}

function sortedJson(o) {
  return JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2) + "\n";
}

function main(argv) {
  if (argv[0] === "--update") {
    if (argv.length < 2) throw new Error("usage: e2e-shards.mjs --update <report.json>...");
    const fresh = sumReports(argv.slice(1).map((f) => JSON.parse(fs.readFileSync(f, "utf8"))));
    const old = fs.existsSync(timingsPath) ? JSON.parse(fs.readFileSync(timingsPath, "utf8")) : {};
    fs.writeFileSync(timingsPath, sortedJson({ ...old, ...fresh }));
    console.error(`updated ${Object.keys(fresh).length} specs in e2e/timings.json`);
    return;
  }
  const [i, n] = argv.map(Number);
  if (argv.length !== 2 || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 1 || i > n) {
    throw new Error("usage: e2e-shards.mjs <index> <total>   (1-based index)");
  }
  const specs = fs.readdirSync(path.join(root, "e2e")).filter((f) => f.endsWith(".spec.ts")).sort().map((f) => `e2e/${f}`);
  const timings = fs.existsSync(timingsPath) ? JSON.parse(fs.readFileSync(timingsPath, "utf8")) : {};
  const shards = planShards(specs, timings, n);
  const est = shards.map((s) => s.reduce((t, p) => t + (timings[p.split("/").pop()] ?? 0), 0));
  console.error(`shard ${i}/${n}: ${shards[i - 1].length} specs; estimated seconds per shard: ${est.join(" / ")}`);
  process.stdout.write(shards[i - 1].join(" "));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
