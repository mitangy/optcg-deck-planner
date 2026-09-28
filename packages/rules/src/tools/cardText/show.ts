/** Print compiled abilities for card ids: `npx tsx src/tools/cardText/show.ts OP01-016 ST01-014`. */
import { cardDataFor } from "../../cards/cardData.js";
import { compileCardText } from "./compileCard.js";

for (const id of process.argv.slice(2)) {
  const row = cardDataFor(id);
  if (!row) { console.log(`${id}: unknown card`); continue; }
  const result = compileCardText(id, row);
  console.log(`${id} ${row.name} [${result.status}]\n  text: ${row.text}${row.trigger ? `\n  trigger: ${row.trigger}` : ""}`);
  for (const { text: _text, ...ability } of result.abilities) console.log(`  ${JSON.stringify(ability)}`);
  for (const clause of result.unsupported) console.log(`  UNSUPPORTED: ${clause}`);
}
