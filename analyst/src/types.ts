import type { SseEventName } from "@optcg/analyst-contract";
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
export type ModelReply = { content: Block[]; stop_reason: string | null; usage: Usage; model?: string };

export type Citation = { source: string; title: string; cited_text: string };
export type PlacedCitation = Citation & { at: number };

export type CallModel = (
  params: Record<string, unknown>,
  onText: (delta: string) => void,
  signal: AbortSignal,
  onCite?: (citation: Citation) => void,
) => Promise<ModelReply>;

export type SseEvent = { event: SseEventName; data: Record<string, unknown> };

export type ChatDeps = { api: PlannerApi; catalog: Catalog; knowledge: Knowledge; callModel: CallModel };
