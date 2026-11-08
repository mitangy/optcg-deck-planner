/**
 * Card preview text (#348): splits a card's effect text into plain text and the
 * bracketed keyword tags the printed card draws as coloured chips ([On Play],
 * [Counter], [DON!! x1], …). Pure, so the panel renders segments as React nodes
 * and never injects HTML.
 */

export type ChipKind = "timing" | "counter" | "trigger" | "once" | "keyword" | "don";

export type PreviewSegment =
  | { type: "text"; text: string }
  | { type: "chip"; kind: ChipKind; text: string };

const KEYWORDS = new Set([
  "blocker",
  "rush",
  "rush: character",
  "double attack",
  "banish",
  "unblockable",
]);

const TIMINGS = new Set([
  "on play",
  "when attacking",
  "on k.o.",
  "on block",
  "main",
  "your turn",
  "opponent's turn",
  "end of your turn",
  "end of your opponent's turn",
  "on your opponent's attack",
]);

/** Chip kind for the text between the brackets, or null when it is not a known tag. */
export function chipKind(tag: string): ChipKind | null {
  const t = tag.trim().toLowerCase().replace(/[’‘]/g, "'");
  if (/^don!! ?x ?\d+$/.test(t)) return "don";
  if (t === "counter") return "counter";
  if (t === "trigger") return "trigger";
  if (t === "once per turn") return "once";
  if (KEYWORDS.has(t)) return "keyword";
  if (TIMINGS.has(t) || t.startsWith("activate:")) return "timing";
  return null;
}

// A bracketed tag, or a bare "DON!! −2" cost (the printed card draws it as a chip too).
const TAG_RE = /\[([^\[\]\n]{1,40})\]|DON!! ?[−–-]\d+/g;

export function parsePreviewText(text: string): PreviewSegment[] {
  const out: PreviewSegment[] = [];
  let last = 0;
  const push = (s: string) => {
    if (s) out.push({ type: "text", text: s });
  };
  for (const m of text.matchAll(TAG_RE)) {
    const idx = m.index!;
    if (m[1] !== undefined) {
      const kind = chipKind(m[1]);
      if (!kind) continue;
      push(text.slice(last, idx));
      out.push({ type: "chip", kind, text: m[1].trim() });
    } else {
      push(text.slice(last, idx));
      out.push({ type: "chip", kind: "don", text: m[0] });
    }
    last = idx + m[0].length;
  }
  push(text.slice(last));
  return out;
}
