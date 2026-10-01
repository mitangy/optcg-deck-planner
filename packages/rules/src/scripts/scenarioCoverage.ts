/**
 * To-do list of supported cards that no test mentions, grouped by set.
 * "Supported" means a card with executable effects (support "ok"); vanilla and
 * keyword-only cards need no scenario. A card counts as covered once its id
 * appears in a scenario file (src/__tests__/scenarios) or any other test.
 *
 *   npm run scenario-coverage              # every uncovered card
 *   npm run scenario-coverage -- --summary # per-set totals only
 *   npm run scenario-coverage -- OP01 EB01 # only these sets
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abilitySupportForCard } from "../cards/effectCatalog.js";
import { getCardDef, listCardDefs } from "../cards/definitions.js";

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../__tests__");

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? testFiles(path) : name.endsWith(".ts") ? [path] : [];
  });
}

const scenarioText: string[] = [];
const otherText: string[] = [];
for (const file of testFiles(testsDir)) (file.includes(`${join("__tests__", "scenarios")}`) ? scenarioText : otherText).push(readFileSync(file, "utf8"));
const scenarios = scenarioText.join("\n");
const others = otherText.join("\n");

const args = process.argv.slice(2);
const summaryOnly = args.includes("--summary");
const onlySets = args.filter((a) => !a.startsWith("--"));

const setOf = (id: string) => id.split("-")[0]!;
const bySet = new Map<string, { id: string; name: string }[]>();
const totals = new Map<string, number>();
let supported = 0;
let withScenario = 0;
let withOtherTest = 0;
for (const { id } of listCardDefs()) {
  if (abilitySupportForCard(id) !== "ok") continue;
  const set = setOf(id);
  if (onlySets.length && !onlySets.includes(set)) continue;
  supported += 1;
  totals.set(set, (totals.get(set) ?? 0) + 1);
  const inScenario = scenarios.includes(`card: "${id}"`);
  const inOther = others.includes(id);
  if (inScenario) withScenario += 1;
  if (!inScenario && inOther) withOtherTest += 1;
  if (inScenario || inOther) continue;
  if (!bySet.has(set)) bySet.set(set, []);
  bySet.get(set)!.push({ id, name: getCardDef(id).name });
}

const uncovered = [...bySet.values()].reduce((n, cards) => n + cards.length, 0);
for (const set of [...totals.keys()].sort()) {
  const cards = bySet.get(set) ?? [];
  console.log(`${set}: ${cards.length} uncovered of ${totals.get(set)}`);
  if (!summaryOnly) for (const card of cards) console.log(`  ${card.id}  ${card.name}`);
}
console.log(`\nSupported cards: ${supported}; with scenario rows: ${withScenario}; covered by other tests only: ${withOtherTest}; no test reference: ${uncovered}`);
