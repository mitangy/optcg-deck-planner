/** Print a deterministic random sample of supported cards for manual review: `npx tsx src/tools/cardText/sample.ts [n] [seed]`. */
import { abilitiesFor, cardAbilities } from "../../cards/abilities.js";
import { cardDataFor, listCardDataIds } from "../../cards/cardData.js";
import { createSeededRng } from "../../rng.js";

const n = Number(process.argv[2] ?? 20);
const rng = createSeededRng(Number(process.argv[3] ?? 7));
const ids = rng.shuffle(listCardDataIds().filter((id) => cardAbilities(id)?.status === "supported"));
for (const id of ids.slice(0, n)) {
  const row = cardDataFor(id)!;
  console.log(`\n## ${id} ${row.name} (${row.type})\n${row.text}${row.trigger ? " || " + row.trigger : ""}`);
  for (const { text: _t, id: aid, ...a } of abilitiesFor(id)) console.log(`  ${aid}: ${JSON.stringify(a)}`);
}
