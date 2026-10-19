/**
 * The comprehensive rules split into numbered sections ("7-1-3-2"), and a lookup by section
 * number or by words. Parsed from the PDF's lines at runtime; the text is never stored in the repo.
 */

export type RuleSection = { id: string; text: string };
export type RulesDoc = { title: string; version: string | null; updated: string | null; sections: RuleSection[] };

// The PDF numbers some sections with dots ("8.4. Activation and Resolution"); those become "8-4".
const SECTION = /^(\d{1,2}(?:[-.]\d{1,3})*)\.\s*(.*)$/;
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
      const id = m[1]!.replace(/\./g, "-");
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

/** Question filler that says nothing about the rules. Game words (turn, play, draw, life, don, counter...) stay. */
const STOPWORDS = new Set(
  "a an the i me my mine we our you your yours own it its is are was were be been am do does did done can could would should will what whats when whenever how why which who if then than so to of in on at for with from by as this that these those there get gets got happen happens and or but any also just about into".split(" "),
);

/**
 * Player slang and everyday wording, mapped to the terms the official rules use. Keys are whole words or phrases
 * (matched on word boundaries, longest first); a phrase in the values is matched as a phrase.
 */
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "summoning sickness": ["cannot attack on the turn in which they are played", "rush"],
  "summoning sick": ["cannot attack on the turn in which they are played", "rush"],
  "knocked out": ["k.o."],
  "knock out": ["k.o."],
  attach: ["giving", "given"],
  attached: ["giving", "given"],
  attaching: ["giving", "given"],
  "deck out": ["0 cards in your deck", "0 cards in their deck"],
  "decks out": ["0 cards in your deck", "0 cards in their deck"],
  decked: ["0 cards in your deck", "0 cards in their deck"],
  "runs out": ["0 cards in your deck", "0 cards in their deck"],
  "run out": ["0 cards in your deck", "0 cards in their deck"],
  "life trigger": ["[trigger]"],
  counter: ["counter", "counter step"],
  "take damage": ["damage"],
  "takes damage": ["damage"],
  hit: ["damage"],
  hits: ["damage"],
  tap: ["rested"],
  tapped: ["rested"],
  untap: ["active", "refresh"],
  untapped: ["active", "refresh"],
  "going first": ["first turn", "going first"],
  "go first": ["first turn", "going first"],
  "first turn": ["first turn", "going first"],
  don: ["don!!"],
  dons: ["don!!"],
  mulligan: ["redraw"],
  field: ["character area"],
  "board full": ["up to 5 character cards"],
  "full board": ["up to 5 character cards"],
  "5 characters": ["up to 5 character cards"],
  "five characters": ["up to 5 character cards"],
};
const SYNONYM_KEYS = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
const KO = "\u0001"; // stands in for "k.o." while the query is split on punctuation

/** The terms to look for in rules or Q&A text: slang mapped to official wording, stopwords dropped, "k.o." kept whole. */
export function queryTerms(q: string): string[] {
  let text = ` ${q.toLowerCase().replace(/[’‘]/g, "'")} `.replace(/\bk\.?o\.?(?:'?d|ed)?(?![a-z0-9])/g, ` ${KO} `);
  const out: string[] = [];
  for (const key of SYNONYM_KEYS) {
    const re = new RegExp(`(?<![a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "g");
    if (re.test(text)) {
      out.push(...SYNONYMS[key]!);
      text = text.replace(re, " ");
    }
  }
  const plain = text
    .split(/[^a-z0-9!+\u0001-]+/)
    .map((w) => (w === KO ? "k.o." : w))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set([...out, ...plain])];
}

/**
 * Sections ranked by the rarity of the query's terms they contain (each weighs log(sections / sections containing it)),
 * so a question's distinctive words decide the order. Ties keep rule order.
 */
export function searchRules(doc: RulesDoc, query: string, limit = 8): RuleSection[] {
  const found = queryTerms(query);
  if (!found.length) return [];
  const texts = doc.sections.map((s) => s.text.toLowerCase());
  const weight = new Map<string, number>();
  for (const t of found) {
    const df = texts.filter((x) => x.includes(t)).length;
    if (df) weight.set(t, Math.log(1 + doc.sections.length / df));
  }
  const terms = [...weight.keys()];
  const phrase = query.trim().toLowerCase();
  return doc.sections
    .map((s, i) => {
      const text = texts[i]!;
      let score = 0;
      for (const t of terms) if (text.includes(t)) score += weight.get(t)!;
      const total = [...weight.values()].reduce((a, b) => a + b, 0);
      if (phrase.length > 3 && text.includes(phrase)) score += total;
      // A heading that is just the phrase ("[Blocker]") is where that term is defined.
      if (text.replace(/[[\]]/g, "").trim() === phrase.replace(/[[\]]/g, "")) score += total + 1;
      return { s, i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.s);
}
