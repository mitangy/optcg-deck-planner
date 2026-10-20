/**
 * Writes the bots' default deck prior (#635) from a meta-decks file: npm run export-deck-prior -- --in meta-decks.json [--out src/bot/deckPrior.json]
 * The input is [{ leaderId, deck: [50 ids] }] (the Limitless top-finish export). Rerun it when the meta changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { priorToFile } from "../bot/defaultPrior.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const input = arg("in");
if (!input) { console.error("usage: export-deck-prior --in meta-decks.json [--out src/bot/deckPrior.json]"); process.exit(1); }
const decks = JSON.parse(readFileSync(input, "utf8")) as { leaderId: string; deck: string[] }[];
const out = arg("out") ?? "src/bot/deckPrior.json";
const file = priorToFile(decks.filter((d) => d.deck.length === 50));
writeFileSync(out, `${JSON.stringify(file)}\n`);
console.log(`wrote ${out}: ${Object.keys(file).length} leaders, ${Object.values(file).reduce((n, l) => n + l.length, 0)} lists`);
