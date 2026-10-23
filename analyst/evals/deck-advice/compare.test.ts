import { describe, expect, it } from "vitest";
import { combine, judgeCase, judgedBothWays, judgeOnce, orderFor, pairPrompt, parseSlot, positionBias, preference, scriptedPairLlm, variantOf, type CaseComparison, type Judgment, type PairLlm } from "./compare";

const say = (better: "first" | "second" | "tie"): PairLlm => async () => ({ text: JSON.stringify({ better, why: "because" }) });
const input = { question: "Tune it", deck: "1xL\n4xA", a: "ANSWER-FROM-A", b: "ANSWER-FROM-B" };
/** A judge that likes the advice from one variant whichever slot it is in. */
const likes = (variant: "A" | "B"): PairLlm => async ({ user }) => {
  const first = /<first_answer>([\s\S]*?)<\/first_answer>/.exec(user)![1]!;
  return { text: JSON.stringify({ better: first.endsWith(variant) ? "first" : "second", why: "" }) };
};
const j = (order: "AB" | "BA", better: Judgment["better"]): Judgment => ({ order, better, verdict: variantOf(order, better), why: "" });
const cmp = (id: string, ...judgments: Judgment[]): CaseComparison => ({ case: id, judgments, verdict: combine(judgments) });

describe("the side-by-side prompt", () => {
  it("shows the answers in the order given and says nothing about which variant is which (#678)", () => {
    const p = pairPrompt({ question: "Q?", deck: "D", first: "ONE", second: "TWO" });
    expect(p.user.indexOf("ONE")).toBeLessThan(p.user.indexOf("TWO"));
    expect(p.user).toContain("<first_answer>ONE</first_answer>");
    expect(p.user).toContain("<second_answer>TWO</second_answer>");
    expect(p.user).not.toContain("<known>");
  });

  it("tells the judge which cards were planted only when it is given them (#678)", () => {
    expect(pairPrompt({ question: "Q", deck: "D", first: "1", second: "2", planted: ["2xOP01-004"] }).user).toContain("2xOP01-004");
  });

  it("puts the answers in the opposite slots for the other order (#678)", async () => {
    const seen: string[] = [];
    const spy: PairLlm = async (p) => (seen.push(p.user), { text: JSON.stringify({ better: "tie", why: "" }) });
    await judgeOnce(spy, input, "AB");
    await judgeOnce(spy, input, "BA");
    expect(seen[0]!.indexOf("ANSWER-FROM-A")).toBeLessThan(seen[0]!.indexOf("ANSWER-FROM-B"));
    expect(seen[1]!.indexOf("ANSWER-FROM-B")).toBeLessThan(seen[1]!.indexOf("ANSWER-FROM-A"));
  });
});

describe("reading the verdict", () => {
  it("maps the picked slot back to the variant that was in it (#678)", () => {
    expect(variantOf("AB", "first")).toBe("A");
    expect(variantOf("AB", "second")).toBe("B");
    expect(variantOf("BA", "first")).toBe("B");
    expect(variantOf("BA", "second")).toBe("A");
    expect(variantOf("BA", "tie")).toBe("tie");
  });

  it("reports the variant the judge liked whichever order it saw (#678)", async () => {
    expect((await judgeOnce(likes("B"), input, "AB")).verdict).toBe("B");
    expect((await judgeOnce(likes("B"), input, "BA")).verdict).toBe("B");
    expect((await judgeOnce(likes("A"), input, "BA")).verdict).toBe("A");
  });

  it("reads JSON, JSON inside prose, and counts anything else as an invalid tie (#678)", async () => {
    expect(parseSlot('{"better":"second","why":"x"}')).toEqual({ better: "second", why: "x" });
    expect(parseSlot('Sure! {"better":"first","why":"y"} Done.')).toEqual({ better: "first", why: "y" });
    expect(parseSlot('{"better":"A"}')).toBeNull();
    expect(parseSlot("no idea")).toBeNull();
    const bad = await judgeOnce(async () => ({ text: "hmm" }), input, "AB");
    expect(bad).toMatchObject({ verdict: "tie", invalid: true });
  });
});

describe("order and position bias", () => {
  it("randomizes the order per case, repeatably, and about half the cases each way (#678)", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `case-${i}`);
    const ab = ids.filter((id) => orderFor(1, id) === "AB").length;
    expect(ab).toBeGreaterThan(160);
    expect(ab).toBeLessThan(240);
    expect(ids.map((id) => orderFor(1, id))).toEqual(ids.map((id) => orderFor(1, id)));
    expect(ids.map((id) => orderFor(2, id))).not.toEqual(ids.map((id) => orderFor(1, id)));
  });

  it("judges a seeded share of the cases in both orders (#678)", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `case-${i}`);
    expect(ids.filter((id) => judgedBothWays(1, id, 0))).toHaveLength(0);
    expect(ids.filter((id) => judgedBothWays(1, id, 1))).toHaveLength(400);
    const some = ids.filter((id) => judgedBothWays(1, id, 0.25)).length;
    expect(some).toBeGreaterThan(70);
    expect(some).toBeLessThan(130);
  });

  it("judges a both-ways case twice with opposite orders (#678)", async () => {
    const r = await judgeCase(likes("A"), { id: "x", ...input, seed: 1, bothWays: true });
    expect(r.judgments.map((x) => x.order).sort()).toEqual(["AB", "BA"]);
    expect(r.verdict).toBe("A");
    expect((await judgeCase(likes("A"), { id: "x", ...input, seed: 1, bothWays: false })).judgments).toHaveLength(1);
  });

  it("calls a verdict that changes with the order a tie, and keeps one both orders agree on (#678)", () => {
    expect(combine([j("AB", "first"), j("BA", "first")])).toBe("tie");
    expect(combine([j("AB", "first"), j("BA", "second")])).toBe("A");
    expect(combine([j("AB", "tie"), j("BA", "tie")])).toBe("tie");
    expect(combine([j("BA", "first")])).toBe("B");
  });

  it("finds a judge that always picks the first slot fully biased, and a steady judge unbiased (#678)", async () => {
    const ids = ["a", "b", "c", "d"];
    const run = async (llm: PairLlm) => positionBias(await Promise.all(ids.map((id) => judgeCase(llm, { id, ...input, seed: 1, bothWays: true }))));
    expect(await run(say("first"))).toEqual({ pairs: 4, consistent: 0, flipRate: 1, slotBias: 1 });
    expect(await run(say("second"))).toMatchObject({ flipRate: 1, slotBias: -1 });
    expect(await run(likes("B"))).toEqual({ pairs: 4, consistent: 4, flipRate: 0, slotBias: 0 });
  });

  it("measures no bias when no case was judged both ways (#678)", () => {
    expect(positionBias([cmp("a", j("AB", "first"))])).toEqual({ pairs: 0, consistent: 0, flipRate: null, slotBias: null });
  });
});

describe("preference rate", () => {
  it("is the share of decisive cases that preferred B, with ties kept out of the rate but counted (#678)", () => {
    const p = preference([cmp("1", j("AB", "second")), cmp("2", j("AB", "second")), cmp("3", j("AB", "second")), cmp("4", j("AB", "first")), cmp("5", j("AB", "tie")), cmp("6", j("AB", "tie"))]);
    expect(p).toMatchObject({ cases: 6, a: 1, b: 3, ties: 2, bRate: 0.75 });
    expect(p.interval[0]).toBeLessThan(0.75);
    expect(p.interval[1]).toBeGreaterThan(0.75);
  });

  it("has no rate when every case is a tie (#678)", () => {
    expect(preference([cmp("1", j("AB", "tie"))])).toMatchObject({ bRate: null, ties: 1 });
  });

  it("runs end to end with the dry-run judge (#678)", async () => {
    const r = await judgeCase(scriptedPairLlm, { id: "x", question: "Q", deck: "D", a: "no edits", b: "+2 OP01-001 X\n-2 OP01-002 Y", seed: 1, bothWays: true });
    expect(r.verdict).toBe("B");
  });
});
