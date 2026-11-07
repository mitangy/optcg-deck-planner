/** `npm run eval:grade-export -- <out/variant>`: writes <dir>/grading.json for the grading page (no judge verdicts). */
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportForGrading } from "./human-grades";

const dir = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(dir, "traces"))) {
  console.error("Usage: npm run eval:grade-export -- <path to an out/<variant> folder>");
  process.exit(2);
}
const items = exportForGrading(dir);
const out = join(dir, "grading.json");
writeFileSync(out, JSON.stringify(items, null, 2));
console.log(`${out}: ${items.length} answers`);
