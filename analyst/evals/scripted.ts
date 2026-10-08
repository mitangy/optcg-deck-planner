/**
 * A scripted stand-in for the Claude API, for the harness tests and the dry run (`--model-api scripted`).
 * `scriptedModel` plays replies from a function; `oracleScript` is a fake model that looks up what each case
 * needs, then answers with the gold's facts and cites the sources the gold wants. It proves the plumbing
 * and the graders, not Log Pose.
 */
import { toCitation, type CallModel, type ModelReply, type Usage } from "../src/chat";
import type { Catalog } from "../src/catalog";
import { messageOf } from "./cases";
import { CARD_ID } from "./grade/extract";
import type { EvalCase, Gold } from "./types";

type Block = Record<string, unknown> & { type: string };

export type ScriptContext = { params: Record<string, any>; call: number }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Script = (ctx: ScriptContext) => ModelReply | Error;

export const usage = (input: number, output: number): Usage => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

export function scriptedModel(script: Script): CallModel {
  let call = 0;
  return async (params, onText, _signal, onCite) => {
    const reply = script({ params, call: call++ });
    if (reply instanceof Error) throw reply;
    for (const b of reply.content) {
      if (b.type !== "text") continue;
      onText(String(b.text));
      for (const raw of (b.citations as unknown[] | undefined) ?? []) {
        const c = toCitation(raw);
        if (c) onCite?.(c);
      }
    }
    return reply;
  };
}

export const textReply = (text: string, model: string, citations: Block[] = []): ModelReply => ({
  content: [{ type: "text", text, ...(citations.length ? { citations } : {}) }],
  stop_reason: "end_turn",
  usage: usage(1500, 200),
  model,
});

let nextId = 0;
export const toolReply = (calls: { name: string; input: unknown }[], model: string): ModelReply => ({
  content: calls.map((c) => ({ type: "tool_use", id: `toolu_${nextId++}`, name: c.name, input: c.input })),
  stop_reason: "tool_use",
  usage: usage(1200, 100),
  model,
});

/** Every search result the tools returned so far in this conversation, by source id. */
function sourcesIn(params: ScriptContext["params"]): Map<string, { title: string; text: string }> {
  const out = new Map<string, { title: string; text: string }>();
  for (const m of (params.messages ?? []) as { role: string; content: unknown }[]) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content as Block[]) {
      if (b.type !== "tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content as Block[]) {
        if (r.type === "search_result") out.set(String(r.source), { title: String(r.title), text: String((r.content as Block[])[0]?.text ?? "") });
      }
    }
  }
  return out;
}

/** The tool calls an ideal model would make for a case, read from what the gold expects it to cite. */
export function toolCallsFor(c: EvalCase, gold: Gold): { name: string; input: unknown }[] {
  const calls: { name: string; input: unknown }[] = [];
  if (c.group === "C") {
    calls.push({ name: c.tool, input: c.args });
    if (gold.cites.all.some((g) => g.some((r) => r.startsWith("deck:"))) && c.tool !== "analyze_deck") calls.push({ name: "analyze_deck", input: { text: c.deck } });
    // An ideal model looks up the card it names as the problem.
    if (gold.offending?.length) calls.push({ name: "get_cards", input: { ids: gold.offending } });
    return calls;
  }
  const question = messageOf(c);
  const firstCard = question.match(new RegExp(CARD_ID.source))?.[1];
  for (const group of gold.cites.all) {
    const rule = group[0]!;
    const [kind, rest = ""] = [rule.slice(0, rule.indexOf(":")), rule.slice(rule.indexOf(":") + 1)];
    if (kind === "ruling" && rest.startsWith("general")) calls.push({ name: "rules_lookup", input: { query: c.question.replace(/[^\w\s[\]!-]/g, " ") } });
    else if (kind === "ruling") calls.push({ name: "card_rulings", input: { ids: [rest.split("#")[0]] } });
    else if (kind === "rule") calls.push({ name: "rules_lookup", input: { section: rest } });
    else if (kind === "card") calls.push({ name: "get_cards", input: { ids: [rest === "*" ? firstCard : rest] } });
    else if (kind === "deck") calls.push({ name: "analyze_deck", input: { text: c.deck } });
    else if (kind === "playbook") {
      const [leader, opponent] = rest.split("~");
      calls.push({ name: "playbook", input: opponent ? { leader, opponent } : { leader } });
    } else if (kind === "stats") {
      const [leader, opponent] = rest.split("~");
      calls.push({ name: "matchup_stats", input: opponent ? { leader, opponent } : { leader } });
    }
  }
  // Group alternatives may need two lookups (a ruling that cites a card): ask for the card too.
  if (c.group === "A" && "noRuling" in c.faq) calls.push({ name: "get_cards", input: { ids: [c.faq.noRuling] } });
  return calls;
}

/** Fragments of the tools' own sentences about games and win rates, so the dry-run answer quotes numbers a tool returned. */
const statsLines = (sources: Map<string, { title: string; text: string }>) =>
  [...sources].filter(([s]) => s.startsWith("stats:")).map(([, v]) => v.text.replace(/^[^:]*:\s*/, "")).slice(0, 3);

function answerFor(c: EvalCase, gold: Gold, catalog: Catalog, sources: Map<string, { title: string; text: string }>): string {
  const name = (id: string) => `${catalog.cards.get(id)?.name ?? id} (${id})`;
  const out: string[] = [];
  if (c.group === "A") {
    if (gold.verdict === "no_ruling") out.push("No official ruling covers this exact case. From the card text: no, the Life cost can't be paid.");
    else out.push(`${gold.verdict === "yes" ? "Yes" : "No"}, per the official FAQ.`);
    if (gold.dates) out.push(`The errata is dated ${gold.dates[0]}.`);
  } else if (c.group === "B") {
    if (gold.verdict) out.push(`${gold.verdict === "yes" ? "Yes" : "No"}.`);
    if (gold.number !== undefined) out.push(`The number is ${gold.number}.`);
    for (const id of gold.can ?? []) out.push(`${name(id)} can block.`);
    for (const id of gold.cannot ?? []) out.push(`${name(id)} cannot block.`);
    for (const m of gold.mustSay ?? []) out.push(m.example);
  } else if (c.group === "C") {
    if (gold.legal !== undefined) {
      out.push(gold.legal ? "Yes, this is legal." : `No, this is not legal: ${(gold.offending ?? []).map(name).join(" and ") || "see the problem listed"}.`);
      if (gold.mention !== undefined) out.push(`It has ${gold.mention} cards, not 50.`);
    }
    if (gold.percent !== undefined) out.push(`That is ${gold.percent}%.`);
    if (gold.hits !== undefined) out.push(`The deck runs ${gold.hits} such cards.`);
  } else {
    out.push("This is my read (my judgement): the playbook note is a draft, so treat it as a starting point.");
    out.push(...statsLines(sources));
    if (sources.size && [...sources.keys()].some((s) => s.startsWith("stats:"))) out.push("These win rates come from games on optcgduel.app, not tournaments.");
    out.push("Turn 2 and turn 3 are the turns that matter; keep your cheap plays.");
    if (c.deck) {
      const firstCardInDeck = [...c.deck.matchAll(/(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})/g)].map((m) => m[1]!).find((id) => catalog.cards.get(id)?.type !== "leader")!;
      out.push(`-1 ${firstCardInDeck}`, `+1 ${firstCardInDeck}`);
    }
  }
  return out.join("\n");
}

/** A fake model that answers a case right: it makes the lookups the gold implies, then answers with the gold's facts and cites what the gold wants. */
export function oracleScript(c: EvalCase, gold: Gold, catalog: Catalog, model: string): Script {
  return ({ params, call }) => {
    if (call === 0) return toolReply(toolCallsFor(c, gold), model);
    const sources = sourcesIn(params);
    const citations: Block[] = [];
    for (const group of gold.cites.all) {
      const source = group.find((r) => sources.has(r)) ?? [...sources.keys()].find((s) => group.some((r) => r.endsWith("*") && s.startsWith(r.slice(0, -1))));
      if (!source) continue;
      const s = sources.get(source)!;
      citations.push({ type: "search_result_location", source, title: s.title, cited_text: s.text });
    }
    return textReply(answerFor(c, gold, catalog, sources), model, citations);
  };
}
