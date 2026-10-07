/**
 * `npm run eval:grade -w @optcg/analyst -- out/<variant>`: Miko grades the D answers (rep 0) by hand so the
 * rubric judge can be calibrated against him. Per answer: y/n per rubric item (blank = does not apply), an overall
 * 1-5 and a note. Lines are appended to evals/human-grades.jsonl, which keeps the answer text only when it repeats
 * fewer than 12 consecutive words of official text; otherwise just its hash.
 */
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { rubricItems } from "./grade/judge";
import { shareable } from "./grade/overlap";
import { CASES } from "./cases";
import { summarizeTurn } from "./trace";
import type { Message } from "../src/chat";
import type { Rubric } from "./types";

type HumanGrade = { case: string; run: string; git_sha: string; answer_sha256: string; answer?: string; items: Record<string, 0 | 1 | null>; overall: number; note: string; grader: "miko"; graded_at: string };

const dir = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(dir, "traces"))) {
  console.error("Usage: npm run eval:grade -w @optcg/analyst -- <path to an out/<variant> folder>");
  process.exit(2);
}
const file = fileURLToPath(new URL("human-grades.jsonl", import.meta.url));
const run = dir.split(/[\\/]/).pop()!;
let gitSha = "";
try {
  gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}
const tally: Record<string, { agree: number; total: number }> = {};
const rl = createInterface({ input: process.stdin, output: process.stdout });
const results = readFileSync(join(dir, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { case: string; rep: number; answer_sha256?: string });

for (const c of CASES.filter((x) => x.group === "D")) {
  const trace = join(dir, "traces", `${c.id}_rep0.json`);
  if (!existsSync(trace)) continue;
  const t = JSON.parse(readFileSync(trace, "utf8")) as { turn: Message[]; rubric?: Rubric };
  const s = summarizeTurn(t.turn);
  console.log(`\n=== ${c.id}: ${c.question}\n\n${s.answer}\n\nsources cited: ${[...new Set(s.citations.map((x) => x.source))].join(", ") || "none"}`);
  const items: HumanGrade["items"] = {};
  for (const [id, text] of Object.entries(rubricItems(c.focus))) {
    const judge = t.rubric?.[id];
    const a = (await rl.question(`${id} ${text}\n  judge: ${judge ? `${judge.pass} (${judge.why})` : "n/a"}  you [y/n/blank]: `)).trim().toLowerCase();
    items[id] = a === "y" ? 1 : a === "n" ? 0 : null;
    if (items[id] !== null && judge && judge.pass !== null) {
      const t2 = (tally[id] ??= { agree: 0, total: 0 });
      t2.total++;
      if (Number(judge.pass) === items[id]) t2.agree++;
    }
  }
  const overall = Number(await rl.question("overall 1-5: "));
  const note = (await rl.question("note: ")).trim();
  const row = results.find((r) => r.case === c.id && r.rep === 0);
  const line: HumanGrade = {
    case: c.id,
    run,
    git_sha: gitSha,
    answer_sha256: row?.answer_sha256 ?? "",
    ...(shareable(s.answer, s.toolText) ? { answer: s.answer } : {}),
    items,
    overall,
    note,
    grader: "miko",
    graded_at: new Date().toISOString(),
  };
  appendFileSync(file, `${JSON.stringify(line)}\n`);
}
rl.close();

// Judge-human agreement per item for this session, ignoring items either side marked as not applying.
console.log("\nJudge-human agreement (this session):");
for (const [id, t] of Object.entries(tally)) console.log(`  ${id}: ${t.agree}/${t.total} (${Math.round((100 * t.agree) / t.total)}%)`);
console.log("If any item is below 90%, fix the judge prompt (or move D to claude-opus-5-5 as judge) and grade again.");
