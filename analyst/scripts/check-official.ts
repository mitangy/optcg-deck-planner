/**
 * Reads the official rules material live and prints what parsed, so a change to Bandai's PDFs or
 * pages shows up before the connector starts answering with gaps. Usage: npm run check-official
 */
import { OfficialLibrary } from "../src/official/library";

const lib = new OfficialLibrary({ baseUrl: process.env.OFFICIAL_SITE_URL || undefined });
const report: Record<string, unknown> = {};
let ok = true;
const check = async (name: string, load: () => Promise<Record<string, unknown>>) => {
  try {
    report[name] = await load();
  } catch (err) {
    ok = false;
    report[name] = { error: err instanceof Error ? err.message : String(err) };
  }
};
await check("rules", async () => {
  const doc = await lib.rules();
  return { version: doc.version, updated: doc.updated, sections: doc.sections.length };
});
await check("faq", async () => {
  const faq = await lib.faq();
  if (faq.failed.length) ok = false;
  return { files: faq.files, cardRulings: faq.entries.length, generalQa: faq.general.length, failed: faq.failed };
});
await check("banList", async () => {
  const list = await lib.banList();
  return { banned: list.banned, restricted: list.restricted, bannedPairs: list.bannedPairs, upcoming: list.upcoming };
});
await check("errata", async () => ({ cards: (await lib.errata()).length }));
console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
