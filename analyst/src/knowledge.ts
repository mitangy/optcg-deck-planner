/**
 * Tool answers built from the official material (rules, FAQ, errata, ban list), shaped for the model:
 * section numbers and dates kept so it can cite them, and a note whenever a source couldn't be read.
 */
import { normalizeStatsCardId } from "@optcg/deck-analytics";
import type { Catalog } from "./catalog";
import type { Deck } from "./decks";
import { banListProblems, type BanList } from "./official/banlist";
import { within, type OfficialLibrary } from "./official/library";
import { searchQa } from "./official/qa";
import { searchRules, sectionPath, sectionWithChildren } from "./official/rules";

const WAIT_MS = 45_000;

const unavailable = (what: string, lib: OfficialLibrary) =>
  `Couldn't read the official ${what} from ${lib.baseUrl} just now. Say so, and answer from the card text with that caveat.`;

export async function rulesLookup(lib: OfficialLibrary, q: { section?: string; query?: string; limit?: number }) {
  const [doc, faq] = await Promise.all([within(lib.rules(), WAIT_MS).catch(() => undefined), within(lib.faq(), WAIT_MS).catch(() => undefined)]);
  const notes: string[] = [];
  if (!doc) notes.push(unavailable("comprehensive rules", lib));
  const limit = q.limit ?? 6;
  let sections: { id: string; path: string; text: string; children?: { id: string; text: string }[] }[] = [];
  if (doc && q.section) {
    const id = q.section.trim().replace(/\.$/, "").replace(/\./g, "-");
    const found = sectionWithChildren(doc, id, 40);
    if (!found.length) notes.push(`There is no section ${id} in the comprehensive rules.`);
    sections = found.map((s) => ({ id: s.id, path: sectionPath(doc, s.id), text: s.text }));
  } else if (doc && q.query) {
    sections = searchRules(doc, q.query, limit).map((s) => {
      // A short hit is usually a heading ("[Blocker]"); its sub-rules carry the meaning.
      const children = s.text.length < 40 ? sectionWithChildren(doc, s.id, 8).slice(1).map((c) => ({ id: c.id, text: c.text })) : undefined;
      return { id: s.id, path: sectionPath(doc, s.id), text: s.text, children };
    });
  }
  const qa = q.query && faq ? searchQa(faq.general, q.query, Math.max(limit, 6)).map((e) => ({ category: e.label, question: e.question, answer: e.answer })) : [];
  return {
    source: doc
      ? { title: doc.title, version: doc.version, updated: doc.updated, url: lib.url("/pdf/rule_comprehensive.pdf") }
      : { url: lib.url("/pdf/rule_comprehensive.pdf") },
    sections,
    generalQa: qa,
    notes: [...notes, "Cite rules by section number (e.g. 7-1-2-1). Card text overrides the comprehensive rules (1-3-1)."],
  };
}

function banStatus(list: BanList | undefined, id: string) {
  if (!list) return "unknown";
  if (list.banned.includes(id)) return "banned";
  if (list.restricted.includes(id)) return "restricted to 1 copy";
  const pairs = list.bannedPairs.filter((p) => p.includes(id)).map((p) => p.find((x) => x !== id)!);
  if (pairs.length) return `can't share a deck with ${pairs.join(", ")}`;
  const soon = list.upcoming.find((u) => u.banned.includes(id) || u.restricted.includes(id));
  if (soon) return `${soon.banned.includes(id) ? "banned" : "restricted to 1 copy"} from ${soon.effective}`;
  return "legal";
}

export async function cardRulings(lib: OfficialLibrary, catalog: Catalog, rawIds: readonly string[]) {
  const ids = [...new Set(rawIds.map((r) => normalizeStatsCardId(r.trim().toUpperCase())))];
  const [faq, errata, list] = await Promise.all([
    within(lib.faq(), WAIT_MS).catch(() => undefined),
    within(lib.errata(), WAIT_MS).catch(() => undefined),
    within(lib.banList(), WAIT_MS).catch(() => undefined),
  ]);
  const notes: string[] = [];
  if (!faq) notes.push(unavailable("FAQ", lib));
  else if (faq.failed.length) notes.push(`${faq.failed.length} of ${faq.files} official FAQ files couldn't be read, so rulings may be missing.`);
  if (!errata) notes.push(unavailable("errata list", lib));
  if (!list) notes.push(unavailable("ban list", lib));
  const cards = ids.map((id) => {
    const card = catalog.cards.get(id);
    const own = faq?.entries.filter((e) => e.cardId === id) ?? [];
    const mentioned = faq?.entries.filter((e) => e.cardId !== id && `${e.question} ${e.answer}`.includes(id)) ?? [];
    return {
      id,
      name: card?.name ?? null,
      known: Boolean(card),
      banStatus: banStatus(list, id),
      errata: (errata ?? []).filter((e) => e.cardId === id).map(({ date, before, after }) => ({ date, before, after })),
      rulings: own.slice(0, 20).map(({ question, answer }) => ({ question, answer })),
      moreRulings: Math.max(0, own.length - 20),
      mentionedIn: mentioned.slice(0, 6).map((e) => ({ cardId: e.cardId, cardName: e.label, question: e.question, answer: e.answer })),
    };
  });
  return { cards, source: lib.url("/rules/faq/"), notes };
}

export async function banListView(lib: OfficialLibrary, catalog: Catalog) {
  const list = await within(lib.banList(), WAIT_MS).catch(() => undefined);
  if (!list) return { available: false, notes: [unavailable("ban list", lib)] };
  const named = (id: string) => ({ id, name: catalog.cards.get(id)?.name ?? null });
  return {
    available: true,
    banned: list.banned.map(named),
    restricted: list.restricted.map(named),
    bannedPairs: list.bannedPairs.map((p) => p.map(named)),
    upcoming: list.upcoming.map((u) => ({
      effective: u.effective,
      banned: u.banned.map(named),
      restricted: u.restricted.map(named),
      unbanned: u.unbanned.map(named),
    })),
    source: list.sourceUrl,
  };
}

/** Ban list problems for a deck now, and any that announced changes will add. */
export async function deckBanCheck(lib: OfficialLibrary, deck: Deck) {
  const list = await within(lib.banList(), 15_000).catch(() => undefined);
  if (!list) return { checked: false, problems: [], upcoming: [], note: unavailable("ban list", lib) };
  const upcoming = list.upcoming.flatMap((u) => {
    const next: BanList = { ...list, banned: [...list.banned, ...u.banned], restricted: [...list.restricted, ...u.restricted], bannedPairs: [] };
    const now = new Set(banListProblems(list, deck.cards, deck.leaderId).map((p) => p.problem));
    return banListProblems(next, deck.cards, deck.leaderId)
      .filter((p) => !now.has(p.problem))
      .map((p) => ({ ...p, effective: u.effective }));
  });
  return { checked: true, problems: banListProblems(list, deck.cards, deck.leaderId), upcoming };
}
