/**
 * `npm run eval:check-live -w @optcg/analyst`: no model, no cost. Resolves every A case's FAQ reference and
 * every live C case against the official site and prints a markdown table (the nightly job pastes it into
 * its step summary). Exit 0: all good. Exit 1: a reference went stale or drifted (reported, fix the case).
 * Exit 2: the official site could not be read twice in a row.
 */
import { loadCatalog } from "../src/catalog";
import { OfficialLibrary } from "../src/official/library";
import { CASES } from "./cases";
import { goldFor, OfficialUnavailable } from "./gold";
import { loadCases } from "./load";

const catalog = loadCatalog();
const cases = loadCases(catalog, CASES).filter((c) => c.group === "A" || (c.group === "C" && c.live));

async function check(): Promise<{ lines: string[]; flagged: number }> {
  const library = new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined });
  const lines = ["| case | status | detail |", "|---|---|---|"];
  let flagged = 0;
  for (const c of cases) {
    const gold = await goldFor(c, { catalog, library });
    if (gold.status !== "ok") flagged++;
    lines.push(`| ${c.id} | ${gold.status} | ${gold.reason ?? (gold.cites.all[0]?.[0] ?? "")} |`);
  }
  return { lines, flagged };
}

let result: Awaited<ReturnType<typeof check>> | undefined;
for (let attempt = 1; attempt <= 2 && !result; attempt++) {
  try {
    result = await check();
  } catch (err) {
    if (!(err instanceof OfficialUnavailable)) throw err;
    console.error(`attempt ${attempt}: ${err.message}`);
  }
}
if (!result) {
  console.log("The official site could not be read twice in a row.");
  process.exit(2);
}
console.log(`## Log Pose eval: official references (${cases.length} cases)\n`);
console.log(result.lines.join("\n"));
console.log(`\n${result.flagged ? `${result.flagged} case(s) are stale or drifted: re-pick the FAQ row and update its qh, never paste Bandai text.` : "Every reference resolves."}`);
process.exit(result.flagged ? 1 : 0);
