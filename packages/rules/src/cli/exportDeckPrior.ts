import { readFileSync, writeFileSync } from "node:fs";
import { priorToFile, type DeckPriorFile } from "../bot/defaultPrior.js";
import { expandSimInputs } from "../sim/fitValue.js";
import { opponentDecksFromSimGames, parseSimExport, type SimMatchRecord } from "../sim/optcgsim/index.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const input = arg("in");
const simOpp = (arg("sim-opp") ?? "").split(",").filter(Boolean);
if (!input && !simOpp.length) { console.error("usage: export-deck-prior --in meta-decks.json [--sim-opp exports.json,dir] [--out src/bot/deckPrior.json]"); process.exit(1); }
if (simOpp.length && !arg("out")) { console.error("--sim-opp needs an explicit --out (the committed deckPrior.json is not overwritten with sim decks by default)"); process.exit(1); }
const out = arg("out") ?? "src/bot/deckPrior.json";

let decks: { leaderId: string; deck: string[] }[];
if (input) {
  decks = JSON.parse(readFileSync(input, "utf8")) as { leaderId: string; deck: string[] }[];
} else {
  const committed = JSON.parse(readFileSync(new URL("../bot/deckPrior.json", import.meta.url), "utf8")) as DeckPriorFile;
  decks = Object.entries(committed).flatMap(([leaderId, lists]) => lists.map((counts) => ({ leaderId, deck: Object.entries(counts).flatMap(([id, n]) => new Array<string>(n).fill(id)) })));
}
decks = decks.filter((d) => d.deck.length === 50);
if (simOpp.length) {
  const key = (d: { leaderId: string; deck: string[] }): string => `${d.leaderId}|${[...d.deck].sort().join(",")}`;
  const seen = new Set(decks.map(key));
  let added = 0;
  for (const f of expandSimInputs(simOpp)) {
    const { games } = parseSimExport(JSON.parse(readFileSync(f, "utf8")) as SimMatchRecord[]);
    for (const d of opponentDecksFromSimGames(games)) if (!seen.has(key(d))) { seen.add(key(d)); decks.push(d); added += 1; }
  }
  console.log(`added ${added} distinct sim opponent decks`);
}
const file = priorToFile(decks);
writeFileSync(out, `${JSON.stringify(file)}\n`);
console.log(`wrote ${out}: ${Object.keys(file).length} leaders, ${Object.values(file).reduce((n, l) => n + l.length, 0)} lists`);
