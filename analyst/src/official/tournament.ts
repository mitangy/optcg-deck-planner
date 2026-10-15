/**
 * Bandai's Tournament Rules Manual (event rules: time, rounds, penalties, deck lists), split into its numbered
 * sections ("3.5 Match Structure") and searched by words. Parsed from the PDF's lines at runtime; the text is
 * never stored in the repo. These are Organized Play rules for running events, not the rules of the game.
 */
import { queryTerms } from "./rules";

export type TournamentSection = { id: string; title: string; text: string };
export type TournamentDoc = { title: string; updated: string | null; sections: TournamentSection[] };

// "3.5 Match Structure", "2.4.1 Cards". The capital letter keeps "2.5 inches ..." style wraps out.
const HEADING = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?\s+([A-Z].*)$/;
const PAGE_NUMBER = /^\d{1,3}$/;

/**
 * A line opens a section when its number fits the outline: the next chapter ("4.0"), a later minor number inside the
 * current chapter ("4.3"), or a later sub-number under an existing section ("2.4.2"). Contents lines (dotted
 * leaders), page numbers and numbered list items ("1. Register ...", which have no minor number) stay out of the headings.
 */
export function parseTournamentRules(lines: readonly string[]): TournamentDoc {
  const sections: TournamentSection[] = [];
  const byId = new Map<string, TournamentSection>();
  let updated: string | null = null;
  let chapter = 0;
  let minor = 0;
  let sub = 0;
  let current: TournamentSection | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_NUMBER.test(line) || /\.{5,}/.test(line)) continue;
    updated ??= /^Last Updated:\s*(.+)$/i.exec(line)?.[1]?.trim() ?? null;
    const m = HEADING.exec(line);
    if (m) {
      const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? undefined : Number(m[3])];
      const id = c === undefined ? `${a}.${b}` : `${a}.${b}.${c}`;
      let fits = false;
      if (c !== undefined) fits = a === chapter && b === minor && c > sub;
      else if (b === 0) fits = a === chapter + 1;
      else fits = a === chapter && b > minor;
      if (fits && !byId.has(id)) {
        if (c !== undefined) sub = c;
        else if (b === 0) [chapter, minor, sub] = [a, 0, 0];
        else [minor, sub] = [b, 0];
        current = { id, title: m[4]!.trim(), text: "" };
        sections.push(current);
        byId.set(id, current);
        continue;
      }
    }
    if (current) current.text = `${current.text} ${line}`.trim();
  }
  return { title: "Bandai Organized Play Tournament Rules Manual", updated, sections };
}

/** "Time runs out" is deck-out slang to the game rules' search; here it means the round timer, which the manual calls "time is called". */
const eventWording = (query: string) =>
  query.replace(/\b(?:time (?:runs? out|expires?|is up|limit)|(?:goes|go|went|going) to time|out of time|time out)\b/gi, "time is called");

/**
 * Sections ranked by the rarity of the query's terms they contain (each weighs log(sections / sections containing it)),
 * counting double when the term is in the title. Ties keep manual order.
 */
export function searchTournamentRules(doc: TournamentDoc, query: string, limit = 3): TournamentSection[] {
  const found = queryTerms(eventWording(query));
  if (!found.length) return [];
  const heads = doc.sections.map((s) => s.title.toLowerCase());
  const bodies = doc.sections.map((s) => `${s.title} ${s.text}`.toLowerCase());
  const weight = new Map<string, number>();
  for (const t of found) {
    const df = bodies.filter((x) => x.includes(t)).length;
    if (df) weight.set(t, Math.log(1 + doc.sections.length / df));
  }
  return doc.sections
    .map((s, i) => {
      let score = 0;
      for (const [t, w] of weight) if (heads[i]!.includes(t)) score += 2 * w;
      else if (bodies[i]!.includes(t)) score += w;
      return { s, i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.s);
}

/**
 * At most `cap` characters of a section, taken from the stretch where the query's words occur most (earliest on ties),
 * so a long section like "End of Round Procedures" shows the paragraph that answers rather than only its first lines.
 */
export function excerpt(text: string, query: string, cap = 2000): string {
  if (text.length <= cap) return text;
  const terms = queryTerms(eventWording(query));
  const lower = text.toLowerCase();
  let best = 0;
  let bestScore = -1;
  for (let start = 0; start + cap < text.length + 100; start += 100) {
    const window = lower.slice(start, start + cap);
    const score = terms.reduce((n, t) => n + window.split(t).length - 1, 0);
    if (score > bestScore) [best, bestScore] = [start, score];
  }
  const from = best === 0 ? 0 : text.indexOf(" ", best) + 1 || best;
  const piece = text.slice(from, from + cap).trim();
  return `${from > 0 ? "… " : ""}${piece}`;
}

/**
 * Words that mean the question is about running or playing in an event rather than the game itself.
 * Bare "time" and "event" are left out: card text says "each time" and "[Event]" is a card type.
 */
const TOURNAMENT_WORDS =
  /\b(?:tournaments?|organi[sz]ed play|time (?:runs? out|is called|limit|expires?|out)|(?:goes|go|went|going) to time|out of time|extra turns?|rounds?|judges?|penalt(?:y|ies)|deck ?lists?|sleeves?|swiss|top ?cut|tie ?-?breaks?|tiebreakers?|best of|bo[135]|matches|match|warnings?|game loss|disqualif\w*|slow play|stalling|proxy|proxies|pairings?|byes?|intentional draws?|(?:local|regional|national|store|online|offline) events?|events? (?:rules?|organi[sz]er|level)|conced(?:e|es|ing))\b/i;

export function looksLikeTournamentQuestion(query: string): boolean {
  return TOURNAMENT_WORDS.test(query);
}
