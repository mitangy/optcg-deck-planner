/** Leader page URLs (#914): `/leaders/op17-039-rocks-d-xebec`, with the bare card id `/leaders/op17-039` redirecting to it. */

/** Same shapes the backend accepts for a card id: promo `P-117` or set `OP17-039`. */
const LEADER_ID_AT_START = /^(p-\d{3}|[a-z]{2,4}\d{2}-\d{3})(?:-(.*))?$/;

/** "Rocks.D.Xebec" → "rocks-d-xebec", "Luffy & Ace" → "luffy-ace". */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "OP17-039" + "Rocks.D.Xebec" → "op17-039-rocks-d-xebec". A leader with no name is just its id. */
export function leaderSlug(leaderId: string, name: string): string {
  const id = leaderId.trim().toLowerCase();
  const tail = slugifyName(name);
  return tail ? `${id}-${tail}` : id;
}

export function leaderPath(leader: { leader_id: string; name: string }): string {
  return `/leaders/${leaderSlug(leader.leader_id, leader.name)}`;
}

/** The card id a slug starts with, upper-cased ("op17-039-rocks-d-xebec" → "OP17-039"), or null when it does not start with one. */
export function parseLeaderSlug(slug: string): { leaderId: string; nameSlug: string } | null {
  const m = LEADER_ID_AT_START.exec(slug.trim().toLowerCase());
  return m ? { leaderId: m[1].toUpperCase(), nameSlug: m[2] ?? "" } : null;
}

export type LeaderRoute<L> =
  /** The slug is the leader's canonical one. */
  | { kind: "page"; leader: L }
  /** A bare id or an out-of-date name part: send the visitor (and crawlers) to the canonical URL. */
  | { kind: "redirect"; to: string; leader: L }
  | { kind: "unknown"; leaderId: string | null };

/** What `/leaders/:slug` should do, given the leaders we know about. */
export function resolveLeaderRoute<L extends { leader_id: string; name: string }>(slug: string, leaders: readonly L[]): LeaderRoute<L> {
  const parsed = parseLeaderSlug(slug);
  if (!parsed) return { kind: "unknown", leaderId: null };
  const leader = leaders.find((l) => l.leader_id.toUpperCase() === parsed.leaderId);
  if (!leader) return { kind: "unknown", leaderId: parsed.leaderId };
  const canonical = leaderSlug(leader.leader_id, leader.name);
  return slug === canonical ? { kind: "page", leader } : { kind: "redirect", to: `/leaders/${canonical}`, leader };
}
