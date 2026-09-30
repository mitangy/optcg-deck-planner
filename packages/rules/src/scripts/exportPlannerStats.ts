/**
 * Emit compact per-card deck stats for the planner SPA.
 * Usage: npm run export-planner-stats -- [outfile]
 * Default: frontend/public/deckStats.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildPlannerStats, serializePlannerStats } from "./plannerStats.js";

const stats = buildPlannerStats();
const out = resolve(process.cwd(), process.argv[2] ?? "../../frontend/public/deckStats.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, serializePlannerStats(stats), "utf8");
console.log(`Wrote ${Object.keys(stats).length} cards → ${out}`);
