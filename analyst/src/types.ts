import type { Catalog } from "./catalog";
import type { PlannerApi } from "./matches";
import type { Knowledge } from "./server";

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export type Block = Record<string, unknown> & { type: string };
export type Message = { role: "user" | "assistant"; content: string | Block[] };
/** `model` is the model that served the call (the eval checks it); optional so scripted replies need not set it. */
export type ModelReply = { content: Block[]; stop_reason: string | null; usage: Usage; model?: string };

/** A citation of one tool result, as the apps show it: which source, its title and the quoted fact. */
export type Citation = { source: string; title: string; cited_text: string };
/** A citation placed in the answer: `at` is the UTF-16 offset in the answer text it follows. */
export type PlacedCitation = Citation & { at: number };

/** One streamed model call: text deltas go to onText as they arrive, citations (of the text before them) to onCite. */
export type CallModel = (
  params: Record<string, unknown>,
  onText: (delta: string) => void,
  signal: AbortSignal,
  onCite?: (citation: Citation) => void,
) => Promise<ModelReply>;

export type SseEvent = { event: "thread" | "status" | "text" | "cite" | "proposal" | "deck_draft" | "plan" | "choice" | "done" | "error"; data: Record<string, unknown> };

export type ChatDeps = { api: PlannerApi; catalog: Catalog; knowledge: Knowledge; callModel: CallModel };
