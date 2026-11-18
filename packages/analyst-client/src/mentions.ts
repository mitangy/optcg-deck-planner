import { parseSource, type SourceEntry } from "./citations";

const ID_SOURCE = "(?:(?:OP|ST|EB|PRB)\\d{2}|P)-\\d{3}";
const WORD = "[\\p{L}\\p{N}]";

export type MentionPart = string | { text: string; id: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function citedCardNames(entries: readonly SourceEntry[], cardName: (id: string) => string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of entries) {
    if (e.parsed.kind !== "card") continue;
    const id = e.parsed.id;
    const name = (cardName(id) ?? e.title.replace(new RegExp(`\\s*\\(${escapeRe(id)}\\)\\s*$`), "")).trim();
    if (name.length >= 3 && name !== id && !out.has(name)) out.set(name, id);
  }
  return out;
}

// Longest name first, so "Monkey.D.Luffy" wins over "Luffy".
export function findMentions(text: string, names: ReadonlyMap<string, string>, hasImage: (id: string) => boolean): MentionPart[] {
  const byName = [...names.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const alts = [`(?<![\\p{L}\\p{N}-])${ID_SOURCE}(?!${WORD}|-\\d)`, ...byName.map((n) => `(?<!${WORD})${escapeRe(n)}(?!${WORD})`)];
  const re = new RegExp(alts.join("|"), "gu");
  const out: MentionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const id = names.get(m[0]) ?? m[0];
    if (!hasImage(id)) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ text: m[0], id });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
