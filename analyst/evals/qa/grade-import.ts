/** `npm run eval:grade-import -- <out/variant> <grades.json>`: adds the page's grades to evals/qa/human-grades.jsonl. */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendHumanGrades, toHumanGrades, type PageGrade } from "./human-grades";

const [d, g] = process.argv.slice(2);
if (!d || !g || !existsSync(join(resolve(d), "traces")) || !existsSync(resolve(g))) {
  console.error("Usage: npm run eval:grade-import -- <path to an out/<variant> folder> <grades.json>");
  process.exit(2);
}
const dir = resolve(d);
let gitSha = "";
try {
  gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}
const parsed = JSON.parse(readFileSync(resolve(g), "utf8")) as PageGrade[] | { grades: PageGrade[] };
const grades = Array.isArray(parsed) ? parsed : parsed.grades;
const { rows, skipped } = toHumanGrades(grades, { dir, run: dir.split(/[\\/]/).pop()!, gitSha, now: new Date().toISOString() });
appendHumanGrades(fileURLToPath(new URL("human-grades.jsonl", import.meta.url)), rows);
console.log(`written ${rows.length}, skipped ${skipped.length}`);
for (const s of skipped) console.log(`  skipped ${s.key}: ${s.why}`);
