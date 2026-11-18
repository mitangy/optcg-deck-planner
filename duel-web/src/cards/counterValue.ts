/**
 * Counter value shown on hand cards.
 *
 * Characters print a Counter value (`entry.counter`). Events have no printed
 * value, so we read the `[Counter]` clause of their text: "Up to 1 of your
 * Leader or Character cards gains +2000 power during this battle. Then, if …,
 * that card gains an additional +2000 power" → base 2000, boosted 4000.
 */
import type { CardAtlasEntry } from "./atlas";

export type CounterValue = {
  base: number;
  boosted?: number;
  scaling?: boolean;
  effectOnly?: boolean;
  source: "printed" | "event";
};

export function counterClause(text: string | undefined | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, " ");
  const m = flat.match(/\[Counter\](.*?)(?=\[(?:Trigger|Main|Counter)\]|$)/i);
  if (!m) return null;
  return m[1]!.trim();
}

const GAIN_RE = /gains? (an additional )?\+(\d+) power( instead)?/gi;

export function parseEventCounter(
  text: string | undefined | null,
): Omit<CounterValue, "source"> | null {
  const clause = counterClause(text);
  if (clause == null) return null;
  const norm = clause
    .replace(/K\.O\./g, "KO")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/[−–]/g, "-");
  const starts = [0];
  const boundary = /[.!?]\s+/g;
  let b: RegExpExecArray | null;
  while ((b = boundary.exec(norm))) starts.push(b.index + b[0].length);
  const sentenceStart = (i: number) => {
    let s = 0;
    for (const st of starts) if (st <= i) s = st;
    return s;
  };

  let base: number | null = null;
  let boosted: number | null = null;
  let scaling = false;
  let m: RegExpExecArray | null;
  GAIN_RE.lastIndex = 0;
  while ((m = GAIN_RE.exec(norm))) {
    const amount = Number(m[2]);
    const isInstead = Boolean(m[3]);
    if (base == null) {
      base = amount;
      continue;
    }
    const lead = norm.slice(sentenceStart(m.index), m.index).toLowerCase();
    const tail = norm.slice(m.index, norm.indexOf(".", m.index) + 1 || undefined).toLowerCase();
    if (isInstead) {
      boosted = amount;
    } else if (/\bfor (?:every|each)\b/.test(lead) || /\bfor (?:every|each)\b/.test(tail)) {
      scaling = true;
    } else if (/\bif\b/.test(lead)) {
      boosted = (boosted ?? base) + amount;
    } else {
      base += amount;
      if (boosted != null) boosted += amount;
    }
  }

  if (base == null) return { base: 0, effectOnly: true };
  const out: Omit<CounterValue, "source"> = { base };
  if (boosted != null && boosted !== base) out.boosted = boosted;
  if (scaling) out.scaling = true;
  return out;
}

export function counterValueFor(
  entry: Pick<CardAtlasEntry, "type" | "counter" | "effectText">,
): CounterValue | null {
  if (entry.counter != null && entry.counter > 0) {
    return { base: entry.counter, source: "printed" };
  }
  if (entry.type !== "event") return null;
  const parsed = parseEventCounter(entry.effectText);
  return parsed ? { ...parsed, source: "event" } : null;
}

export function formatCounter(v: CounterValue): string {
  if (v.effectOnly) return "Counter";
  let s = `+${v.base}`;
  if (v.boosted != null) s += ` / +${v.boosted}`;
  if (v.scaling) s += "+";
  return s;
}
