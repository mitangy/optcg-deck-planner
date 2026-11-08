/** `npm run eval:compare -w @optcg/analyst -- out/v1`: the committed baseline against a run, by group and by flipped case. */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { groupTable, summaryLine, type Baseline } from "./report";
import { caseMeans, flipped } from "./stats";
import type { Row } from "./types";

const dir = resolve(process.argv[2] ?? "");
const resultsFile = join(dir, "results.jsonl");
if (!process.argv[2] || !existsSync(resultsFile)) {
  console.error("Usage: npm run eval:compare -w @optcg/analyst -- <path to an out/<variant> folder>");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(fileURLToPath(new URL("baseline.json", import.meta.url)), "utf8")) as Baseline;
const rows = readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

console.log(summaryLine(rows, [], 0));
console.log(`baseline: ${baseline.created} (git ${baseline.git_sha.slice(0, 7)}, ${baseline.model})\n`);
console.log(groupTable(rows, baseline).join("\n"));
const flips = flipped(new Map(Object.entries(baseline.cases).filter(([, v]) => v.correct !== undefined).map(([id, v]) => [id, v.correct!])), caseMeans(rows.filter((r) => r.group !== "E"), "correct"));
console.log(`\nFlipped (|Δ| >= 0.5): ${flips.length ? "" : "none"}`);
for (const f of flips) console.log(`  ${f.id}: ${f.from} -> ${f.to}`);
