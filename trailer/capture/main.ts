/** Record one clip by id, or all of them: `npx tsx main.ts [id ...]`. */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const available = readdirSync(join(here, "clips")).filter((f) => /^\d\d-.*\.ts$/.test(f)).map((f) => f.replace(/\.ts$/, "")).sort();
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const list = wanted.length ? wanted.flatMap((w) => available.filter((a) => a === w || a.startsWith(`${w}-`) || a.startsWith(w))) : available;
if (!list.length) {
  console.error(`no clip matches ${wanted.join(", ")}; available: ${available.join(", ")}`);
  process.exit(2);
}
let failed = 0;
for (const name of [...new Set(list)]) {
  console.log(`\n=== ${name}`);
  try {
    const mod = (await import(`./clips/${name}.ts`)) as { run: () => Promise<void> };
    await mod.run();
  } catch (e) {
    failed++;
    console.error(`[${name}] FAILED:`, e);
  }
}
process.exit(failed ? 1 : 0);
