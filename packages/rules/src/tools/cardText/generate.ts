/**
 * Regenerate `src/cards/generated/abilities.json` from `cardData.json`.
 * Usage (packages/rules): npx tsx src/tools/cardText/generate.ts
 * `--check` exits non-zero when the checked-in file is stale.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { cardDataFor, listCardDataIds } from "../../cards/cardData.js";
import { compileCardText } from "./compileCard.js";
import type { CardAbilities } from "../../effects/types.js";

export function generateAbilities(): Record<string, CardAbilities> {
  const out: Record<string, CardAbilities> = {};
  for (const id of listCardDataIds().sort()) out[id] = compileCardText(id, cardDataFor(id)!);
  return out;
}

export function serializeGenerated(data: Record<string, CardAbilities>): string {
  return `${JSON.stringify(data)}\n`;
}

const target = resolve("src/cards/generated/abilities.json");
if (process.argv[1] && /generate\.ts$/.test(process.argv[1])) {
  const text = serializeGenerated(generateAbilities());
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== text) { console.error("generated abilities are stale; run src/tools/cardText/generate.ts"); process.exit(1); }
    console.log("generated abilities are current");
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, "utf8");
    const counts: Record<string, number> = {};
    for (const card of Object.values(JSON.parse(text) as Record<string, CardAbilities>)) counts[card.status] = (counts[card.status] ?? 0) + 1;
    console.log(`Wrote ${target}`, counts);
  }
}
