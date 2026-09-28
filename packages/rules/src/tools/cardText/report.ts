/** Coverage report for the card-text compiler: `npx tsx src/tools/cardText/report.ts [limit] [filter]`. */
import { cardDataFor, listCardDataIds } from "../../cards/cardData.js";
import { compileCardText } from "./compileCard.js";

const limit = Number(process.argv[2] ?? 60);
const filter = process.argv[3] ? new RegExp(process.argv[3], "i") : null;
const status: Record<string, number> = {};
const failing = new Map<string, { count: number; example: string }>();
let clauses = 0;
let failedClauses = 0;
for (const id of listCardDataIds()) {
  const row = cardDataFor(id)!;
  const result = compileCardText(id, row);
  status[`${row.type}:${result.status}`] = (status[`${row.type}:${result.status}`] ?? 0) + 1;
  status[result.status] = (status[result.status] ?? 0) + 1;
  clauses += result.abilities.length + result.unsupported.length;
  failedClauses += result.unsupported.length;
  for (const clause of result.unsupported) {
    if (filter && !filter.test(clause)) continue;
    const key = clause.replace(/\[[^\]]*\]/g, (m) => (/^\[(On Play|When Attacking|Main|Counter|Trigger|On KO|Activate: Main|Once Per Turn|DON!! x\d+|Your Turn|Opponent's Turn|On Block|End of Your Turn|On Your Opponent's Attack|Blocker|Rush|Double Attack|Banish)\]$/.test(m) ? m : "[N]")).replace(/\{[^}]*\}/g, "{T}").replace(/\d+/g, "#");
    const entry = failing.get(key) ?? { count: 0, example: `${id}: ${clause}` };
    entry.count += 1;
    failing.set(key, entry);
  }
}
console.log(status, `clauses=${clauses} failed=${failedClauses}`);
for (const [key, entry] of [...failing].sort((a, b) => b[1].count - a[1].count).slice(0, limit)) {
  console.log(`${entry.count}\t${key}\n\t\t${entry.example}`);
}
