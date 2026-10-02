/**
 * The strategy playbook: one markdown note per leader in analyst/playbook (game plan, key cards,
 * mulligan, lines and cheese, matchups), plus general.md. Notes are hand-edited in the repo; each
 * says which set it was written for, so advice from an older format is flagged as possibly stale.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type PlaybookNote = {
  leader: string;
  name: string;
  colors: string[];
  format: string;
  updated: string;
  status: string;
  source: string;
  confidence: string;
  /** "## " sections, by heading. */
  sections: Record<string, string>;
  /** "### vs <leader id> ..." subsections of "## Matchups", by opponent leader id. */
  matchups: Record<string, { heading: string; text: string }>;
};

const DEFAULT_DIR = fileURLToPath(new URL("../playbook", import.meta.url));

function frontMatter(raw: string): { meta: Record<string, string | string[]>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string | string[]> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!kv) continue;
    const value = kv[2]!;
    meta[kv[1]!] = value.startsWith("[")
      ? value
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : value.replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2]! };
}

const str = (v: string | string[] | undefined, fallback = "") => (Array.isArray(v) ? v.join(", ") : (v ?? fallback));

export function parseNote(raw: string): PlaybookNote | null {
  const { meta, body } = frontMatter(raw);
  const leader = str(meta.leader).toUpperCase();
  if (!leader) return null;
  const sections: Record<string, string> = {};
  const matchups: PlaybookNote["matchups"] = {};
  for (const part of body.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim();
    const text = nl < 0 ? "" : part.slice(nl + 1).trim();
    sections[heading] = text;
    if (heading.toLowerCase() !== "matchups") continue;
    for (const sub of text.split(/^### /m).slice(1)) {
      const subNl = sub.indexOf("\n");
      const subHeading = (subNl < 0 ? sub : sub.slice(0, subNl)).trim();
      const id = /\b(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\b/i.exec(subHeading)?.[1]?.toUpperCase();
      if (id) matchups[id] = { heading: subHeading, text: subNl < 0 ? "" : sub.slice(subNl + 1).trim() };
    }
  }
  return {
    leader,
    name: str(meta.name, leader),
    colors: Array.isArray(meta.colors) ? meta.colors : meta.colors ? [meta.colors] : [],
    format: str(meta.format),
    updated: str(meta.updated),
    status: str(meta.status, "draft"),
    source: str(meta.source),
    confidence: str(meta.confidence),
    sections,
    matchups,
  };
}

export type Playbook = { notes: Map<string, PlaybookNote>; general: PlaybookNote | null };

export function loadPlaybook(dir = DEFAULT_DIR): Playbook {
  const notes = new Map<string, PlaybookNote>();
  let general: PlaybookNote | null = null;
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
  } catch {
    return { notes, general };
  }
  for (const f of files) {
    const note = parseNote(readFileSync(`${dir}/${f}`, "utf8"));
    if (!note) continue;
    if (note.leader === "GENERAL") general = note;
    else notes.set(note.leader, note);
  }
  return { notes, general };
}

const setNumber = (format: string) => Number(/^OP(\d+)/i.exec(format)?.[1] ?? NaN);

/** The newest booster ("OP17") in the catalog; a set with only a few preview cards doesn't count yet. */
export function newestFormat(cardIds: Iterable<string>, minCards = 50): string {
  const counts = new Map<number, number>();
  for (const id of cardIds) {
    const n = Number(/^OP(\d{2})-/.exec(id)?.[1] ?? 0);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const newest = Math.max(0, ...[...counts].filter(([, c]) => c >= minCards).map(([n]) => n));
  return `OP${String(newest).padStart(2, "0")}`;
}

const meta = (n: PlaybookNote, currentFormat: string) => {
  const written = setNumber(n.format);
  const current = setNumber(currentFormat);
  return {
    leader: n.leader,
    name: n.name,
    colors: n.colors,
    format: n.format,
    updated: n.updated,
    status: n.status,
    confidence: n.confidence,
    source: n.source,
    stale: Number.isFinite(written) && Number.isFinite(current) && written < current,
  };
};

export type PlaybookQuery = { leader?: string; opponent?: string; card?: string };

export function queryPlaybook(book: Playbook, q: PlaybookQuery, currentFormat: string) {
  const leader = q.leader?.trim().toUpperCase();
  const opponent = q.opponent?.trim().toUpperCase();
  const card = q.card?.trim().toUpperCase();
  const index = [...book.notes.values()].map((n) => meta(n, currentFormat));
  const notes: string[] = [];
  if (!leader && !card) {
    return { currentFormat, notes: index, general: book.general ? book.general.sections : null };
  }
  if (card) {
    const hits = [...book.notes.values()].filter((n) => Object.values(n.sections).some((s) => s.toUpperCase().includes(card)));
    return {
      currentFormat,
      card,
      mentionedIn: hits.map((n) => ({
        ...meta(n, currentFormat),
        lines: Object.values(n.sections)
          .flatMap((s) => s.split("\n"))
          .filter((l) => l.toUpperCase().includes(card)),
      })),
    };
  }
  const note = leader ? book.notes.get(leader) : undefined;
  if (!note) notes.push(`No playbook note for ${leader} yet; reason from the card data and say the advice is your own judgement.`);
  const opponentNote = opponent ? book.notes.get(opponent) : undefined;
  if (note && meta(note, currentFormat).stale) notes.push(`The ${note.name} note was written for ${note.format}; newer sets may have changed it.`);
  if (note?.status === "draft") notes.push("Notes marked draft haven't been reviewed by a player yet; present them as a starting point.");
  if (opponent) {
    return {
      currentFormat,
      leader: note ? meta(note, currentFormat) : null,
      opponent: opponentNote ? meta(opponentNote, currentFormat) : null,
      fromLeaderSide: note?.matchups[opponent!] ?? null,
      fromOpponentSide: leader ? (opponentNote?.matchups[leader] ?? null) : null,
      leaderGamePlan: note?.sections["Game plan"] ?? null,
      opponentGamePlan: opponentNote?.sections["Game plan"] ?? null,
      notes,
    };
  }
  return { currentFormat, leader: note ? meta(note, currentFormat) : null, sections: note?.sections ?? null, notes };
}
