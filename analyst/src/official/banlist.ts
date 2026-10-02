/**
 * The official banned / restricted / banned-pair list, parsed from Bandai's news page. The page shows
 * the list in force plus announced changes with their start date; changes apply once that date passes.
 */

export type BanList = {
  banned: string[];
  /** Restricted cards: at most one copy (the page states the limit; one is the only limit used so far). */
  restricted: string[];
  /** Each pair cannot share a deck. */
  bannedPairs: [string, string][];
  /** Announced changes not in force yet, as of the day the list was read. */
  upcoming: { effective: string; banned: string[]; restricted: string[]; unbanned: string[] }[];
  sourceUrl: string;
};

const CARD_ID = /\b(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})\b/g;
const ids = (html: string) => [...new Set(html.match(CARD_ID) ?? [])];
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

type Block = { tag: "h3" | "h4" | "h5" | "ul"; html: string };

function blocks(html: string): Block[] {
  return [...html.matchAll(/<(h3|h4|h5|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({ tag: m[1]!.toLowerCase() as Block["tag"], html: m[2]! }));
}

/** "October 12, 2026" -> "2026-10-12"; null when the heading has no date. */
export function isoDate(text: string): string | null {
  const m = /([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (!m) return null;
  const month = new Date(`${m[1]} 1, 2000`).getMonth();
  if (Number.isNaN(month)) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

export function parseBanList(html: string, today: string, sourceUrl: string): BanList {
  const list: BanList = { banned: [], restricted: [], bannedPairs: [], upcoming: [], sourceUrl };
  let scope: "current" | BanList["upcoming"][number] | null = null;
  let category: "banned" | "restricted" | "pair" | "unbanned" | null = null;
  for (const b of blocks(html)) {
    const title = plain(b.html).toLowerCase();
    if (b.tag === "h3") {
      if (title.includes("active restriction")) scope = "current";
      else if (title.includes("effective")) {
        const effective = isoDate(plain(b.html));
        scope = effective ? { effective, banned: [], restricted: [], unbanned: [] } : null;
        if (scope) list.upcoming.push(scope);
      } else scope = null;
      category = null;
      continue;
    }
    if (b.tag === "h4") {
      category = /pair/.test(title)
        ? "pair"
        : /remov|lift|no longer|unban/.test(title)
          ? "unbanned"
          : /restrict/.test(title)
            ? "restricted"
            : /ban/.test(title)
              ? "banned"
              : null;
      continue;
    }
    if (!scope || !category) continue;
    const found = ids(b.html);
    if (!found.length) continue;
    if (scope === "current") {
      if (category === "pair" && b.tag === "ul" && found.length === 2) list.bannedPairs.push([found[0]!, found[1]!]);
      else if (category === "banned") list.banned.push(...found);
      else if (category === "restricted") list.restricted.push(...found);
    } else if (category !== "pair") {
      scope[category].push(...found);
    }
  }
  // Announced changes whose date has come are part of the list in force.
  for (const change of list.upcoming.filter((u) => u.effective <= today)) {
    list.banned = [...new Set([...list.banned.filter((id) => !change.unbanned.includes(id)), ...change.banned])];
    list.restricted = [...new Set([...list.restricted.filter((id) => !change.unbanned.includes(id)), ...change.restricted])];
  }
  list.upcoming = list.upcoming.filter((u) => u.effective > today);
  list.banned = [...new Set(list.banned)];
  return list;
}

export type BanProblem = { cards: string[]; problem: string };

/** What breaks the ban list in a deck (leader included). */
export function banListProblems(list: BanList, cards: readonly { id: string; copies: number }[], leaderId: string | null): BanProblem[] {
  const copies = new Map<string, number>();
  for (const c of cards) copies.set(c.id, (copies.get(c.id) ?? 0) + c.copies);
  if (leaderId) copies.set(leaderId, (copies.get(leaderId) ?? 0) + 1);
  const problems: BanProblem[] = [];
  for (const id of list.banned) if (copies.has(id)) problems.push({ cards: [id], problem: `${id} is banned.` });
  for (const id of list.restricted) {
    if ((copies.get(id) ?? 0) > 1) problems.push({ cards: [id], problem: `${id} is restricted to 1 copy.` });
  }
  for (const [a, b] of list.bannedPairs) {
    if (copies.has(a) && copies.has(b)) problems.push({ cards: [a, b], problem: `${a} and ${b} are a banned pair and can't be in the same deck.` });
  }
  return problems;
}
