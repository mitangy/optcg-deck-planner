/** `npm run eval:judge-agreement -- <out/variant>`: judge vs Miko per rubric item; writes <dir>/agreement.md. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { judgeAgreement, judgeRubrics, needsPromptFix, type HumanGrade, type ItemAgreement } from "./human-grades";

const d = process.argv[2];
if (!d || !existsSync(join(resolve(d), "traces"))) {
  console.error("Usage: npm run eval:judge-agreement -- <path to an out/<variant> folder>");
  process.exit(2);
}
const dir = resolve(d);
const run = dir.split(/[\\/]/).pop()!;
const file = fileURLToPath(new URL("human-grades.jsonl", import.meta.url));
const rows = (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as HumanGrade) : []).filter((r) => r.run === run);
if (!rows.length) {
  console.error(`No human grades for run ${run} in ${file}.`);
  process.exit(1);
}
const { items, pooled, disagreements } = judgeAgreement(rows, judgeRubrics(dir));
const f = (x: number | null, digits = 2) => (x === null ? "n/a" : x.toFixed(digits));
const line = (a: ItemAgreement) => `| ${a.item} | ${a.n} | ${a.agree} | ${a.percent === null ? "n/a" : `${f(a.percent, 0)}%`} | ${f(a.kappa)} | ${a.skipped} | ${needsPromptFix(a) ? "needs prompt fix" : ""} |`;
const md = [
  `# Judge vs Miko: ${run}`,
  "",
  `${rows.length} graded answers. Items are flagged below 90% agreement or kappa below 0.6.`,
  "",
  "| Item | n | Agree | Agree % | Kappa | Skipped | |",
  "|---|---|---|---|---|---|---|",
  ...items.map(line),
  line(pooled),
  "",
  `## Disagreements (${disagreements.length})`,
  "",
  ...disagreements.map((x) => `- **${x.key} ${x.item}**: Miko ${x.human ? "pass" : "fail"}, judge ${x.judge ? "pass" : "fail"}. Judge: ${x.judgeWhy}.${x.note ? ` Miko's note: ${x.note}` : ""}`),
  "",
].join("\n");
writeFileSync(join(dir, "agreement.md"), md);
console.log(md);
