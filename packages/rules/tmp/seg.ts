import data from "../src/cards/cardData.json" with { type: "json" };
import { normalizeText, protect, segment } from "../src/tools/cardText/normalize.js";
const cards = (data as any).cards as Record<string, any>;
const tagCombos = new Map<string, number>();
let n = 0;
for (const [id, c] of Object.entries(cards)) {
  for (const t of [c.text, c.trigger]) { if (!t) continue;
    const { text } = protect(normalizeText(t));
    for (const s of segment(text)) { n++; const k = s.tags.join("+") || "(none)"; tagCombos.set(k, (tagCombos.get(k) ?? 0) + 1); }
  }
}
console.log(n, [...tagCombos].sort((a,b)=>b[1]-a[1]).slice(0,80));
for (const id of ["OP16-021","EB04-022","OP01-050","OP11-062","ST02-001","OP02-062","EB01-001"]) { const {text}=protect(normalizeText(cards[id].text)); console.log(id, JSON.stringify(segment(text).map(s=>[s.tags,s.body]))); }
