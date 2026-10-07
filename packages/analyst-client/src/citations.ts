/**
 * Sources and citations in Log Pose answers. The analyst names each source `kind:id[#part]`
 * (card:OP01-006, rule:6-5-3, ruling:OP14-020#2, stats:<leader>~<opp>, playbook:<leader>[~<opp>],
 * match:<id>#t3, game:<id>#t3, deck:<hash>, odds:<shape>, lesson:<id>, and from Limitless TCG tournaments
 * tourney:<leader>[~<opp>|#<card>] and event:<limitless event id>) and sends each citation
 * with the text offset (UTF-16) it follows. Everything here is pure, so it is tested without React.
 */

export type Citation = { source: string; title: string; cited_text: string };
/** A citation placed in an answer: `at` is the offset in the answer's text it follows. */
export type PlacedCitation = Citation & { at: number };

/** Citations from a stream event or the API, as the panel can trust them: a source id, text for the rest, a sane offset. */
export function parseCitations(raw: unknown, placed: true): PlacedCitation[];
export function parseCitations(raw: unknown, placed?: false): Citation[];
export function parseCitations(raw: unknown, placed = false): Citation[] | PlacedCitation[] {
  const out: PlacedCitation[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.source !== "string" || !c.source) continue;
    const at = typeof c.at === "number" && Number.isFinite(c.at) && c.at >= 0 ? Math.floor(c.at) : 0;
    out.push({ at, source: c.source, title: typeof c.title === "string" ? c.title : "", cited_text: typeof c.cited_text === "string" ? c.cited_text : "" });
  }
  return placed ? out : out.map(({ at: _at, ...c }) => c);
}

/** Citations that arrive while an answer streams: they follow the text received so far, which is `at` long. */
export function placeAt(citations: readonly Citation[], at: number): PlacedCitation[] {
  return citations.map((c) => ({ ...c, at }));
}

/** A link the host app gave for a source, only when it is a path in the app or an http(s) address. */
export function safeLink(href: string | null | undefined): string | null {
  if (!href) return null;
  return /^(\/(?!\/)|https?:\/\/)/i.test(href) ? href : null;
}

export type SourceKind = "card" | "rule" | "ruling" | "stats" | "tourney" | "event" | "playbook" | "match" | "game" | "deck" | "odds" | "lesson" | "other";

export type ParsedSource = {
  kind: SourceKind;
  /** The part before "#": a card number, rule section, leader, match id… */
  id: string;
  /** The part after "#" (turn, ruling number, card), when there is one. */
  part?: string;
  /** For stats, tourney and playbook, the opponent in `leader~opponent`. */
  opponent?: string;
  /** For match and game sources, the turn in `#t3`. */
  turn?: number;
  raw: string;
};

const KINDS: readonly string[] = ["card", "rule", "ruling", "stats", "tourney", "event", "playbook", "match", "game", "deck", "odds", "lesson"];

export function parseSource(source: string): ParsedSource {
  const colon = source.indexOf(":");
  const head = colon > 0 ? source.slice(0, colon) : "";
  if (!KINDS.includes(head)) return { kind: "other", id: source, raw: source };
  const rest = source.slice(colon + 1);
  const hash = rest.indexOf("#");
  const id = hash < 0 ? rest : rest.slice(0, hash);
  const part = hash < 0 ? undefined : rest.slice(hash + 1);
  const out: ParsedSource = { kind: head as SourceKind, id, raw: source };
  if (part !== undefined) out.part = part;
  if ((head === "stats" || head === "tourney" || head === "playbook") && id.includes("~")) {
    const [leader, opponent] = id.split("~");
    out.id = leader!;
    out.opponent = opponent;
  }
  if ((head === "match" || head === "game") && part !== undefined) {
    const m = /^t(\d+)$/.exec(part);
    if (m) out.turn = Number(m[1]);
  }
  return out;
}

/** The short badge a source gets in lists and popovers. */
export function kindLabel(p: ParsedSource): string {
  switch (p.kind) {
    case "card":
      return "Card";
    case "rule":
      return `Rules §${p.id}`;
    case "ruling":
      return "Official ruling";
    case "stats":
      return "Win rate";
    case "tourney":
      return "Tournament";
    case "event":
      return "Tournament event";
    case "playbook":
      return "Playbook";
    case "match":
      return p.turn ? `Your match turn ${p.turn}` : "Your match";
    case "game":
      return p.turn ? `Archive game turn ${p.turn}` : "Archive game";
    case "deck":
      return "Deck check";
    case "odds":
      return "Odds";
    case "lesson":
      return "Your lesson";
    default:
      return "Source";
  }
}

/** Where a Limitless TCG tournament page lives; `event:<id>` sources link here. */
const LIMITLESS_TOURNAMENT = "https://play.limitlesstcg.com/tournament/";

/** The Limitless TCG page of an `event:` source, or null for any other source or an id that isn't a plain event id. */
export function eventLink(p: ParsedSource): string | null {
  return p.kind === "event" && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) ? `${LIMITLESS_TOURNAMENT}${p.id}` : null;
}

/** Whether a source's quote is a win-record sentence: optcgduel.app win rates (stats) and tournament records (tourney). */
export const hasRecord = (p: ParsedSource): boolean => p.kind === "stats" || p.kind === "tourney";

/** "Reviewed" or "Draft" and the set a playbook note was written for, read from its title ("Sabo playbook (Draft, OP17, stale)"). */
export function playbookStatus(title: string): { status: "Reviewed" | "Draft"; set: string; stale: boolean } | null {
  const m = /\((Draft|Reviewed), ([^,)]+)(, stale)?\)\s*$/.exec(title);
  return m ? { status: m[1] as "Reviewed" | "Draft", set: m[2]!, stale: Boolean(m[3]) } : null;
}

export type StatsDetail = { games: number; interval?: [number, number]; tooFew: boolean };

/** Games and the 95% interval out of a win-record sentence the analyst wrote ("… 65 wins in 120 games (95% interval 45.1% to 62.8%)."). */
export function statsDetail(quote: string): StatsDetail | null {
  const few = /too few games \((\d+)\)/i.exec(quote);
  if (few) return { games: Number(few[1]), tooFew: true };
  const m = /(\d+) wins in (\d+) games \(95% interval ([\d.]+)% to ([\d.]+)%\)/.exec(quote);
  return m ? { games: Number(m[2]), interval: [Number(m[3]), Number(m[4])], tooFew: false } : null;
}

export type SourceEntry = {
  /** The number shown on its markers and in the list (1-based, in order of first citation). */
  n: number;
  source: string;
  parsed: ParsedSource;
  title: string;
  /** Every distinct quote cited from it. */
  quotes: string[];
};

export type Mark = { at: number; n: number; citation: PlacedCitation };

/** The sources an answer cites, deduplicated, and one marker per citation numbered by its source. */
export function buildSources(citations: readonly PlacedCitation[]): { entries: SourceEntry[]; marks: Mark[] } {
  const byId = new Map<string, SourceEntry>();
  const marks: Mark[] = [];
  for (const c of [...citations].sort((a, b) => a.at - b.at)) {
    let entry = byId.get(c.source);
    if (!entry) {
      entry = { n: byId.size + 1, source: c.source, parsed: parseSource(c.source), title: c.title || c.source, quotes: [] };
      byId.set(c.source, entry);
    }
    if (c.cited_text && !entry.quotes.includes(c.cited_text)) entry.quotes.push(c.cited_text);
    marks.push({ at: c.at, n: entry.n, citation: c });
  }
  return { entries: [...byId.values()], marks };
}

/** Private-use characters that carry a marker through the Markdown parser: open, the mark's index, close. */
export const MARK_OPEN = "";
export const MARK_CLOSE = "";
export const MARK_RE = /(\d+)/g;
const PRIVATE = /[]/g;

/**
 * The answer's text with a marker after each citation's text, ready for the Markdown renderer.
 * A marker sits on the last visible character before its offset (never on a following blank line),
 * never splits a surrogate pair, and any private-use character already in the text is removed
 * so the model's own text can't forge a marker.
 */
export function placeMarkers(text: string, marks: readonly Mark[]): string {
  const spots = marks
    .map((m, index) => {
      let at = Math.min(Math.max(Math.trunc(m.at), 0), text.length);
      while (at > 0 && /\s/.test(text[at - 1]!)) at--;
      const code = text.charCodeAt(at - 1);
      if (at > 0 && code >= 0xd800 && code <= 0xdbff) at++;
      return { at: Math.min(at, text.length), index };
    })
    .sort((a, b) => a.at - b.at || a.index - b.index);
  let out = "";
  let from = 0;
  for (const s of spots) {
    out += text.slice(from, s.at).replace(PRIVATE, "") + `${MARK_OPEN}${s.index}${MARK_CLOSE}`;
    from = s.at;
  }
  return out + text.slice(from).replace(PRIVATE, "");
}

/** A text node cut at its markers: plain strings and marker indexes. */
export function splitMarks(text: string): (string | number)[] {
  const out: (string | number)[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(Number(m[1]));
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a popover of `size` goes next to its marker: below it when there is room, else above, and kept
 * inside the viewport (`gap` from every edge) horizontally and vertically.
 */
export function placePopover(anchor: Rect, size: { w: number; h: number }, vp: { w: number; h: number }, gap = 8): { left: number; top: number; above: boolean } {
  const w = Math.min(size.w, vp.w - gap * 2);
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - w / 2, gap), vp.w - w - gap);
  const below = anchor.top + anchor.height + 6;
  const fitsBelow = below + size.h <= vp.h - gap;
  const aboveTop = anchor.top - 6 - size.h;
  const above = !fitsBelow && aboveTop >= gap;
  const raw = above ? aboveTop : below;
  const top = Math.min(Math.max(raw, gap), Math.max(vp.h - size.h - gap, gap));
  return { left, top, above };
}
