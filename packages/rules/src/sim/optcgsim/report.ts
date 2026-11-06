/**
 * Usage: npx tsx src/sim/optcgsim/report.ts <path-to-optcgsim-matches.json>
 * Prints the parse report (games, turns, events by kind, unknown line patterns, CHK mismatches).
 */
import { readFileSync } from "node:fs";
import { parseSimExport } from "./parse.js";
import type { SimMatchRecord } from "./types.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: tsx src/sim/optcgsim/report.ts <path-to-json>");
  process.exit(2);
}
const json = JSON.parse(readFileSync(path, "utf8")) as SimMatchRecord[];
const { report: r } = parseSimExport(Array.isArray(json) ? json : []);
console.log(`games: ${r.gamesParsed} parsed, ${r.gamesSkippedNoLog} skipped (no combatLog), ${r.gamesInput} total`);
console.log(`turns: ${r.turns}`);
console.log("events by kind:");
for (const [k, v] of Object.entries(r.eventsByKind).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`unknown lines: ${r.unknownLineCount}`);
for (const u of r.unknownPatterns) console.log(`  ${String(u.count).padStart(5)}  ${u.pattern}   e.g. ${u.example.slice(0, 100)}`);
console.log(`CHK checked: ${r.chkChecked}; mismatches: ${r.chkMismatchCount} in ${r.chkMismatchGames} games`);
for (const s of r.chkMismatchSamples) console.log(`  game#${s.game} seq ${s.mismatch.seq} ${s.mismatch.side} ${s.mismatch.field}: model ${s.mismatch.expected} vs log ${s.mismatch.actual}`);
