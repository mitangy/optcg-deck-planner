/**
 * `npm run eval:validate -w @optcg/analyst`: the free check CI runs. No model, no network. It loads and
 * validates the real case list and re-derives the gold of every non-live case from the same tools the model
 * calls, so a case that no longer matches what Log Pose computes fails here before any paid run.
 */
import { loadCatalog } from "../src/catalog";
import { CASES } from "./cases";
import { goldFor } from "./gold";
import { loadCases } from "./load";

const catalog = loadCatalog();
const cases = loadCases(catalog, CASES);
let bad = 0;
for (const c of cases) {
  if (c.group === "A" || (c.group === "C" && c.live) || (c.group === "C" && c.tool === "card_rulings")) continue;
  const gold = await goldFor(c, { catalog });
  if (gold.status !== "ok") {
    bad++;
    console.error(`${c.id}: ${gold.status}: ${gold.reason}`);
  }
}
const counts = cases.reduce<Record<string, number>>((m, c) => ({ ...m, [c.group]: (m[c.group] ?? 0) + 1 }), {});
console.log(`eval cases valid: ${Object.entries(counts).map(([g, n]) => `${g} ${n}`).join(", ")}${bad ? `; ${bad} gold mismatches` : "; gold re-derived for every offline case"}`);
process.exit(bad ? 1 : 0);
