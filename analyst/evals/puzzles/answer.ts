/** Reading the model's JSON answer and grading it exactly against the gold (#677). */
import type { Gold, ParsedAnswer } from "./types";

const FENCE = /```[ \t]*(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/g;

/** Top-level `{...}` spans in plain text, for an answer that came without a fence. */
function braceSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"' && depth > 0) inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) spans.push(text.slice(start, i + 1));
    }
  }
  return spans;
}

/** The last fenced JSON block of the reply (or, with no fence, its last `{...}` object), parsed. Unparseable is not ok. */
export function parseAnswer(text: string): ParsedAnswer {
  const fenced = [...text.matchAll(FENCE)].map((m) => m[1]!.trim()).filter(Boolean);
  const candidates = fenced.length ? fenced : braceSpans(text);
  const raw = candidates[candidates.length - 1];
  if (raw === undefined) return { ok: false, reason: "no JSON block in the reply" };
  try {
    return { ok: true, value: JSON.parse(raw), raw };
  } catch {
    return { ok: false, reason: "the JSON block does not parse" };
  }
}

const CARD_ID = /\b(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\b/i;
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A card number the way the gold writes it: an id inside the string, else the one card of the puzzle with that name, else the text itself. */
export function normalizeCard(item: string, known: readonly { id: string; name: string }[] = []): string {
  const id = item.match(CARD_ID)?.[1];
  if (id) return id.toUpperCase();
  const named = known.filter((k) => plain(k.name) === plain(item));
  return named.length === 1 ? named[0]!.id : item.trim().toLowerCase();
}

export type Graded = { correct: boolean; given: string; reason?: string };

const numberOf = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d[\d,]*$/.test(v.trim())) return Number(v.trim().replace(/,/g, ""));
  return undefined;
};

/** The field the gold names; a bare value or a one-field object is read as that field (unless `strict`, for one part of several). */
function fieldOf(value: unknown, key: string, strict = false): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (key in o) return o[key];
    const keys = Object.keys(o);
    return !strict && keys.length === 1 ? o[keys[0]!] : undefined;
  }
  return strict ? undefined : value;
}

/** An "all" gold: every part is graded on its own field of the answer object, and the reason names the parts that failed. */
function gradeAll(gold: Extract<Gold, { mode: "all" }>, value: unknown, known: readonly { id: string; name: string }[]): Graded {
  const results = gold.parts.map((part) => ({ part, graded: gradeField(part, fieldOf(value, part.key, true), known) }));
  const failed = results.filter((r) => !r.graded.correct).map((r) => r.part.key);
  const given = `{${results.map((r) => `${JSON.stringify(r.part.key)}:${r.graded.given}`).join(",")}}`;
  return failed.length ? { correct: false, given, reason: `wrong: ${failed.join(", ")}` } : { correct: true, given };
}

/** Exact grading: numbers must be equal; lists are equal as sets (or as multisets) of normalized card ids. */
export function gradeAnswer(gold: Gold, parsed: ParsedAnswer, known: readonly { id: string; name: string }[] = []): Graded {
  if (!parsed.ok) return { correct: false, given: "(no answer)", reason: parsed.reason };
  return gold.mode === "all" ? gradeAll(gold, parsed.value, known) : gradeField(gold, fieldOf(parsed.value, gold.key), known);
}

/** One gold against the value found in its field. */
function gradeField(gold: Gold, field: unknown, known: readonly { id: string; name: string }[]): Graded {
  if (gold.mode === "all") return gradeAll(gold, field, known);
  if (gold.mode === "number") {
    const n = numberOf(field);
    return n === undefined ? { correct: false, given: JSON.stringify(field ?? null), reason: "not a number" } : { correct: n === gold.value, given: String(n) };
  }
  if (!Array.isArray(field) || field.some((x) => typeof x !== "string")) return { correct: false, given: JSON.stringify(field ?? null), reason: "not a list of card numbers" };
  const given = (field as string[]).map((x) => normalizeCard(x, known));
  const norm = (xs: string[]) => (gold.mode === "set" ? [...new Set(xs)] : xs).sort();
  const a = norm(given);
  const b = norm([...gold.value]);
  return { correct: a.length === b.length && a.every((x, i) => x === b[i]), given: JSON.stringify(a) };
}

export const goldText = (gold: Gold): string =>
  gold.mode === "all" ? `{${gold.parts.map((p) => `${JSON.stringify(p.key)}:${goldText(p)}`).join(",")}}` : gold.mode === "number" ? String(gold.value) : JSON.stringify([...gold.value].sort());
