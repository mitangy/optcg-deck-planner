/**
 * Draft eval case stubs from the answers players marked "This is wrong" (#679).
 *
 *   npm run feedback-cases -w @optcg/analyst -- [--days 90] [--out evals/out/feedback-cases.jsonl]
 *
 * Reads GET /admin/feedback/export with the analyst service secret (ANALYST_API_URL and ANALYST_SERVICE_SECRET name the
 * planner API and its secret) and writes one JSON line per rating: the question, the stored answer, the player's note
 * and a todo. A person finishes each one (gold, group) before it goes in evals/cases.ts. Player names are never read.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stubsJsonl, type FeedbackItem } from "../evals/feedbackCases";

const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const url = process.env.ANALYST_API_URL;
const secret = process.env.ANALYST_SERVICE_SECRET;
if (!url || !secret) {
  console.error("usage: feedback-cases.ts [--days 90] [--out file.jsonl]   (needs ANALYST_API_URL and ANALYST_SERVICE_SECRET)");
  process.exit(2);
}
const days = Number(flag("days") ?? 90);
const out = flag("out") ?? fileURLToPath(new URL("../evals/out/feedback-cases.jsonl", import.meta.url));

const res = await fetch(`${url.replace(/\/+$/, "")}/admin/feedback/export?rating=wrong&days=${days}&limit=500`, { headers: { "x-analyst-service": secret } });
if (!res.ok) {
  console.error(`GET /admin/feedback/export failed: HTTP ${res.status}`);
  process.exit(1);
}
const { items } = (await res.json()) as { items: FeedbackItem[] };
const jsonl = stubsJsonl(items);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, jsonl);
console.log(`${jsonl ? jsonl.trimEnd().split("\n").length : 0} draft case stubs from ${items.length} "wrong" ratings -> ${out}`);
