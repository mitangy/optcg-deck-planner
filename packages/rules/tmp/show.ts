import { cardDataFor } from "../src/cards/cardData.js";
import { compileCardText } from "../src/tools/cardText/compileCard.js";
for (const id of process.argv.slice(2)) { const r = compileCardText(id, cardDataFor(id)!); console.log(id, cardDataFor(id)!.text, "|", cardDataFor(id)!.trigger); console.log(JSON.stringify(r.abilities.map(({text, ...a}) => a))); if (r.unsupported.length) console.log("UNSUPPORTED", r.unsupported); }
