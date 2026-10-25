/**
 * The dry run's model (#678): a fake that proposes plausible edits so the whole pipeline, simulation included,
 * runs for free. For a sabotaged deck it takes out about 60% of the planted cards, puts the original cards
 * back and adds one needless swap; for a meta deck it swaps two copies of its least played card for a popular
 * one. Half the cases answer through propose_deck_edit (the Apply card) and half in +N / -N lines, so both
 * extraction paths run. It is not a model: the numbers say nothing about Log Pose.
 */
import type { Catalog } from "../../src/catalog";
import { PROPOSE_TOOL } from "../../src/proposals";
import type { Delta } from "../grade/edits";
import { scriptedModel, textReply, toolReply } from "../scripted";
import type { AdviceCase } from "./cases";
import { applyAdvice } from "./edits";
import { seedOf } from "./sabotage";

/** The edits the fake model suggests, all legal for the case's deck. */
export function scriptedDeltas(catalog: Catalog, c: AdviceCase, freq: ReadonlyMap<string, number>): Delta[] {
  const legal = (deltas: Delta[]) => applyAdvice(catalog, c.leaderId, c.cards, { source: "text", deltas }).legal;
  const have = new Map(c.cards.map((x) => [x.id, x.copies]));
  const deltas: Delta[] = [];
  if (c.kind === "sabotaged") {
    const take = c.planted.slice(0, Math.ceil(c.planted.length * 0.6));
    const copies = take.reduce((s, p) => s + p.copies, 0);
    for (const p of take) deltas.push({ id: p.id, delta: -p.copies });
    let back = copies;
    for (const r of c.removed) {
      if (back <= 0) break;
      const n = Math.min(r.copies, back);
      deltas.push({ id: r.id, delta: n });
      back -= n;
    }
  }
  // One swap that is not about the sabotage: the least played card for the most played one of the leader's colors.
  const leader = catalog.cards.get(c.leaderId);
  const plantedIds = new Set(c.planted.map((p) => p.id));
  const out = [...c.cards].filter((x) => !plantedIds.has(x.id) && x.copies >= 2 && !deltas.some((d) => d.id === x.id)).sort((a, b) => (freq.get(a.id) ?? 0) - (freq.get(b.id) ?? 0) || a.id.localeCompare(b.id))[0];
  const into = [...catalog.cards.values()]
    .filter((x) => x.type !== "leader" && leader && x.colors.every((col) => leader.colors.includes(col)) && !have.has(x.id) && (freq.get(x.id) ?? 0) >= 2)
    .sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  if (out) {
    for (const x of into) {
      const swap: Delta[] = [{ id: out.id, delta: -2 }, { id: x.id, delta: 2 }];
      if (legal([...deltas, ...swap])) {
        deltas.push(...swap);
        break;
      }
    }
  }
  return legal(deltas) ? deltas : [];
}

export const scriptedStyle = (c: AdviceCase): "proposal" | "text" => (seedOf(1, c.id) % 2 === 0 ? "proposal" : "text");

const lines = (catalog: Catalog, deltas: Delta[]) => deltas.map((d) => `${d.delta > 0 ? "+" : "-"}${Math.abs(d.delta)} ${catalog.cards.get(d.id)?.name ?? d.id} (${d.id})`);

export function scriptedAdviceModel(catalog: Catalog, c: AdviceCase, freq: ReadonlyMap<string, number>, model: string) {
  const deltas = scriptedDeltas(catalog, c, freq);
  const style = scriptedStyle(c);
  return scriptedModel(({ call }) => {
    if (!deltas.length) return textReply("This list looks well tuned for the current meta; I would not change it. This is my read.", model);
    // After the app's check (#686) a text-style model keeps its answer and does not repeat the lines.
    if (style === "text" && call > 0) return textReply("Those are the changes I would make.", model);
    if (style === "text") return textReply(`This is my read of the list. Here are the changes I would make:\n${lines(catalog, deltas).join("\n")}`, model);
    if (call === 0) {
      return toolReply([{ name: PROPOSE_TOOL, input: { summary: "Tune the list for the current meta", changes: deltas.map((d) => ({ id: d.id, delta: d.delta, reason: d.delta < 0 ? "Weaker than the alternatives here" : "Fits the plan better" })) } }], model);
    }
    return textReply("I put my suggested changes on the card below. This is my read of the list.", model);
  });
}
