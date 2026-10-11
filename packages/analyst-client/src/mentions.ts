import { parseSource, type SourceEntry } from "./citations";

/** A card number as printed: OP01-006, ST13-007, EB02-023, PRB01-001, P-001. */
const ID_SOURCE = "(?:(?:OP|ST|EB|PRB)\\d{2}|P)-\\d{3}";
const WORD = "[\\p{L}\\p{N}]";

/** A stretch of an answer's text: plain, or a card mention to wrap. */
export type MentionPart = string | { text: string; id: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The names of the cards an answer cited, as name -> card number, for finding them in its text. The name is the
 * host's (from its card data) or else the citation's title without the trailing " (ID)". First citation wins a name.
 */
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

/**
 * Cuts `text` at the card mentions that have a picture: card numbers anywhere, and the whole-word, case-sensitive
 * names of cards cited in the same answer (longest name first, so "Monkey.D.Luffy" wins over "Luffy").
 */
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
