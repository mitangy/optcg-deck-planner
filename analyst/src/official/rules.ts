/**
 * The comprehensive rules split into numbered sections ("7-1-3-2"), and a lookup by section
 * number or by words. Parsed from the PDF's lines at runtime; the text is never stored in the repo.
 */

export type RuleSection = { id: string; text: string };
export type RulesDoc = { title: string; version: string | null; updated: string | null; sections: RuleSection[] };

const SECTION = /^(\d{1,2}(?:-\d{1,3})*)\.\s*(.*)$/;
const PAGE_NUMBER = /^\d{1,3}$/;

const parentOf = (id: string) => (id.includes("-") ? id.slice(0, id.lastIndexOf("-")) : null);

/**
 * A line opens a section when it starts with a number that fits the outline: a child of a section we
 * already have, or the next chapter. Wrapped lines that happen to start with a number stay in the text.
 */
export function parseRules(lines: readonly string[]): RulesDoc {
  const sections: RuleSection[] = [];
  const byId = new Map<string, RuleSection>();
  let version: string | null = null;
  let updated: string | null = null;
  let chapter = 0;
  let current: RuleSection | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_NUMBER.test(line) || /\.{5,}/.test(line)) continue;
    version ??= /^Version\s+([\d.]+)/i.exec(line)?.[1] ?? null;
    updated ??= /^Last updated:\s*(.+)$/i.exec(line)?.[1] ?? null;
    const m = SECTION.exec(line);
    if (m) {
      const id = m[1]!;
      const parent = parentOf(id);
      // Chapters are short capitalised titles ("2. Card Information"), unlike a wrapped "2. may ..." line.
      const fits = parent ? byId.has(parent) && !byId.has(id) : Number(id) === chapter + 1 && /^[A-Z][^.]{0,60}$/.test(m[2]!.trim());
      if (fits) {
        if (!parent) chapter = Number(id);
        current = { id, text: m[2]!.trim() };
        sections.push(current);
        byId.set(id, current);
        continue;
      }
    }
    if (current) current.text = `${current.text} ${line}`.trim();
  }
  return { title: "ONE PIECE CARD GAME Comprehensive Rules", version, updated, sections };
}

const depth = (id: string) => id.split("-").length;

/** Chapter and parent headings for a section, e.g. "7. Card Attacks and Battles > 7-1. Attack Step". */
export function sectionPath(doc: RulesDoc, id: string): string {
  const parts: string[] = [];
  for (let p = parentOf(id); p; p = parentOf(p)) {
    const s = doc.sections.find((x) => x.id === p);
    if (s && depth(p) <= 2) parts.unshift(`${p}. ${s.text.slice(0, 60)}`);
  }
  return parts.join(" > ");
}

/** A section and everything under it, in order. */
export function sectionWithChildren(doc: RulesDoc, id: string, max = 60): RuleSection[] {
  const prefix = `${id}-`;
  return doc.sections.filter((s) => s.id === id || s.id.startsWith(prefix)).slice(0, max);
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/[^a-z0-9!+-]+/)
    .filter((w) => w.length > 1);

/** Sections ranked by how many of the query's words they contain; ties keep rule order. */
export function searchRules(doc: RulesDoc, query: string, limit = 8): RuleSection[] {
  const terms = [...new Set(words(query))];
  if (!terms.length) return [];
  const phrase = query.trim().toLowerCase();
  return doc.sections
    .map((s, i) => {
      const text = s.text.toLowerCase();
      let score = terms.filter((t) => text.includes(t)).length;
      if (phrase.length > 3 && text.includes(phrase)) score += terms.length;
      // A heading that is just the phrase ("[Blocker]") is where that term is defined.
      if (text.replace(/[[\]]/g, "").trim() === phrase.replace(/[[\]]/g, "")) score += terms.length + 1;
      return { s, i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.s);
}
