/** Reads the turn runChat saved (the eval planner captures it): the answer, its citations, the tool calls and what the tools returned. */
import { flattenCited, type Message, type PlacedCitation } from "../src/chat";

type Block = Record<string, unknown> & { type: string };

export type TurnSummary = {
  answer: string;
  citations: PlacedCitation[];
  toolCalls: { name: string; input: unknown }[];
  /** Every tool result as plain text (titles and facts), the corpus the answer's numbers are checked against. */
  toolText: string;
  /** The player's message, including any context block. */
  userText: string;
};

const blocksOf = (m: Message): Block[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);

/** A tool result block's content as text. */
export function resultText(block: Block): string {
  const c = block.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return (c as Block[])
    .map((b) => (b.type === "search_result" ? [String(b.title ?? ""), ...((b.content as Block[] | undefined) ?? []).map((t) => String(t.text ?? ""))].join("\n") : String(b.text ?? "")))
    .join("\n");
}

export function summarizeTurn(turn: readonly Message[]): TurnSummary {
  const answers: string[] = [];
  const citations: PlacedCitation[] = [];
  const toolCalls: TurnSummary["toolCalls"] = [];
  const tool: string[] = [];
  let userText = "";
  for (const [i, m] of turn.entries()) {
    const blocks = blocksOf(m);
    if (m.role === "assistant") {
      const flat = flattenCited(blocks);
      if (flat.text) {
        const offset = answers.reduce((s, a) => s + a.length + 2, 0);
        answers.push(flat.text);
        citations.push(...flat.citations.map((c) => ({ ...c, at: c.at + offset })));
      }
      for (const b of blocks) if (b.type === "tool_use") toolCalls.push({ name: String(b.name), input: b.input });
    } else {
      for (const b of blocks) {
        if (b.type === "tool_result") tool.push(resultText(b));
        else if (i === 0 && b.type === "text") userText += `${String(b.text)}\n`;
      }
    }
  }
  return { answer: answers.join("\n\n"), citations, toolCalls, toolText: tool.join("\n"), userText };
}
