/**
 * `--selftest`: three known-bad answers (empty, "I don't know", an answer to a different question) for A01, C10
 * and D01 go through every grader, and each must score correct 0. A grader that passes any of them is broken.
 */
import type { Catalog } from "../src/catalog";
import { CASES } from "./cases";
import { gradeAnswer } from "./grade";
import type { Judge } from "./grade/judge";
import { resolveCites } from "./gold";
import type { EvalCase, Gold } from "./types";

const BAD_ANSWERS = ["", "I don't know.", "The Eiffel Tower is about 330 metres tall and was finished in 1889."];

/** The gold for a self-test case, taken from the committed case alone (no network). */
function offlineGold(c: EvalCase): Gold {
  const cites = resolveCites(c.cites, { faq: "ruling:self#1", deck: "deck:self" });
  if (c.group === "A") return { status: "ok", cites, verdict: c.verdict === "no_ruling" ? "no_ruling" : c.verdict };
  if (c.group === "C" && c.expect.kind === "odds") return { status: "ok", cites, percent: c.expect.percent, hits: c.expect.hits };
  return { status: "ok", cites };
}

export async function selftest(catalog: Catalog, judge: Judge, ids = ["A01", "C10", "D01"]): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  for (const id of ids) {
    const c = CASES.find((x) => x.id === id);
    if (!c) throw new Error(`self-test case ${id} is not in the case list`);
    for (const answer of BAD_ANSWERS) {
      const r = await gradeAnswer(c, offlineGold(c), { answer, citations: [], toolText: "", userText: c.question }, { catalog, judge });
      const failed = r.grade.correct === 0;
      if (!failed) ok = false;
      lines.push(`${failed ? "ok  " : "FAIL"} ${id} scores ${r.grade.correct} for ${JSON.stringify(answer.slice(0, 40))}`);
    }
  }
  return { ok, lines };
}
