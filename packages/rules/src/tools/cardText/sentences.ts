/**
 * Sentence-level failure report: for every unsupported clause, find the first
 * sentence (or cost / header) that does not parse, and group by normalized shape.
 * Usage: npx tsx src/tools/cardText/sentences.ts [limit] [regex]
 */
import { cardDataFor, listCardDataIds } from "../../cards/cardData.js";
import { compileCardText } from "./compileCard.js";
import { clean, parseCondition, parseCosts, parseStatement, parseStaticSentence } from "./grammar.js";
import { normalizeText, protect, restoreNames, segment, sentences } from "./normalize.js";
import type { Ctx } from "./phrases.js";

const limit = Number(process.argv[2] ?? 80);
const filter = process.argv[3] ? new RegExp(process.argv[3], "i") : null;
const groups = new Map<string, { count: number; examples: string[] }>();

function shape(text: string): string {
  return text.replace(/§N\d+§/g, "[N]").replace(/§T\d+§/g, "{T}").replace(/§Q\d+§/g, '"Q"').replace(/\d+/g, "#");
}

for (const id of listCardDataIds()) {
  const row = cardDataFor(id)!;
  const compiled = compileCardText(id, row);
  if (!compiled.unsupported.length) continue;
  for (const source of [row.text, row.trigger].filter(Boolean)) {
    const { text, ph } = protect(normalizeText(source));
    const ctx: Ctx = { ph, selfType: row.type };
    for (const seg of segment(text)) {
      const raw = restoreNames(seg.raw, ph);
      if (!compiled.unsupported.includes(raw)) continue;
      const timed = seg.tags.some((t) => !/^(DON!! x\d+|Your Turn|Opponent's Turn|Once Per Turn|RDON \d+)$/.test(t) && !["Blocker", "Rush", "Double Attack", "Banish", "Unblockable", "Rush: Character"].includes(t));
      let failing = "";
      let body = seg.body;
      const colon = body.indexOf(": ");
      const sentenceEnd = body.search(/\.(\s|$)/);
      if (colon > 0 && (sentenceEnd < 0 || colon < sentenceEnd)) {
        const costText = body.slice(0, colon);
        if (!parseCosts(costText, ctx)) failing = `COST: ${costText}`;
        else body = body.slice(colon + 2);
      }
      if (!failing) {
        for (const s of sentences(body)) {
          const ok = timed ? parseStatement(s, ctx) : parseStaticSentence(s, ctx) ?? parseStatement(s, ctx);
          if (!ok && !/^(then, )?(place the rest|trash the rest)/i.test(clean(s))) { failing = `${timed ? "EFFECT" : "STATIC"}: ${s}`; break; }
        }
      }
      if (!failing) failing = `SEGMENT: ${seg.body}`;
      if (filter && !filter.test(failing)) continue;
      const key = shape(failing);
      const entry = groups.get(key) ?? { count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 2) entry.examples.push(`${id}: ${restoreNames(failing, ph)}`);
      groups.set(key, entry);
    }
  }
}
void parseCondition;
const sorted = [...groups].sort((a, b) => b[1].count - a[1].count);
console.log(`groups=${sorted.length} total=${sorted.reduce((n, [, g]) => n + g.count, 0)}`);
for (const [key, entry] of sorted.slice(0, limit)) console.log(`${entry.count}\t${key}\n\t\t${entry.examples.join("\n\t\t")}`);
