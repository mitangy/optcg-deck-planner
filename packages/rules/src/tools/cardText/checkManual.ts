/**
 * Check manual overrides: they load and validate, and every card name / type
 * they reference exists in the catalog. `npx tsx src/tools/cardText/checkManual.ts`
 */
import { ABILITY_REGISTRY } from "../../cards/abilities.js";
import { cardDataFor, listCardDataIds } from "../../cards/cardData.js";
import { MANUAL_ABILITIES } from "../../cards/manualAbilities.js";

const names = new Set<string>();
const traits = new Set<string>();
for (const id of listCardDataIds()) {
  const row = cardDataFor(id)!;
  names.add(row.name);
  for (const t of row.traits ?? []) traits.add(t);
}
let problems = 0;
const walk = (value: unknown, path: string): void => {
  if (Array.isArray(value)) { value.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if ((k === "names" || k === "notNames") && Array.isArray(v)) for (const n of v) if (!names.has(n)) { problems += 1; console.log(`unknown name ${JSON.stringify(n)} at ${path}.${k}`); }
    if ((k === "traits" || k === "notTraits") && Array.isArray(v)) for (const n of v) if (!traits.has(n)) { problems += 1; console.log(`unknown type ${JSON.stringify(n)} at ${path}.${k}`); }
    walk(v, `${path}.${k}`);
  }
};
for (const [id, entry] of Object.entries(MANUAL_ABILITIES)) walk(entry, id);
const statuses: Record<string, number> = {};
let unsupportedClauses = 0;
for (const record of ABILITY_REGISTRY.cards.values()) {
  statuses[record.status] = (statuses[record.status] ?? 0) + 1;
  unsupportedClauses += record.unsupported.length;
}
console.log("registry", statuses, `unsupported clauses=${unsupportedClauses}`, `manual entries=${Object.keys(MANUAL_ABILITIES).length}`);
if (problems) process.exitCode = 1;
