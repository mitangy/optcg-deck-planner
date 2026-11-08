import type { Block, Citation, PlacedCitation, SseEvent } from "./types";

const MAX_CITED_TEXT = 800;

/** A search-result citation from the API (a streamed delta or a stored block); anything else is not one of ours. */
export function toCitation(raw: unknown): Citation | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.type !== "search_result_location" || typeof c.source !== "string" || !c.source) return null;
  const cited = typeof c.cited_text === "string" ? c.cited_text : "";
  return { source: c.source, title: typeof c.title === "string" ? c.title : "", cited_text: cited.length > MAX_CITED_TEXT ? `${cited.slice(0, MAX_CITED_TEXT - 1)}…` : cited };
}

/**
 * The answer's text (its text blocks run together, as streamed) with each cited block's citations placed at
 * the end of that block, then trimmed with the offsets moved to match.
 */
export function flattenCited(content: Block[]): { text: string; citations: PlacedCitation[] } {
  let text = "";
  const placed: PlacedCitation[] = [];
  for (const b of content) {
    if (b.type !== "text") continue;
    text += String(b.text);
    const seen = new Set<string>();
    for (const raw of Array.isArray(b.citations) ? b.citations : []) {
      const c = toCitation(raw);
      const key = c && `${c.source}\n${c.cited_text}`;
      if (!c || seen.has(key!)) continue;
      seen.add(key!);
      placed.push({ at: text.length, ...c });
    }
  }
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return { text: trimmed, citations: placed.map((c) => ({ ...c, at: Math.min(Math.max(c.at - lead, 0), trimmed.length) })) };
}

/** Wires a model call's text and citations to SSE events: citations are batched and sent just before the next text (or at the end), so a marker lands right after the text it cites. */
export function streamTo(emit: (e: SseEvent) => void, onDelta?: (delta: string) => void) {
  let pending: Citation[] = [];
  const flush = () => {
    if (!pending.length) return;
    emit({ event: "cite", data: { citations: pending } });
    pending = [];
  };
  return {
    onText: (delta: string) => {
      flush();
      onDelta?.(delta);
      emit({ event: "text", data: { delta } });
    },
    onCite: (c: Citation) => void pending.push(c),
    flush,
  };
}

/** Replays a saved answer as the stream would have sent it: text up to each citation's offset, then that offset's citations. */
export function replayCited(text: string, citations: PlacedCitation[], emit: (e: SseEvent) => void) {
  const offsets = [...new Set(citations.map((c) => Math.min(c.at, text.length)))].sort((a, b) => a - b);
  let sent = 0;
  for (const at of offsets) {
    if (at > sent) emit({ event: "text", data: { delta: text.slice(sent, at) } });
    sent = Math.max(sent, at);
    const group = citations.filter((c) => Math.min(c.at, text.length) === at).map(({ at: _at, ...c }) => c);
    emit({ event: "cite", data: { citations: group } });
  }
  if (sent < text.length) emit({ event: "text", data: { delta: text.slice(sent) } });
}
